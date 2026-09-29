import mongoose from "mongoose";
import Menu from "../models/menu.model.js";
import Canteen from "../models/canteen.model.js";
import { bumpVersion, cached } from "../lib/redis.js";

// menu writes invalidate both the menu feed and the canteen cards
// (item counts live there)
const bustMenuCaches = () =>
    Promise.all([bumpVersion("menu"), bumpVersion("canteens")]).catch(() => {});

// helper: is this a well-formed ObjectId?
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// helper: map Mongoose validation errors to a clean 400 response
const validationError = (res, err) => {
    const messages = Object.values(err.errors || {}).map((e) => e.message);
    return res.status(400).json({
        success: false,
        message: messages.join(", ") || "Invalid input!",
    });
};

// helper: resolve the requesting owner's canteen (creating it lazily from
// their user name on first use so the very first item add just works)
const requireCanteen = async (req, res) => {
    let canteen = await Canteen.findOne({ owner: req.user._id });

    if (!canteen) {
        canteen = await Canteen.create({
            name: `${req.user.name}'s Canteen`,
            owner: req.user._id,
        });
    }

    return canteen;
};

// helper: 403 unless the requesting user owns this canteen (admins pass)
const requireOwnership = async (req, res, canteenId) => {
    if (!isValidId(canteenId)) {
        res.status(400).json({
            success: false,
            message: "Invalid canteen reference!",
        });
        return false;
    }

    if (req.user.role === "admin") return true;

    const canteen = await Canteen.findById(canteenId)
        .select("owner")
        .lean();

    if (!canteen) {
        res.status(404).json({
            success: false,
            message: "Canteen not found!",
        });
        return false;
    }

    if (String(canteen.owner) !== String(req.user._id)) {
        res.status(403).json({
            success: false,
            message: "You can only manage your own canteen's menu!",
        });
        return false;
    }

    return true;
};

// Get entire menu — public marketplace feed: available items from OPEN
// canteens, with vendor names. Vendors asking for their own canteen (?canteen=<id>)
// get full fidelity — sold-out lines included — so the dashboard keeps editing them.
export const getMenu = async (req, res) => {
    try {
        const { category, canteen } = req.query;

        // ─── query-param hardening ───
        // Express hands ?x[$ne]=1 to Mongo as an OBJECT — passed through
        // unchecked it becomes a NoSQL operator injection ({$ne: null} matches
        // every doc), and stringifying it into the cache key would let one
        // poisoned entry serve every other injected filter. Drop non-strings.
        const categoryParam =
            typeof category === "string" && category.trim()
                ? category.trim().slice(0, 50)
                : null;
        const canteenParam = typeof canteen === "string" ? canteen : null;

        // only meaningful when a valid ?canteen=<id> is present; $in with an
        // empty array finds nothing, so a stray/malformed id can't over-fetch
        const mineFilter =
            canteenParam && isValidId(canteenParam)
                ? canteenParam.split(",").filter(isValidId)
                : null;

        // route is public — req.user only exists when the client sent a token
        if (mineFilter && req.user?._id) {
            const owned = await Canteen.findOne({ owner: req.user._id })
                .select("_id")
                .lean();

            if (owned && mineFilter.includes(String(owned._id))) {
                const menu = await Menu.find({
                    canteen: owned._id,
                    ...(category ? { category } : {}),
                })
                    .populate("canteen", "name location isOpen")
                    .sort({ category: 1, name: 1 })
                    .lean();

                return res.status(200).json({ success: true, menu });
            }
        }

        // public feed — Redis-cached 60s per (canteen-list, category) combo;
        // vendor "mine" reads above stay uncached so dashboards are instant
        // a comma-separated ?canteen= list filters to those canteens; a stray
        // id in the list is ignored, an all-invalid list matches nothing
        const canteenFilter = canteenParam
            ? canteenParam.split(",").filter(isValidId)
            : null;

        // cache key: "all" (no filter) / "none" (all ids invalid — must NOT
        // share the "all" slot, or a garbage filter would hit the full menu)
        const listKey = canteenFilter
            ? canteenFilter.join(",") || "none"
            : "all";

        const { data: menu } = await cached(
            `menu:pub:${listKey}:${categoryParam || "all"}`,
            60,
            async () =>
                Menu.find({
                    isAvailable: true,
                    ...(categoryParam ? { category: categoryParam } : {}),
                    ...(canteenFilter ? { canteen: { $in: canteenFilter } } : {}),
                })
                    .populate("canteen", "name location isOpen")
                    .sort({ category: 1, name: 1 })
                    .lean(),
        );

        res.status(200).json({
            success: true,
            menu,
        });
    } catch (err) {
        console.error("Get menu error:", err);

        res.status(500).json({
            success: false,
            message: "Failed to fetch menu!",
        });
    }
};

