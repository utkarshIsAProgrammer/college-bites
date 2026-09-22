import mongoose from "mongoose";

// token sequence counters: one document per canteen per day,
// incremented atomically when orders are placed
const counterSchema = new mongoose.Schema(
    {
        canteen: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Canteen",
            required: true,
        },

        // midnight of the day this counter is for
        day: {
            type: Date,
            required: true,
        },

        seq: {
            type: Number,
            default: 0,
            min: 0,
        },
    },

    { timestamps: true },
);

counterSchema.index({ canteen: 1, day: 1 }, { unique: true });

const Counter = mongoose.model("Counter", counterSchema);
export default Counter;
