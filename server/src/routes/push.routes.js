import express from "express";
import {
    getPushKey,
    subscribe,
    unsubscribe,
} from "../controllers/push.controllers.js";
import { requireAuth, attachUser } from "../middlewares/auth.middleware.js";

const router = express.Router();

// public — the client needs the VAPID key before it can ask for permission
router.get("/key", getPushKey);

// authenticated — manage this device's subscription
router.post("/subscribe", requireAuth, attachUser, subscribe);
router.post("/unsubscribe", requireAuth, attachUser, unsubscribe);

export { router as pushRoutes };
