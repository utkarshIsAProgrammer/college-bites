import mongoose from "mongoose";
import Canteen, { IMAGE_CHAR_LIMIT as IMAGE_LIMIT } from "../models/canteen.model.js";
import Menu from "../models/menu.model.js";
import Order from "../models/order.model.js";
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

        const canteenObj = canteen.toObject ? canteen.toObject() : canteen;

        res.status(201).json({
            success: true,
            message: "Canteen registered successfully!",
            canteen: { ...canteenObj, itemCount: 0 },
        });
    } catch (err) {
        console.error("Register canteen error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to register canteen!",
        });
    }
};

// my canteen (owner view) — includes the listing count so the vendor side can
// show setup progress without a second request
export const getMyCanteen = async (req, res) => {
    try {
        const canteen = await Canteen.findOne({ owner: req.user._id }).lean();

        if (!canteen) {
            return res.status(200).json({
                success: true,
                canteen: null,
            });
        }

        const itemCount = await Menu.countDocuments({
            canteen: canteen._id,
        });

        res.status(200).json({
            success: true,
            canteen: { ...canteen, itemCount },
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

        // ─── payments ───
        if (req.body.upiId !== undefined) {
            const upi = String(req.body.upiId).trim();
            if (upi && !/^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,32}$/.test(upi)) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid UPI ID — expected format like name@bank.",
                });
            }
            updates.upiId = upi; // empty string removes it
        }

        if (req.body.qrImageUrl !== undefined) {
            const qr = String(req.body.qrImageUrl);
            if (qr && qr.length > IMAGE_LIMIT) {
                return res.status(400).json({
                    success: false,
                    message: "QR image is too large — please upload a smaller image.",
                });
            }
            updates.qrImageUrl = qr; // empty string removes it
        }

        // ─── profile ───
        if (req.body.photo !== undefined) {
            const photo = String(req.body.photo);
            if (photo && photo.length > IMAGE_LIMIT) {
                return res.status(400).json({
                    success: false,
                    message: "Photo is too large — please upload a smaller image.",
                });
            }
            updates.photo = photo;
        }

        if (req.body.hours !== undefined) {
            const h = req.body.hours || {};
            const hhmm = (v) => !v || /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
            if (!hhmm(h.open) || !hhmm(h.close)) {
                return res.status(400).json({
                    success: false,
                    message: "Hours must be HH:MM (24h), e.g. 08:30.",
                });
            }
            updates.hours = { open: h.open || "", close: h.close || "" };
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
            { returnDocument: "after", runValidators: true },
        ).lean();

        if (!canteen) {
            return res.status(404).json({
                success: false,
                message: "You don't own a canteen!",
            });
        }

        const itemCount = await Menu.countDocuments({
            canteen: canteen._id,
        });

        res.status(200).json({
            success: true,
            message: "Canteen updated successfully!",
            canteen: { ...canteen, itemCount },
        });
    } catch (err) {
        console.error("Update canteen error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to update canteen!",
        });
    }
};

// public canteen detail — profile + live queue length
export const getCanteenDetail = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid canteen id!",
            });
        }

        const canteen = await Canteen.findById(id)
            .select("-owner -createdAt -updatedAt -__v") // includes upiId + QR for payments
            .lean();

        if (!canteen) {
            return res.status(404).json({
                success: false,
                message: "Canteen not found!",
            });
        }

        const queue = await Order.countDocuments({
            canteen: canteen._id,
            status: { $in: ["pending", "accepted", "preparing"] },
        });

        res.status(200).json({
            success: true,
            canteen: { ...canteen, queue },
        });
    } catch (err) {
        console.error("Get canteen detail error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to fetch canteen!",
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
            {
                // live "in queue" count — same definition as the detail view
                $lookup: {
                    from: "orders",
                    let: { cid: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$canteen", "$$cid"] },
                            },
                        },
                        {
                            $match: {
                                status: {
                                    $in: ["pending", "accepted", "preparing"],
                                },
                            },
                        },
                        { $count: "n" },
                    ],
                    as: "queueCounts",
                },
            },
            {
                $addFields: {
                    queue: { $ifNull: [{ $first: "$queueCounts.n" }, 0] },
                },
            },
            { $sort: { name: 1 } },
            {
                $project: {
                    name: 1,
                    description: 1,
                    location: 1,
                    photo: 1,
                    itemCount: 1,
                    queue: 1,
                    ratingAvg: 1,
                    ratingCount: 1,
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
