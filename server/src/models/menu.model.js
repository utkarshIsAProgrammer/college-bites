import mongoose from "mongoose";

const menuSchema = new mongoose.Schema(
    {
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

const Menu = mongoose.model("Menu", menuSchema);
export default Menu;
