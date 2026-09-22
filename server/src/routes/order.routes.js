import express from "express";
import {
    createOrder,
    getMyOrders,
    getOrderById,
    cancelOrder,
} from "../controllers/order.controllers.js";
import { requireAuth, attachUser } from "../middlewares/auth.middleware.js";
import { orderLimiter } from "../middlewares/rateLimit.middleware.js";

const router = express.Router();

router.get("/", requireAuth, attachUser, getMyOrders);
router.get("/:id", requireAuth, attachUser, getOrderById);

router.post("/", requireAuth, attachUser, orderLimiter, createOrder);

router.patch("/:id/cancel", requireAuth, attachUser, cancelOrder);

export { router as orderRoutes };
