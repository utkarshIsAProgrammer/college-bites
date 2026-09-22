import mongoose from "mongoose";

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

        isOpen: {
            type: Boolean,
            default: true,
        },
    },

    { timestamps: true },
);

// one canteen per owner, and fast vendor lookups by owner
canteenSchema.index({ owner: 1 }, { unique: true });
canteenSchema.index({ isOpen: 1, name: 1 });

const Canteen = mongoose.model("Canteen", canteenSchema);
export default Canteen;
