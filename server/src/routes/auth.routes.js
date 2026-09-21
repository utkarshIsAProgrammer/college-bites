import express from "express";
import { authenticate, syncUser } from "../controllers/auth.controllers.js";

const router = express.Router();

router.get("/me", authenticate);
router.post("/sync", syncUser);

export { router as authRoutes };
