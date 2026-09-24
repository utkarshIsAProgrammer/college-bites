import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "./api.js";
import { useCanteen } from "./CanteenContext.jsx";
import { useToast } from "./toast.jsx";
import { uploadImage } from "./upload.js";
import VegDot from "./VegDot.jsx";

const EMPTY_FORM = {
    name: "",
    description: "",
    price: "",
    category: "",
    image: "",
    prepMins: "10",
    isVeg: true,
};

/**
 * Vendor dish management — the form + your-items grid. Lives on the merged
 * "My Canteen" screen so a seller never has to hunt through customer tabs
 * to run their kitchen.
 */
export default function MenuManager() {
    const { getToken } = useAuth();
    const { canteen: myCanteen, refresh: refreshCanteen } = useCanteen();
    const toast = useToast();

    const [items, setItems] = useState([]);
    const [listLoading, setListLoading] = useState(true);

    const [form, setForm] = useState(EMPTY_FORM);
    const [editingId, setEditingId] = useState(null);
    const [formError, setFormError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);

    const load = useCallback(async () => {
        if (!myCanteen?._id) return;
        setListLoading(true);
        try {
            // ?canteen=<own id> returns ALL own items — sold-out lines included
            const res = await api(`/api/menu?canteen=${myCanteen._id}`, {
                getToken,
            });
            if (res.ok) setItems(res.data.menu || []);
        } finally {
            setListLoading(false);
        }
    }, [getToken, myCanteen?._id]);

    useEffect(() => {
        load();
    }, [load]);

    const startEdit = (item) => {
        setEditingId(item._id);
        setFormError(null);
        setForm({
            name: item.name ?? "",
            description: item.description ?? "",
            price: item.price ?? "",
            category: item.category ?? "",
            image: item.image ?? "",
            prepMins: item.prepMins ?? "10",
            isVeg: item.isVeg ?? true,
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setFormError(null);
        setForm(EMPTY_FORM);
    };

    const handleImageUpload = async (file) => {
        if (!file) return;

        setUploadingImage(true);
        const result = await uploadImage(file, { getToken, folder: "menu" });
        setUploadingImage(false);

        if (!result.ok) {
            toast(result.message || "Could not read that file", "error");
            return;
        }

        setForm((f) => ({ ...f, image: result.url }));
        toast(
            result.stored === "inline"
                ? "Stored inline — add Cloudinary keys for CDN hosting"
                : "Image uploaded ✓",
        );
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError(null);
        setSaving(true);

        const body = {
            name: form.name.trim(),
            description: form.description.trim(),
            price: Number(form.price),
            category: form.category.trim(),
            image: form.image.trim(),
            prepMins: Math.max(0, Number(form.prepMins) || 0),
            isVeg: Boolean(form.isVeg),
        };

        if (
            !body.name ||
            !body.category ||
            !Number.isFinite(body.price) ||
            body.price < 0
        ) {
            setFormError(
                "Name, category and a valid non-negative price are required.",
            );
            setSaving(false);
            return;
        }

        try {
            const res = await api(
                editingId ? `/api/menu/${editingId}` : "/api/menu",
                { method: editingId ? "PUT" : "POST", getToken, body },
            );

            if (!res.ok) {
                setFormError(res.data.message || `Request failed (${res.status})`);
                return;
            }

            toast(editingId ? "Item updated" : "Item added");
            cancelEdit();
            await load();
            await refreshCanteen();
        } catch (err) {
            setFormError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Delete this menu item?")) return;

        try {
            const res = await api(`/api/menu/${id}`, {
                method: "DELETE",
                getToken,
            });
            if (!res.ok) {
                toast(res.data.message || "Delete failed", "error");
                return;
            }
            toast("Item deleted");
            await load();
            await refreshCanteen();
        } catch (err) {
            toast(err.message, "error");
        }
    };

    const handleToggle = async (item) => {
        try {
            const res = await api(`/api/menu/${item._id}`, {
                method: "PUT",
                getToken,
                body: { isAvailable: !item.isAvailable },
            });
            if (!res.ok) {
                toast(res.data.message || "Update failed", "error");
                return;
            }
            setItems((prev) =>
                prev.map((x) =>
                    x._id === item._id
                        ? { ...x, isAvailable: !item.isAvailable }
                        : x,
                ),
            );
            toast(
                item.isAvailable
                    ? `“${item.name}” marked sold out`
                    : `“${item.name}” back in stock`,
            );
        } catch (err) {
            toast(err.message, "error");
        }
    };

    // group own items by category for a tidy grid
    const grouped = (() => {
        const map = new Map();
        for (const item of items) {
            if (!map.has(item.category)) map.set(item.category, []);
            map.get(item.category).push(item);
        }
        return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    })();

    return (
        <>
            <section className="card">
                <div className="card-title">
                    <div>
                        <p className="eyebrow">
                            {editingId ? "Editing" : "New dish"}
                        </p>
                        <h3>
                            {editingId
                                ? "Edit this menu item"
                                : "Add a menu item"}
                        </h3>
                    </div>
                    {editingId && (
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={cancelEdit}
                        >
                            Cancel edit
                        </button>
                    )}
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="form-grid">
                        <div className="field">
                            <label className="label" htmlFor="mm-name">
                                Name *
                            </label>
                            <input
                                id="mm-name"
                                className="input"
                                placeholder="e.g. Veg Sandwich"
                                value={form.name}
                                onChange={(e) =>
                                    setForm({ ...form, name: e.target.value })
                                }
                                required
                            />
                        </div>
                        <div className="field">
                            <label className="label" htmlFor="mm-category">
                                Category *
                            </label>
                            <input
                                id="mm-category"
                                className="input"
                                placeholder="e.g. Snacks"
                                value={form.category}
                                onChange={(e) =>
                                    setForm({ ...form, category: e.target.value })
                                }
                                required
                            />
                        </div>
                        <div className="field">
                            <label className="label" htmlFor="mm-price">
                                Price (₹) *
                            </label>
                            <input
                                id="mm-price"
                                className="input"
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="40"
                                value={form.price}
                                onChange={(e) =>
                                    setForm({ ...form, price: e.target.value })
                                }
                                required
                            />
                        </div>
                        <div className="field">
                            <label className="label" htmlFor="mm-prep">
                                Prep time (mins)
                            </label>
                            <input
                                id="mm-prep"
                                className="input"
                                type="number"
                                min="0"
                                max="120"
                                placeholder="10"
                                value={form.prepMins}
                                onChange={(e) =>
                                    setForm({ ...form, prepMins: e.target.value })
                                }
                            />
                        </div>
                        <div className="field">
                            <label className="label" htmlFor="mm-veg">
                                Food type
                            </label>
                            <select
                                id="mm-veg"
                                className="input"
                                value={form.isVeg ? "veg" : "nonveg"}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        isVeg: e.target.value === "veg",
                                    })
                                }
                            >
                                <option value="veg">🌱 Veg</option>
                                <option value="nonveg">🍗 Non-veg</option>
                            </select>
                        </div>
                    </div>

                    <div className="field">
                        <label className="label" htmlFor="mm-image">
                            Item photo
                        </label>
                        <div className="image-picker">
                            <input
                                id="mm-image"
                                type="file"
                                accept="image/*"
                                disabled={uploadingImage}
                                onChange={(e) =>
                                    handleImageUpload(e.target.files?.[0])
                                }
                            />
                            <input
                                className="input"
                                type="text"
                                aria-label="Image URL"
                                placeholder="…or paste an image URL (https://…)"
                                value={
                                    form.image.startsWith("data:")
                                        ? ""
                                        : form.image
                                }
                                onChange={(e) =>
                                    setForm({ ...form, image: e.target.value })
                                }
                            />
                            {uploadingImage && (
                                <p className="muted image-hint">Uploading…</p>
                            )}
                            {form.image && (
                                <div className="image-preview-row">
                                    <img
                                        className="image-preview-photo"
                                        src={form.image}
                                        alt="preview"
                                        onError={(e) => {
                                            e.currentTarget.style.opacity =
                                            "0.3";
                                        }}
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-ghost-danger btn-sm"
                                        onClick={() =>
                                            setForm({ ...form, image: "" })
                                        }
                                    >
                                        Remove
                                    </button>
                                </div>
                            )}
                        </div>
                        <p className="muted image-hint">
                            Upload a file or paste any image link — a bad link
                            just fades the preview, customers see the 🍽 fallback.
                        </p>
                    </div>

                    <div className="field">
                        <label className="label" htmlFor="mm-description">
                            Description
                        </label>
                        <textarea
                            id="mm-description"
                            className="input"
                            rows={2}
                            placeholder="Short description (optional)"
                            value={form.description}
                            onChange={(e) =>
                                setForm({ ...form, description: e.target.value })
                            }
                        />
                    </div>

                    {formError && (
                        <div className="alert alert-error">{formError}</div>
                    )}

                    <button
                        className="btn btn-accent"
                        type="submit"
                        disabled={saving}
                    >
                        {saving
                            ? "Saving…"
                            : editingId
                              ? "Save changes"
                              : "Add item"}
                    </button>
                </form>
            </section>

            <section className="card">
                <div className="card-title">
                    <div>
                        <p className="eyebrow">Your menu</p>
                        <h3>
                            Dishes <span className="muted">({items.length})</span>
                        </h3>
                    </div>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={load}
                        disabled={listLoading}
                    >
                        {listLoading ? "Loading…" : "Refresh"}
                    </button>
                </div>

                {!listLoading && items.length === 0 && (
                    <p className="empty">
                        No items yet — add your first dish above.
                    </p>
                )}

                {grouped.map(([cat, catItems]) => (
                    <div key={cat} className="cat-group">
                        <div className="cat-header">
                            <h4>{cat}</h4>
                            <span className="cat-count">
                                {catItems.length}{" "}
                                {catItems.length === 1 ? "item" : "items"}
                            </span>
                        </div>
                        <div className="product-grid">
                            {catItems.map((item) => (
                                <article
                                    key={item._id}
                                    className={`product-card${item.isAvailable ? "" : " unavailable"}`}
                                >
                                    <div className="product-media">
                                        {item.image ? (
                                            <img
                                                className="product-img"
                                                src={item.image}
                                                alt=""
                                                loading="lazy"
                                                onError={(e) => {
                                                    e.currentTarget.style.display =
                                                        "none";
                                                }}
                                            />
                                        ) : (
                                            <div className="thumb-fallback">🍽</div>
                                        )}
                                        {!item.isAvailable && (
                                            <div className="soldout-veil">
                                                <span className="soldout-tag">
                                                    Sold out
                                                </span>
                                            </div>
                                        )}
                                        <div className="product-tools">
                                            <button
                                                type="button"
                                                className="tool-btn"
                                                title={
                                                    item.isAvailable
                                                        ? "Mark sold out"
                                                        : "Back in stock"
                                                }
                                                onClick={() => handleToggle(item)}
                                            >
                                                {item.isAvailable ? "⏸" : "▶"}
                                            </button>
                                            <button
                                                type="button"
                                                className="tool-btn"
                                                title="Edit"
                                                onClick={() => startEdit(item)}
                                            >
                                                ✎
                                            </button>
                                            <button
                                                type="button"
                                                className="tool-btn danger"
                                                title="Delete"
                                                onClick={() =>
                                                    handleDelete(item._id)
                                                }
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>

                                    <div className="product-body">
                                        <h5 className="product-name">
                                            <VegDot isVeg={item.isVeg} />{" "}
                                            {item.name}
                                        </h5>
                                        {item.prepMins > 0 && (
                                            <p className="product-prep">
                                                ~{item.prepMins} min
                                            </p>
                                        )}
                                        {item.description && (
                                            <p className="product-desc">
                                                {item.description}
                                            </p>
                                        )}
                                        <div className="product-foot">
                                            <span className="product-price">
                                                ₹{item.price}
                                            </span>
                                            <span className="product-vendor">
                                                {item.isAvailable
                                                    ? "In stock"
                                                    : "Sold out"}
                                            </span>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </div>
                ))}
            </section>
        </>
    );
}
