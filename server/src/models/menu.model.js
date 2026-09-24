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
    },

    { timestamps: true },
);

// query patterns: public menu listing (isAvailable + category filter,
// sorted by category/name), order-time lookups by id + availability,
// and per-vendor menu listings
menuSchema.index({ canteen: 1, isAvailable: 1, category: 1 });
menuSchema.index({ isAvailable: 1, category: 1, name: 1 });
menuSchema.index({ category: 1, name: 1 });

const Menu = mongoose.model("Menu", menuSchema);
export default Menu;
