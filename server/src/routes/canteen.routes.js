import express from "express";
import {
    registerCanteen,
    getMyCanteen,
    updateMyCanteen,
    getCanteens,
} from "../controllers/canteen.controllers.js";
import { requireAuth, attachUser } from "../middlewares/auth.middleware.js";

const router = express.Router();

// public marketplace listing
router.get("/", getCanteens);

// vendor self-service
router.post("/", requireAuth, attachUser, registerCanteen);
router.get("/mine", requireAuth, attachUser, getMyCanteen);
router.put("/mine", requireAuth, attachUser, updateMyCanteen);

export { router as canteenRoutes };
