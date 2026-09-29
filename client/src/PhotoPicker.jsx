import { useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { uploadImage } from "./upload.js";
import { CameraIcon } from "./icons.jsx";

/**
 * Shared optional image picker for canteen photos.
 * Uploads via the CDN path (Cloudinary w/ inline fallback) and hands the
 * stored URL back to the parent form.
 */
export default function PhotoPicker({ value, onChange, busy, setBusy }) {
    const { getToken } = useAuth();
    const inputRef = useRef(null);
    const [err, setErr] = useState("");

    const handleFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = ""; // allow re-picking the same file
        if (!file) return;

        setErr("");
        setBusy?.(true);
        const result = await uploadImage(file, {
            getToken,
            folder: "canteen",
        });
        setBusy?.(false);

        if (result.ok) {
            onChange(result.url);
        } else {
            setErr(result.message || "Upload failed");
        }
    };

    return (
        <div className="field photo-picker">
            <span className="label">Canteen photo (optional)</span>
            <div className="image-preview-row">
                {value ? (
                    <>
                        <img
                            className="image-preview-photo"
                            src={value}
                            alt="Canteen preview"
                        />
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => onChange("")}
                        >
                            Remove
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => inputRef.current?.click()}
                            disabled={busy}
                        >
                            {busy ? (
                                "Uploading…"
                            ) : (
                                <>
                                    <CameraIcon /> Choose photo
                                </>
                            )}
                        </button>
                        <span className="muted image-hint">
                            A real photo builds trust — skip it if you're in a
                            hurry.
                        </span>
                    </>
                )}
            </div>
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={handleFile}
            />
            {err && <p className="muted reviews-error">{err}</p>}
        </div>
    );
}
