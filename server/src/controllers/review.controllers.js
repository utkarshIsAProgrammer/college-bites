import mongoose from "mongoose";
import Review from "../models/review.model.js";
import Canteen from "../models/canteen.model.js";
import Order from "../models/order.model.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const REVIEW_PAGE_SIZE = 50;

/**
 * Recomputes a canteen's rating aggregate from its reviews.
 * Rounding to one decimal keeps "4.3 ★" stable in the UI.
 */
export const refreshCanteenRating = async (canteenId) => {
    const [agg] = await Review.aggregate([
        { $match: { canteen: new mongoose.Types.ObjectId(String(canteenId)) } },
        {
            $group: {
                _id: null,
                avg: { $avg: "$rating" },
                count: { $sum: 1 },
            },
        },
    ]);

    const ratingAvg = agg ? Math.round(agg.avg * 10) / 10 : 0;
    const ratingCount = agg ? agg.count : 0;

    await Canteen.findByIdAndUpdate(canteenId, {
        $set: { ratingAvg, ratingCount },
    });

    return { ratingAvg, ratingCount };
};

// ─── customer: review a completed order ───
export const createReview = async (req, res) => {
    try {
        const { orderId, rating, comment } = req.body;

        if (!orderId || !isValidId(orderId)) {
            return res.status(400).json({
                success: false,
                message: "A valid order id is required!",
            });
        }

        const score = Number(rating);
        if (!Number.isInteger(score) || score < 1 || score > 5) {
            return res.status(400).json({
                success: false,
                message: "Rating must be a whole number from 1 to 5!",
            });
        }

        const order = await Order.findOne({
            _id: orderId,
            customer: req.user._id,
        })
            .select("canteen status")
            .lean();

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found!",
            });
        }

        if (order.status !== "completed") {
            return res.status(400).json({
                success: false,
                message:
                    "You can review this order once it has been completed!",
            });
        }

        const existing = await Review.findOne({ order: order._id })
            .select("_id")
            .lean();

        if (existing) {
            return res.status(409).json({
                success: false,
                message: "You've already reviewed this order!",
            });
        }

        const review = await Review.create({
            order: order._id,
            canteen: order.canteen,
            customer: req.user._id,
            rating: score,
            comment: comment ? String(comment).trim().slice(0, 500) : "",
        });

        const summary = await refreshCanteenRating(order.canteen);

        res.status(201).json({
            success: true,
            message: "Thanks for the review!",
            review,
            ...summary,
        });
    } catch (err) {
        // unique index on order → two taps racing each other
        if (err?.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "You've already reviewed this order!",
            });
        }

        console.error("Create review error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to save review!",
        });
    }
};

// ─── public: a canteen's reviews ───
export const getCanteenReviews = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid canteen id!",
            });
        }

        const reviews = await Review.find({ canteen: id })
            .sort({ createdAt: -1 })
            .limit(REVIEW_PAGE_SIZE)
            .populate("customer", "name")
            .lean();

        res.status(200).json({
            success: true,
            reviews,
        });
    } catch (err) {
        console.error("Get reviews error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to fetch reviews!",
        });
    }
};
