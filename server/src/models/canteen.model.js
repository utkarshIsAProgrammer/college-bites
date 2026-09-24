import mongoose from "mongoose";

// generous caps for base64 images uploaded from phones
const MAX_IMAGE_CHARS = 300_000; // ~220KB binary

const canteenSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            minLength: 2,
            maxLength: 80,
        },

        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        description: {
            type: String,
            trim: true,
            maxLength: 300,
        },

        // physical location inside the main hall, e.g. "Ground floor, east wing"
        location: {
            type: String,
            trim: true,
            maxLength: 120,
        },

        // person running the canteen and how to reach them
        contactName: {
            type: String,
            trim: true,
            maxLength: 80,
        },

        contactPhone: {
            type: String,
            trim: true,
            maxLength: 10,
        },

        // payments — vendor's UPI ID (for in-app intent payments)
        upiId: {
            type: String,
            trim: true,
            maxLength: 320,
        },

        // vendor-uploaded UPI QR image (data URL) — proof + fallback payment method
        qrImageUrl: {
            type: String,
            maxLength: MAX_IMAGE_CHARS,
        },

        // canteen profile photo (data URL or URL)
        photo: {
            type: String,
            maxLength: MAX_IMAGE_CHARS,
        },

        // opening hours as HH:MM strings, e.g. { open: "08:00", close: "20:30" }
        hours: {
            open: { type: String, trim: true },
            close: { type: String, trim: true },
        },

        isOpen: {
            type: Boolean,
            default: true,
        },

        // denormalised review aggregate — recomputed whenever a review lands,
        // so marketplace listings never need a $lookup into reviews
        ratingAvg: {
            type: Number,
            default: 0,
            min: 0,
            max: 5,
        },

        ratingCount: {
            type: Number,
            default: 0,
            min: 0,
        },
    },

    { timestamps: true },
);

// one canteen per owner, and fast vendor lookups by owner
canteenSchema.index({ owner: 1 }, { unique: true });
canteenSchema.index({ isOpen: 1, name: 1 });

export const IMAGE_CHAR_LIMIT = MAX_IMAGE_CHARS;

const Canteen = mongoose.model("Canteen", canteenSchema);
export default Canteen;
