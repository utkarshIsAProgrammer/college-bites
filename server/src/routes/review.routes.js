import express from "express";
import {
    createReview,
    getCanteenReviews,
} from "../controllers/review.controllers.js";
import { requireAuth, attachUser } from "../middlewares/auth.middleware.js";

const router = express.Router();

// public: read a canteen's reviews
router.get("/canteen/:id", getCanteenReviews);

// customer: rate a completed order
router.post("/", requireAuth, attachUser, createReview);

export { router as reviewRoutes };
