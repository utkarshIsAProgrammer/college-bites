import express from "express";
import {
    createOrder,
    getMyOrders,
    getOrderById,
    cancelOrder,
    submitPayment,
    getVendorOrders,
    updateOrderStatus,
    confirmPayment,
    getVendorStats,
} from "../controllers/order.controllers.js";
import { requireAuth, attachUser } from "../middlewares/auth.middleware.js";
import { orderLimiter } from "../middlewares/rateLimit.middleware.js";

const router = express.Router();

// ─── customer ───
router.get("/", requireAuth, attachUser, getMyOrders);
router.get("/:id", requireAuth, attachUser, getOrderById);
router.post("/", requireAuth, attachUser, orderLimiter, createOrder);
router.patch("/:id/cancel", requireAuth, attachUser, cancelOrder);
router.post("/:id/payment", requireAuth, attachUser, submitPayment);

// ─── vendor ───
router.get("/vendor/queue", requireAuth, attachUser, getVendorOrders);
router.get("/vendor/stats", requireAuth, attachUser, getVendorStats);
router.patch("/vendor/:id/status", requireAuth, attachUser, updateOrderStatus);
router.patch("/vendor/:id/payment", requireAuth, attachUser, confirmPayment);

export { router as orderRoutes };
