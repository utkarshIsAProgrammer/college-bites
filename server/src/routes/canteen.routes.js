import express from "express";
import {
    registerCanteen,
    getMyCanteen,
    updateMyCanteen,
    getCanteens,
    getCanteenDetail,
} from "../controllers/canteen.controllers.js";
import { requireAuth, attachUser } from "../middlewares/auth.middleware.js";

const router = express.Router();

// vendor self-service (must be before /:id so "/mine" is not matched as an id)
router.post("/", requireAuth, attachUser, registerCanteen);
router.get("/mine", requireAuth, attachUser, getMyCanteen);
router.put("/mine", requireAuth, attachUser, updateMyCanteen);

// public marketplace listing + vendor detail with queue length
router.get("/", getCanteens);
router.get("/:id", getCanteenDetail);

export { router as canteenRoutes };
