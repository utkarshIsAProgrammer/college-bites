import express from "express";
import { uploadImage } from "../controllers/upload.controllers.js";
import { requireAuth, attachUser } from "../middlewares/auth.middleware.js";
import { uploadLimiter } from "../middlewares/rateLimit.middleware.js";

const router = express.Router();

// vendor uploads: QR codes, canteen photos, menu item shots
router.post("/", requireAuth, attachUser, uploadLimiter, uploadImage);

export { router as uploadRoutes };
