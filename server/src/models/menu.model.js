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

        category: {
            type: String,
            required: true,
            trim: true,
        },

        image: {
            type: String,
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