// Get single menu item (public)
export const getMenuItem = async (req, res) => {
    try {
        const { id } = req.params;

        // prevents CastError (malformed id) from crashing into the 500 handler
        if (!isValidId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid menu item id!",
            });
        }

        const item = await Menu.findOne({ _id: id })
            .populate("canteen", "name location isOpen")
            .lean();

        if (!item) {
            return res.status(404).json({
                success: false,
                message: "Menu item not found!",
            });
        }

        res.status(200).json({
            success: true,
            item,
        });
    } catch (err) {
        console.error("Get menu item error:", err);

        res.status(500).json({
            success: false,
            message: "Failed to fetch menu item!",
        });
    }
};

// Create menu item (owner scoped to their own canteen)
export const createMenuItem = async (req, res) => {
    try {
        const { name, description, price, category, image, isVeg } = req.body;

        if (!name || price === undefined || !category) {
            return res.status(400).json({
                success: false,
                message: "Name, price and category are required!",
            });
        }

        if (typeof price !== "number" || price < 0) {
            return res.status(400).json({
                success: false,
                message: "Price must be a non-negative number!",
            });
        }

        const canteen = await requireCanteen(req, res);

        const item = await Menu.create({
            canteen: canteen._id,
            name,
            description,
            price,
            category,
            image,
            isVeg: isVeg !== false,
            ...(req.body.availableFrom !== undefined && {
                availableFrom: req.body.availableFrom,
            }),
            ...(req.body.availableTo !== undefined && {
                availableTo: req.body.availableTo,
            }),
        });

        bustMenuCaches();

        res.status(201).json({
            success: true,
            message: "Menu item created successfully!",
            item,
        });
    } catch (err) {
        if (err.name === "ValidationError") {
            return validationError(res, err);
        }

        console.error("Create menu item error:", err);

        res.status(500).json({
            success: false,
            message: "Failed to create menu item!",
        });
    }
};

// Update menu item (owner of the item's canteen only)
export const updateMenuItem = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid menu item id!",
            });
        }

        const existing = await Menu.findById(id).select("canteen").lean();

        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Menu item not found!",
            });
        }

        if (!(await requireOwnership(req, res, existing.canteen))) return;

        // whitelist fields — never pass req.body straight to Mongo
        const updates = {};
        for (const key of [
            "name",
            "description",
            "price",
            "category",
            "image",
            "prepMins",
            "isAvailable",
            "isVeg",
            "availableFrom",
            "availableTo",
        ]) {
            if (req.body[key] !== undefined) updates[key] = req.body[key];
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: "No valid fields to update!",
            });
        }

        const item = await Menu.findByIdAndUpdate(id, updates, {
            returnDocument: "after",
            runValidators: true,
        });

        bustMenuCaches();

        res.status(200).json({
            success: true,
            message: "Menu item updated successfully!",
            item,
        });
    } catch (err) {
        if (err.name === "ValidationError") {
            return validationError(res, err);
        }

        console.error("Update menu item error:", err);

        res.status(500).json({
            success: false,
            message: "Failed to update menu item!",
        });
    }
};

// Bulk availability toggle — mark a whole category (or everything) in/out of stock
export const bulkSetAvailability = async (req, res) => {
    try {
        const { category, isAvailable } = req.body;

        if (typeof isAvailable !== "boolean") {
            return res.status(400).json({
                success: false,
                message: "isAvailable must be true or false!",
            });
        }

        // same operator-injection hardening as getMenu — an object here would
        // become a Mongo filter, not a category name
        const categoryParam =
            typeof category === "string" && category.trim()
                ? category.trim().slice(0, 50)
                : null;

        const canteen = await Canteen.findOne({ owner: req.user._id })
            .select("_id")
            .lean();

        if (!canteen) {
            return res.status(404).json({
                success: false,
                message: "You don't own a canteen!",
            });
        }

        const filter = { canteen: canteen._id };
        if (categoryParam) filter.category = categoryParam;

        const result = await Menu.updateMany(filter, { isAvailable });

        bustMenuCaches();

        res.status(200).json({
            success: true,
            message: `${result.modifiedCount} item(s) marked ${
                isAvailable ? "available" : "sold out"
            }!`,
            modifiedCount: result.modifiedCount,
        });
    } catch (err) {
        console.error("Bulk availability error:", err);

        res.status(500).json({
            success: false,
            message: "Failed to update items!",
        });
    }
};

// Delete menu item (owner of the item's canteen only)
export const deleteMenuItem = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid menu item id!",
            });
        }

        const existing = await Menu.findById(id).select("canteen").lean();

        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Menu item not found!",
            });
        }

        if (!(await requireOwnership(req, res, existing.canteen))) return;

        const item = await Menu.findByIdAndDelete(id);

        bustMenuCaches();

        res.status(200).json({
            success: true,
            message: "Menu item deleted successfully!",
        });
    } catch (err) {
        console.error("Delete menu item error:", err);

        res.status(500).json({
            success: false,
            message: "Failed to delete menu item!",
        });
    }
};
