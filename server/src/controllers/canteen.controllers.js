import mongoose from "mongoose";
import Canteen from "../models/canteen.model.js";
import User from "../models/user.model.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// Indian mobile numbers: 10 digits starting 6-9, optionally +91/0 prefixed
const normalizePhone = (raw) => {
    if (!raw) return "";
    const digits = String(raw).replace(/[^0-9]/g, "");
    let local = digits;
    if (local.startsWith("91") && local.length === 12) local = local.slice(2);
    if (local.startsWith("0") && local.length === 11) local = local.slice(1);
    return /^[6-9]\d{9}$/.test(local) ? local : null;
};

// register a canteen (any signed-in user can become a vendor instantly)
export const registerCanteen = async (req, res) => { 
    try {
        const { name, description, location, contactName, contactPhone } =
            req.body;

        if (!name || !String(name).trim()) {
            return res.status(400).json({
                success: false,
                message: "Canteen name is required!",
            });
        }

        if (!contactName || !String(contactName).trim()) {
            return res.status(400).json({
                success: false,
                message: "Contact person name is required!",
            });
        }

        const phone = normalizePhone(contactPhone);
        if (!phone) {
            return res.status(400).json({
                success: false,
                message:
                    "A valid 10-digit Indian contact number is required!",
            });
        }

        const existing = await Canteen.findOne({ owner: req.user._id })
            .select("_id")
            .lean();

        if (existing) {
            return res.status(409).json({
                success: false,
                message: "You already own a canteen!",
            });
        }

        const canteen = await Canteen.create({
            name: String(name).trim(),
            description,
            location,
            contactName: String(contactName).trim(),
            contactPhone: phone,
            owner: req.user._id,
        });

        // owners need menu-write access; never demote an existing admin
        if (req.user.role === "customer") {
            await User.findByIdAndUpdate(req.user._id, { role: "staff" });
        }

        res.status(201).json({
            success: true,
            message: "Canteen registered successfully!",
            canteen,
        });
    } catch (err) {
        console.error("Register canteen error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to register canteen!",
        });
    }
};

// my canteen (owner view)
export const getMyCanteen = async (req, res) => {
    try {
        const canteen = await Canteen.findOne({ owner: req.user._id }).lean();

        res.status(200).json({
            success: true,
            canteen,
        });
    } catch (err) {
        console.error("Get my canteen error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to fetch canteen!",
        });
    }
};

// update my canteen (name, description, location, open/closed toggle)
export const updateMyCanteen = async (req, res) => {
    try {
        const updates = {};
        for (const key of ["name", "description", "location", "isOpen"]) {
            if (req.body[key] !== undefined) updates[key] = req.body[key];
        }

        if (req.body.contactName !== undefined) {
            const cn = String(req.body.contactName).trim();
            if (!cn) {
                return res.status(400).json({
                    success: false,
                    message: "Contact person name cannot be empty!",
                });
            }
            updates.contactName = cn;
        }

        if (req.body.contactPhone !== undefined) {
            const phone = normalizePhone(req.body.contactPhone);
            if (!phone) {
                return res.status(400).json({
                    success: false,
                    message:
                        "A valid 10-digit Indian contact number is required!",
                });
            }
            updates.contactPhone = phone;
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: "No valid fields to update!",
            });
        }

        const canteen = await Canteen.findOneAndUpdate(
            { owner: req.user._id },
            updates,
            { new: true, runValidators: true },
        );

        if (!canteen) {
            return res.status(404).json({
                success: false,
                message: "You don't own a canteen!",
            });
        }

        res.status(200).json({
            success: true,
            message: "Canteen updated successfully!",
            canteen,
        });
    } catch (err) {
        console.error("Update canteen error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to update canteen!",
        });
    }
};

// public marketplace — all open canteens with live item counts
export const getCanteens = async (req, res) => {
    try {
        const canteens = await Canteen.aggregate([
            { $match: { isOpen: true } },
            {
                $lookup: {
                    from: "menus",
                    let: { cid: "$_id" },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$canteen", "$$cid"] } } },
                        { $match: { $expr: { $eq: ["$isAvailable", true] } } },
                        { $count: "n" },
                    ],
                    as: "itemCounts",
                },
            },
            {
                $addFields: {
                    itemCount: { $ifNull: [{ $first: "$itemCounts.n" }, 0] },
                },
            },
            { $sort: { name: 1 } },
            {
                $project: {
                    name: 1,
                    description: 1,
                    location: 1,
                    itemCount: 1,
                },
            },
        ]);

        res.status(200).json({
            success: true,
            canteens,
        });
    } catch (err) {
        console.error("Get canteens error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to fetch canteens!",
        });
    }
};
