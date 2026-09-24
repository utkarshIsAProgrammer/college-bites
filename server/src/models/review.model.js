import mongoose from "mongoose";

/**
 * A review is pinned to the order that earned it — one order, one review.
 * That's what keeps ratings honest: you can only rate a canteen you actually
 * ordered from, and only once the order was handed over.
 */
const reviewSchema = new mongoose.Schema(
    {
        // unique → the DB itself blocks double-reviewing an order
        order: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Order",
            required: true,
            unique: true,
        },

        canteen: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Canteen",
            required: true,
        },

        customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5,
        },

        comment: {
            type: String,
            trim: true,
            maxLength: 500,
        },
    },
    { timestamps: true },
);

// a canteen's review feed, newest first
reviewSchema.index({ canteen: 1, createdAt: -1 });

const Review = mongoose.model("Review", reviewSchema);
export default Review;
