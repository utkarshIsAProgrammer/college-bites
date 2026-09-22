import express from "express";
import {
    getMenu,
    getMenuItem,
    createMenuItem,
    updateMenuItem,
    deleteMenuItem,
} from "../controllers/menu.controllers.js";
import { requireAuth, attachUser } from "../middlewares/auth.middleware.js";

const router = express.Router();

// public marketplace reads
router.get("/", getMenu);
router.get("/:id", getMenuItem);

// vendor writes — ownership of the specific canteen is enforced
// inside the controllers (admins bypass)
router.post("/", requireAuth, attachUser, createMenuItem);
router.put("/:id", requireAuth, attachUser, updateMenuItem);
router.delete("/:id", requireAuth, attachUser, deleteMenuItem);

export { router as menuRoutes };
