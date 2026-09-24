import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useCanteen } from "./CanteenContext.jsx";
import { useToast } from "./toast.jsx";
import { uploadImage } from "./upload.js";
import { buildUpiLink } from "./upi.js";
import UpiQr from "./UpiQr.jsx";
import Reveal from "./Reveal.jsx";

const EMPTY = {
    name: "",
    description: "",
    location: "",
    contactName: "",
    contactPhone: "",
    upiId: "",
    qrImageUrl: "",
    photo: "",
    hoursOpen: "",
    hoursClose: "",
};

export default function VendorSettings() {
    const { getToken } = useAuth();
    const { canteen, updateCanteen, refresh } = useCanteen();
    const toast = useToast();

    const [open, setOpen] = useState(false);
    const [form, setForm] = useState(EMPTY);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [toggling, setToggling] = useState(false);
    const [uploadingKey, setUploadingKey] = useState(null);

    useEffect(() => {
        if (open && canteen) {
            setForm({
                name: canteen.name ?? "",
                description: canteen.description ?? "",
                location: canteen.location ?? "",
                contactName: canteen.contactName ?? "",
                contactPhone: canteen.contactPhone ?? "",
                upiId: canteen.upiId ?? "",
                qrImageUrl: canteen.qrImageUrl ?? "",
                photo: canteen.photo ?? "",
                hoursOpen: canteen.hours?.open ?? "",
                hoursClose: canteen.hours?.close ?? "",
            });
            setError(null);
        }
    }, [open, canteen]);

    if (!canteen) return null;

    // uploads to the CDN when configured, otherwise keeps the data URL inline
    const handleImage = async (key, file) => {
        if (!file) return;

        setUploadingKey(key);
        const result = await uploadImage(file, {
            getToken,
            folder: key === "qrImageUrl" ? "qr" : "canteen",
        });
        setUploadingKey(null);

        if (!result.ok) {
            toast(result.message || "Could not read that file", "error");
            return;
        }

        setForm((f) => ({ ...f, [key]: result.url }));

        if (result.stored === "inline") {
            toast("Stored inline — add Cloudinary keys for CDN hosting");
        } else {
            toast("Image uploaded ✓");
        }
    };

    const handleToggleOpen = async () => {
        setToggling(true);
        const result = await updateCanteen({ isOpen: !canteen.isOpen });
        setToggling(false);
        if (result.ok) {
            toast(
                canteen.isOpen
                    ? `“${canteen.name}” is now closed`
                    : `“${canteen.name}” is now open`,
            );
        } else {
            toast(result.message, "error");
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSaving(true);

        const result = await updateCanteen({
            name: form.name.trim(),
            description: form.description.trim(),
            location: form.location.trim(),
            contactName: form.contactName.trim(),
            contactPhone: form.contactPhone.trim(),
            upiId: form.upiId.trim(),
            qrImageUrl: form.qrImageUrl,
            photo: form.photo,
            hours: {
                open: form.hoursOpen,
                close: form.hoursClose,
            },
        });

        setSaving(false);

        if (result.ok) {
            toast("Canteen details saved");
            await refresh();
            setOpen(false);
        } else {
            setError(result.message);
        }
    };

    const text = (id, label, key, props = {}) => (
        <div className="field">
            <label className="label" htmlFor={id}>
                {label}
            </label>
            <input
                id={id}
                className="input"
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                {...props}
            />
        </div>
    );

    const imagePicker = (id, label, key, previewClass) => (
        <div className="field">
            <label className="label" htmlFor={id}>
                {label}
            </label>
            <div className="image-picker">
                <input
                    id={id}
                    type="file"
                    accept="image/*"
                    disabled={uploadingKey === key}
                    onChange={(e) => handleImage(key, e.target.files?.[0])}
                />
                {uploadingKey === key && (
                    <p className="muted image-hint">Uploading…</p>
                )}
                {form[key] && (
                    <div className="image-preview-row">
                        <img
                            className={previewClass}
                            src={form[key]}
                            alt="preview"
                        />
                        <button
                            type="button"
                            className="btn btn-ghost-danger btn-sm"
                            onClick={() => setForm({ ...form, [key]: "" })}
                        >
                            Remove
                        </button>
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <Reveal>
            <section className="card">
                <div className="card-title">
                    <div>
                        <p className="eyebrow">
                            <span className="eyebrow-num">No. 0</span> — Your
                            canteen
                        </p>
                        <h3>{canteen.name}</h3>
                    </div>

                    <div className="vendor-actions">
                        <span
                            className={`pill ${
                                canteen.isOpen ? "pill-green" : "pill-red"
                            }`}
                        >
                            {canteen.isOpen ? "Open" : "Closed"}
                        </span>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={handleToggleOpen}
                            disabled={toggling}
                        >
                            {canteen.isOpen ? "Close canteen" : "Open canteen"}
                        </button>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setOpen((s) => !s)}
                        >
                            {open ? "Close settings" : "Edit details"}
                        </button>
                    </div>
                </div>

                {(canteen.location || canteen.contactName) && (
                    <p className="muted vendor-meta">
                        {canteen.location && <>📍 {canteen.location} · </>}
                        {canteen.contactName && (
                            <>
                                {canteen.contactName}
                                {canteen.contactPhone
                                    ? ` · ${canteen.contactPhone}`
                                    : ""}
                            </>
                        )}
                    </p>
                )}

                {open && (
                    <form onSubmit={handleSubmit}>
                        <div className="form-grid">
                            {text("vs-name", "Canteen name *", "name", {
                                required: true,
                            })}
                            {text("vs-location", "Location in hall", "location", {
                                placeholder: "e.g. Ground floor, east wing",
                            })}
                            {text("vs-contact-name", "Contact person *", "contactName", {
                                required: true,
                            })}
                            {text("vs-contact-phone", "Contact number *", "contactPhone", {
                                type: "tel",
                                inputMode: "numeric",
                                placeholder: "e.g. 9876543210",
                                required: true,
                            })}
                        </div>

                        <div className="field">
                            <label className="label" htmlFor="vs-description">
                                Description
                            </label>
                            <textarea
                                id="vs-description"
                                className="input"
                                rows={2}
                                placeholder="What's your canteen known for?"
                                value={form.description}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        description: e.target.value,
                                    })
                                }
                            />
                        </div>

                        <p className="eyebrow">Payments — UPI</p>
                        <div className="form-grid">
                            {text("vs-upi", "UPI ID", "upiId", {
                                placeholder: "e.g. ramesh@okhdfcbank",
                            })}
                            <div className="field">
                                <span className="label">
                                    Customers pay by scanning your QR or via
                                    your UPI ID
                                </span>
                            </div>
                        </div>
                        {imagePicker(
                            "vs-qr",
                            "Payment QR image",
                            "qrImageUrl",
                            "image-preview-qr",
                        )}

                        <p className="image-hint">
                            {form.upiId.trim()
                                ? "With a UPI ID we generate a fresh QR per order with the exact amount already filled in — customers can't over- or underpay."
                                : "Add your UPI ID above to unlock exact-amount QR codes. Your uploaded QR still works without it, but customers must type the amount themselves."}
                        </p>

                        {(form.upiId.trim() || form.qrImageUrl) && (
                            <div className="vendor-qr-preview">
                                <p className="label">
                                    Preview — what customers scan
                                </p>
                                <UpiQr
                                    upiLink={
                                        form.upiId.trim()
                                            ? buildUpiLink({
                                                  upiId: form.upiId.trim(),
                                                  payeeName: form.name,
                                                  amount: 100,
                                                  note: "Rush Bites preview",
                                              })
                                            : ""
                                    }
                                    uploadedQr={form.qrImageUrl}
                                    name={form.name}
                                />
                                <p className="image-hint">
                                    Shown here at a sample ₹100. Customers see
                                    this same QR with their own order total.
                                </p>
                            </div>
                        )}

                        <p className="eyebrow">Profile & hours</p>
                        {imagePicker(
                            "vs-photo",
                            "Canteen photo",
                            "photo",
                            "image-preview-photo",
                        )}
                        <div className="form-grid">
                            <div className="field">
                                <label className="label" htmlFor="vs-open-at">
                                    Opens at
                                </label>
                                <input
                                    id="vs-open-at"
                                    className="input"
                                    type="time"
                                    value={form.hoursOpen}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            hoursOpen: e.target.value,
                                        })
                                    }
                                />
                            </div>
                            <div className="field">
                                <label className="label" htmlFor="vs-close-at">
                                    Closes at
                                </label>
                                <input
                                    id="vs-close-at"
                                    className="input"
                                    type="time"
                                    value={form.hoursClose}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            hoursClose: e.target.value,
                                        })
                                    }
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="alert alert-error">{error}</div>
                        )}

                        <button
                            className="btn btn-accent"
                            type="submit"
                            disabled={saving}
                        >
                            {saving ? "Saving…" : "Save changes"}
                        </button>
                    </form>
                )}
            </section>
        </Reveal>
    );
}
