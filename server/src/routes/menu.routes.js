import express from "express";
import {
    getMenu,
    getMenuItem,
    createMenuItem,
    updateMenuItem,
    deleteMenuItem,
    bulkSetAvailability,
} from "../controllers/menu.controllers.js";
import { requireAuth, attachUser } from "../middlewares/auth.middleware.js";

const router = express.Router();

// public marketplace reads — attachUser (optional) lets a signed-in vendor
// fetch their own sold-out items via ?canteen=<their id>
router.get("/", attachUser, getMenu);
router.get("/:id", getMenuItem);

// vendor writes — ownership of the specific canteen is enforced
// inside the controllers (admins bypass)
router.post("/", requireAuth, attachUser, createMenuItem);
router.put("/:id", requireAuth, attachUser, updateMenuItem);
router.delete("/:id", requireAuth, attachUser, deleteMenuItem);
router.patch("/availability", requireAuth, attachUser, bulkSetAvailability);

export { router as menuRoutes };
