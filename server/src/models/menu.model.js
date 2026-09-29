import mongoose from "mongoose";

const menuSchema = new mongoose.Schema(
    {
        canteen: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Canteen",
            required: true,
        },

        name: {
            type: String,
            required: true,
            trim: true,
            minLength: 2,
            maxLength: 100,
        },

        description: {
            type: String,
            trim: true,
            maxLength: 500,
        },

        price: {
            type: Number,
            required: true,
            min: 0,
        },

        // veg / non-veg indicator (Indian FSSAI-style dot)
        isVeg: {
            type: Boolean,
            default: true,
        },

        category: {
            type: String,
            required: true,
            trim: true,
        },

        image: {
            type: String,
            maxLength: 300_000,
        },

        // minutes needed to prepare this item (vendor-set, used for pickup estimates)
        prepMins: {
            type: Number,
            min: 0,
            max: 120,
            default: 10,
        },

        isAvailable: {
            type: Boolean,
            default: true,
        },

        // ─── time-bound availability ("samosas 11am–2pm only") ───
        // HH:MM strings; both empty = available all day. The public listing
        // and order placement validate against the current server time.
        availableFrom: {
            type: String,
            trim: true,
            validate: {
                validator: (v) => !v || /^([01]\d|2[0-3]):[0-5]\d$/.test(v),
                message: "availableFrom must be HH:MM",
            },
        },

        availableTo: {
            type: String,
            trim: true,
            validate: {
                validator: (v) => !v || /^([01]\d|2[0-3]):[0-5]\d$/.test(v),
                message: "availableTo must be HH:MM",
            },
        },
    },

    { timestamps: true },
);

// is this item orderable at the given time (defaults to now)?
// handles overnight windows (22:00–02:00) like canteen hours do
menuSchema.methods.isOrderableAt = function (when = new Date()) {
    if (!this.isAvailable) return false;
    if (!this.availableFrom || !this.availableTo) return true;
    const toMins = (t) => {
        const [h, m] = String(t).split(":").map(Number);
        return (h || 0) * 60 + (m || 0);
    };
    const cur = when.getHours() * 60 + when.getMinutes();
    const from = toMins(this.availableFrom);
    const to = toMins(this.availableTo);
    if (to === from) return true; // zero window = all day
    return to > from ? cur >= from && cur < to : cur >= from || cur < to;
};

// query patterns: public menu listing (isAvailable + category filter,
// sorted by category/name), order-time lookups by id + availability,
// and per-vendor menu listings
menuSchema.index({ canteen: 1, isAvailable: 1, category: 1 });
menuSchema.index({ isAvailable: 1, category: 1, name: 1 });
menuSchema.index({ category: 1, name: 1 });

const Menu = mongoose.model("Menu", menuSchema);
export default Menu;
