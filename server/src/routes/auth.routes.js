import express from "express";
import { authenticate, syncUser } from "../controllers/auth.controllers.js";
import {
    authLimiter,
    authIpLimiter,
} from "../middlewares/rateLimit.middleware.js";

const router = express.Router();

router.get("/me", authLimiter, authenticate);
router.post("/sync", authLimiter, authIpLimiter, syncUser);

export { router as authRoutes };
