import express from "express";
import {
    getMenu,
    getMenuItem,
    createMenuItem,
    updateMenuItem,
    deleteMenuItem,
} from "../controllers/menu.controllers.js";
import { requireRole } from "../middlewares/role.middlewares.js";

const router = express.Router();

router.get("/", getMenu);
router.get("/:id", getMenuItem);

router.post("/", requireRole("admin", "staff"), createMenuItem);
router.put("/:id", requireRole("admin", "staff"), updateMenuItem);
router.delete("/:id", requireRole("admin", "staff"), deleteMenuItem);

export { router as menuRoutes };
