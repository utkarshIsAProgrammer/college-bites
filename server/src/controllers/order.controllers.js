import { getAuth } from "@clerk/express";
import mongoose from "mongoose";
import Menu from "../models/menu.model.js";
import Order from "../models/order.model.js";
import Canteen from "../models/canteen.model.js";
import Counter from "../models/counter.model.js";
import Review from "../models/review.model.js";
import { sendPushToUser } from "../lib/push.js";

const MAX_QTY_PER_ITEM = 20;
const MAX_DISTINCT_ITEMS = 30;
const ORDERS_PAGE_SIZE = 50;

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// fire-and-forget vendor push — a slow/dead push service must never hold up
// the API response; errors are logged inside sendPushToUser
const pushVendor = (canteenDoc, title, body, tag, url) => {
    if (!canteenDoc?.owner) return;
    sendPushToUser(canteenDoc.owner, {
        kind: "orders",
        title,
        body,
        tag,
        url,
    }).catch(() => {});
};

// allowed vendor status transitions
const TRANSITIONS = {
    pending: ["accepted", "cancelled"],
    accepted: ["preparing", "cancelled"],
    preparing: ["ready"],
    ready: ["completed"],
    completed: [],
    cancelled: [],
};

// helper: the vendor's own canteen (or null)
const vendorCanteen = async (userId) =>
    Canteen.findOne({ owner: userId }).select("_id name").lean();

// ─── customer: create order ───
export const createOrder = async (req, res) => {
    try {
        const customerId = req.user._id;
        const { items, pickupAt, paymentMethod, note } = req.body;

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Order must contain at least one item!",
            });
        }

        if (items.length > MAX_DISTINCT_ITEMS) {
            return res.status(400).json({
                success: false,
                message: `Order cannot contain more than ${MAX_DISTINCT_ITEMS} distinct items!`,
            });
        }

        const method = paymentMethod === "upi_qr" ? "upi_qr" : "cash";

        // validate payloads and merge duplicates first (no DB round-trips wasted)
        const quantityByItem = new Map();

        for (const item of items) {
            const { menuItem, quantity } = item || {};

            if (!menuItem || !Number.isInteger(quantity) || quantity < 1) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid order item!",
                });
            }

            if (quantity > MAX_QTY_PER_ITEM) {
                return res.status(400).json({
                    success: false,
                    message: `Quantity cannot exceed ${MAX_QTY_PER_ITEM}!`,
                });
            }

            quantityByItem.set(
                menuItem,
                (quantityByItem.get(menuItem) || 0) + quantity,
            );
        }

        // ONE batched query; canteen included for the single-vendor check.
        // Availability (isAvailable) is checked here; time-bound windows are
        // checked per-item below against the server clock (client can't fake it).
        const menus = await Menu.find({
            _id: { $in: [...quantityByItem.keys()] },
            isAvailable: true,
        })
            .select(
                "name price canteen prepMins isVeg availableFrom availableTo",
            )
            .lean();

        if (menus.length !== quantityByItem.size) {
            return res.status(404).json({
                success: false,
                message:
                    "One or more menu items are unavailable or do not exist!",
            });
        }

        // time-bound items: reject ordering outside their window
        const now = new Date();
        for (const menu of menus) {
            if (menu.availableFrom && menu.availableTo) {
                const toMins = (t) => {
                    const [h, m] = String(t).split(":").map(Number);
                    return (h || 0) * 60 + (m || 0);
                };
                const cur = now.getHours() * 60 + now.getMinutes();
                const from = toMins(menu.availableFrom);
                const to = toMins(menu.availableTo);
                const inWindow =
                    to === from
                        ? true
                        : to > from
                          ? cur >= from && cur < to
                          : cur >= from || cur < to;
                if (!inWindow) {
                    return res.status(400).json({
                        success: false,
                        message: `"${menu.name}" is only available ${menu.availableFrom}–${menu.availableTo}.`,
                    });
                }
            }
        }

        // one canteen per order
        const canteenIds = new Set(menus.map((m) => String(m.canteen)));
        if (canteenIds.size !== 1) {
            return res.status(400).json({
                success: false,
                message:
                    "All items in an order must be from the same canteen!",
            });
        }

        // the vendor must be open for business — owner id rides along for
        // the new-order push (fire-and-forget, after the response below)
        const canteen = await Canteen.findById([...canteenIds][0])
            .select("isOpen name upiId qrImageUrl owner")
            .lean();

        if (!canteen || !canteen.isOpen) {
            return res.status(400).json({
                success: false,
                message: "This canteen is currently closed!",
            });
        }

        // UPI payment requires the vendor to have configured a UPI id or QR
        if (method === "upi_qr" && !canteen.upiId && !canteen.qrImageUrl) {
            return res.status(400).json({
                success: false,
                message:
                    "This canteen doesn't accept UPI payments — please pay cash.",
            });
        }

        // build order items + estimate prep time
        const orderItems = [];
        let totalAmount = 0;
        let prepMins = 0;

        for (const menu of menus) {
            const quantity = quantityByItem.get(String(menu._id));
            totalAmount += menu.price * quantity;
            prepMins = Math.max(prepMins, menu.prepMins || 0);

            orderItems.push({
                menuItem: menu._id,
                name: menu.name,
                price: menu.price,
                quantity,
                prepMins: menu.prepMins || 0,
                isVeg: menu.isVeg !== false,
            });
        }

        // pickup time: explicit from client, else estimated from prep time
        let pickup = null;
        if (pickupAt && !Number.isNaN(Date.parse(pickupAt))) {
            pickup = new Date(pickupAt);
        } else if (prepMins > 0) {
            pickup = new Date(Date.now() + prepMins * 60_000);
        }

        // per-canteen per-day token number, reserved atomically (1, 2, 3… daily)
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);

        const counter = await Counter.findOneAndUpdate(
            { canteen: canteen._id, day: dayStart },
            { $inc: { seq: 1 } },
            { returnDocument: "after", upsert: true },
        );

        const order = await Order.create({
            customer: customerId,
            canteen: canteen._id,
            items: orderItems,
            totalAmount,
            note: note ? String(note).trim().slice(0, 200) : "",
            tokenNumber: counter.seq,
            pickupAt: pickup,
            payment: {
                method,
                state: "pending",
            },
        });

        // customer-facing summary of the cart for the vendor's push
        const orderSummary =
            orderItems.length > 1
                ? `${orderItems[0].name} +${orderItems.length - 1} more`
                : orderItems[0]?.name || "New order";

        pushVendor(
            canteen,
            `New order #${counter.seq}`,
            `${orderSummary} — ₹${totalAmount}${
                method === "upi_qr" ? " · UPI" : " · cash"
            }`,
            `order-${canteen._id}`,
            "/vendor",
        );

        res.status(201).json({
            success: true,
            message: "Order created successfully!",
            order,
        });
    } catch (err) {
        console.error("Create order error:", err);

        res.status(500).json({
            success: false,
            message: "Failed to create order!",
        });
    }
};

// ─── customer: my orders ───
export const getMyOrders = async (req, res) => {
    try {
        const orders = await Order.find({ customer: req.user._id })
            .sort({ createdAt: -1 })
            .limit(ORDERS_PAGE_SIZE)
            .populate("canteen", "name location upiId qrImageUrl")
            .lean();

        // "when do I walk down?" — for each live order, how many orders are
        // still ahead of it at that canteen (accepted/preparing outrank a
        // merely pending one), and when the kitchen should be done. Sourced
        // from the same data the vendor queue shows, so the two never disagree.
        const activeStatuses = ["pending", "accepted", "preparing"];
        const activeOrders = orders.filter((o) =>
            activeStatuses.includes(o.status),
        );

        let queueByCanteen = null;
        if (activeOrders.length) {
            const canteenIds = [
                ...new Set(activeOrders.map((o) => String(o.canteen._id))),
            ];
            const ahead = await Order.aggregate([
                {
                    $match: {
                        canteen: {
                            $in: canteenIds.map(
                                (id) => new mongoose.Types.ObjectId(id),
                            ),
                        },
                        status: { $in: activeStatuses },
                    },
                },
                {
                    $group: {
                        _id: {
                            canteen: "$canteen",
                            status: "$status",
                        },
                        count: { $sum: 1 },
                    },
                },
            ]);

            queueByCanteen = new Map();
            for (const row of ahead) {
                const key = String(row._id.canteen);
                const entry = queueByCanteen.get(key) || {
                    pending: 0,
                    preparing: 0,
                };
                if (row._id.status === "pending") entry.pending = row.count;
                else entry.preparing += row.count; // accepted + preparing
                queueByCanteen.set(key, entry);
            }
        }

        const withQueue = orders.map((o) => {
            if (!activeStatuses.includes(o.status)) return o;

            const q = queueByCanteen?.get(String(o.canteen._id)) || {
                pending: 0,
                preparing: 0,
            };
            // accepted/preparing kitchens work before pending orders, so an
            // order still pending counts everyone else; once accepted it only
            // counts the ones the vendor took first
            const aheadOfMe =
                o.status === "pending"
                    ? q.pending - 1 + q.preparing
                    : Math.max(q.preparing - 1, 0);

            const maxPrep = Math.max(
                0,
                ...o.items.map((it) =>
                    Number.isFinite(it.prepMins) ? it.prepMins : 0,
                ),
            );

            return {
                ...o,
                queueAhead: aheadOfMe,
                estimatedReadyAt:
                    o.pickupAt ||
                    new Date(Date.now() + maxPrep * 60_000),
            };
        });

        // one extra query beats one query per order — flag which orders
        // already carry a review so the UI can hide the "Rate" button
        const ids = orders.map((o) => o._id);
        const reviewed = ids.length
            ? await Review.find({ order: { $in: ids } })
                  .select("order")
                  .lean()
            : [];
        const reviewedIds = new Set(reviewed.map((r) => String(r.order)));

        res.status(200).json({
            success: true,
            orders: withQueue.map((o) => ({
                ...o,
                reviewed: reviewedIds.has(String(o._id)),
            })),
        });
    } catch (err) {
        console.error("Get my orders error:", err);

        res.status(500).json({
            success: false,
            message: "Failed to fetch orders!",
        });
    }
};

// ─── customer: single order ───
export const getOrderById = async (req, res) => {
    try {
        const { id } = req.params;

        const order = await Order.findOne({
            _id: id,
            customer: req.user._id,
        })
            .populate("canteen", "name location contactName contactPhone")
            .lean();

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found!",
            });
        }

        res.status(200).json({
            success: true,
            order,
        });
    } catch (err) {
        console.error("Get order error:", err);

        res.status(500).json({
            success: false,
            message: "Failed to fetch order!",
        });
    }
};

// ─── customer: cancel (only while pending/accepted) ───
export const cancelOrder = async (req, res) => {
    try {
        const { id } = req.params;

        // Cancel is for orders the customer hasn't paid for yet. A paid order
        // (UPI confirmed, or UTR submitted and awaiting vendor verification) is
        // money already moved — wiping its record to "failed" would corrupt the
        // payment history both sides rely on as proof. Those need a vendor-side
        // refund/reject instead.
        const order = await Order.findOneAndUpdate(
            {
                _id: id,
                customer: req.user._id,
                status: { $in: ["pending", "accepted"] },
                "payment.state": "pending",
            },
            {
                $set: {
                    status: "cancelled",
                    "payment.state": "failed",
                },
            },
            { returnDocument: "after" },
        );

        if (!order) {
            return res.status(400).json({
                success: false,
                message:
                    "Order not found, already paid or being prepared — cancelling a paid order needs a vendor refund, not a cancel.",
            });
        }

        // vendor needs to know an order just left their queue (fire-and-forget;
        // order.canteen is a bare ObjectId, so look up the owner first)
        Canteen.findById(order.canteen)
            .select("owner")
            .lean()
            .then((c) =>
                pushVendor(
                    c,
                    `Order #${order.tokenNumber} cancelled`,
                    "The customer cancelled before preparation started.",
                    `order-${order.canteen}`,
                    "/vendor",
                ),
            )
            .catch(() => {});

        res.status(200).json({
            success: true,
            message: "Order cancelled successfully!",
            order,
        });
    } catch (err) {
        console.error("Cancel order error:", err);

        res.status(500).json({
            success: false,
            message: "Failed to cancel order!",
        });
    }
};

// ─── customer: submit UPI payment proof (UTR) ───
export const submitPayment = async (req, res) => {
    try {
        const { id } = req.params;
        const { reference } = req.body;

        // schema caps payment.reference at 60 — slice here too, since this
        // update doesn't run mongoose validators (runValidators absent), so
        // an unsliced string could store megabytes per order
        const ref = String(reference || "").trim().slice(0, 60);
        if (ref.length < 6) {
            return res.status(400).json({
                success: false,
                message:
                    "Enter the UPI reference/UTR number from your payment app (min 6 characters).",
            });
        }

        const order = await Order.findOneAndUpdate(
            {
                _id: id,
                customer: req.user._id,
                "payment.method": "upi_qr",
                "payment.state": "pending",
                status: { $nin: ["cancelled"] },
            },
            {
                $set: {
                    "payment.state": "submitted",
                    "payment.reference": ref,
                },
            },
            { returnDocument: "after" },
        );

        if (!order) {
            return res.status(400).json({
                success: false,
                message:
                    "Order not found, already submitted, or not a UPI order!",
            });
        }

        // vendor must verify the UTR — nudge them (fire-and-forget; bare
        // ObjectId canteen, so resolve the owner first)
        Canteen.findById(order.canteen)
            .select("owner")
            .lean()
            .then((c) =>
                pushVendor(
                    c,
                    `Payment proof for #${order.tokenNumber}`,
                    "Customer submitted a UPI reference — verify it in the queue.",
                    `payment-${order.canteen}`,
                    "/vendor",
                ),
            )
            .catch(() => {});

        res.status(200).json({
            success: true,
            message: "Payment proof submitted — the vendor will confirm.",
            order,
        });
    } catch (err) {
        console.error("Submit payment error:", err);

        res.status(500).json({
            success: false,
            message: "Failed to submit payment!",
        });
    }
};

// ─── vendor: incoming order queue ───
export const getVendorOrders = async (req, res) => {
    try {
        const canteen = await vendorCanteen(req.user._id);
        if (!canteen) {
            return res.status(404).json({
                success: false,
                message: "You don't own a canteen!",
            });
        }

        const { active, unpaid } = req.query;
        const filter = { canteen: canteen._id };
        let sort = { createdAt: -1 };

        if (unpaid === "1") {
            // money still owed, regardless of progress. Completed orders are
            // included on purpose: cash is usually handed over at pickup, so
            // the vendor reconciles afterwards. Oldest debt first.
            filter.status = { $ne: "cancelled" };
            filter["payment.state"] = { $ne: "confirmed" };
            sort = { createdAt: 1 };
        } else if (active === "1") {
            filter.status = {
                $in: ["pending", "accepted", "preparing", "ready"],
            };
        }

        const orders = await Order.find(filter)
            .sort(sort)
            .limit(ORDERS_PAGE_SIZE)
            .populate("customer", "name")
            .lean();

        res.status(200).json({
            success: true,
            orders,
        });
    } catch (err) {
        console.error("Vendor orders error:", err);

        res.status(500).json({
            success: false,
            message: "Failed to fetch orders!",
        });
    }
};

// ─── vendor: advance order status ───
export const updateOrderStatus = async (req, res) => {
    try {
        const canteen = await vendorCanteen(req.user._id);
        if (!canteen) {
            return res.status(404).json({
                success: false,
                message: "You don't own a canteen!",
            });
        }

        const { id } = req.params;
        const { status } = req.body;

        if (!TRANSITIONS[status]) {
            return res.status(400).json({
                success: false,
                message: "Invalid status!",
            });
        }

        const current = await Order.findOne({
            _id: id,
            canteen: canteen._id,
        }).select("status");

        if (!current) {
            return res.status(404).json({
                success: false,
                message: "Order not found!",
            });
        }

        if (!TRANSITIONS[current.status]?.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot move an order from "${current.status}" to "${status}"!`,
            });
        }

        const order = await Order.findByIdAndUpdate(
            id,
            { $set: { status } },
            { returnDocument: "after" },
        ).lean();

        // customer-facing status pushes (fire-and-forget; order.customer is
        // the buyer's ObjectId, so sendPushToUser takes it directly)
        const STATUS_PUSH = {
            accepted: {
                title: `Order #${order.tokenNumber} accepted`,
                body: `${canteen.name} is on it — we'll ping you when it's ready.`,
            },
            preparing: {
                title: `Order #${order.tokenNumber} is being prepared`,
                body: `${canteen.name} has started cooking your food.`,
            },
            ready: {
                title: "Your food is ready!",
                body: `Token #${order.tokenNumber} — pick it up at ${canteen.name}.`,
            },
            completed: {
                title: `Order #${order.tokenNumber} completed`,
                body: `Enjoy your meal! Rate it to help other students.`,
            },
            cancelled: {
                title: `Order #${order.tokenNumber} cancelled`,
                body: `${canteen.name} couldn't fulfill this order.`,
            },
        };

        const push = STATUS_PUSH[status];
        if (push) {
            sendPushToUser(order.customer, {
                kind: status === "ready" ? "ready" : "orders",
                title: push.title,
                body: push.body,
                tag: `order-${order._id}`,
                url: "/orders",
            }).catch(() => {});
        }

        res.status(200).json({
            success: true,
            message: `Order marked ${status}.`,
            order,
        });
    } catch (err) {
        console.error("Update order status error:", err);

        res.status(500).json({
            success: false,
            message: "Failed to update order!",
        });
    }
};

// ─── vendor: confirm a payment (UPI proof verified, or cash in hand) ───
export const confirmPayment = async (req, res) => {
    try {
        const canteen = await vendorCanteen(req.user._id);
        if (!canteen) {
            return res.status(404).json({
                success: false,
                message: "You don't own a canteen!",
            });
        }

        const { id } = req.params;
        const { outcome } = req.body; // "confirmed" | "failed"

        if (!["confirmed", "failed"].includes(outcome)) {
            return res.status(400).json({
                success: false,
                message: "Outcome must be 'confirmed' or 'failed'!",
            });
        }

        const order = await Order.findOneAndUpdate(
            {
                _id: id,
                canteen: canteen._id,
                "payment.state": { $in: ["pending", "submitted"] },
            },
            {
                $set: {
                    "payment.state": outcome,
                    "payment.confirmedAt": new Date(),
                    "payment.confirmedBy": req.user._id,
                },
            },
            { returnDocument: "after" },
        ).lean();

        if (!order) {
            return res.status(400).json({
                success: false,
                message: "Order not found or payment already settled!",
            });
        }

        // customer push on payment outcome (fire-and-forget)
        sendPushToUser(order.customer, {
            kind: "orders",
            title:
                outcome === "confirmed"
                    ? `Payment confirmed for #${order.tokenNumber}`
                    : `Payment issue with #${order.tokenNumber}`,
            body:
                outcome === "confirmed"
                    ? `${canteen.name} verified your payment — your order is in the queue.`
                    : `${canteen.name} couldn't verify your payment — show the counter your UPI receipt.`,
            tag: `payment-${order._id}`,
            url: "/orders",
        }).catch(() => {});

        res.status(200).json({
            success: true,
            message:
                outcome === "confirmed"
                    ? "Payment confirmed."
                    : "Payment marked as failed.",
            order,
        });
    } catch (err) {
        console.error("Confirm payment error:", err);

        res.status(500).json({
            success: false,
            message: "Failed to update payment!",
        });
    }
};

// ─── vendor: today's stats ───
export const getVendorStats = async (req, res) => {
    try {
        const canteen = await vendorCanteen(req.user._id);
        if (!canteen) {
            return res.status(404).json({
                success: false,
                message: "You don't own a canteen!",
            });
        }

        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);

        const match = {
            canteen: canteen._id,
            createdAt: { $gte: dayStart },
            status: { $nin: ["cancelled"] },
        };

        const [summary] = await Order.aggregate([
            { $match: match },
            {
                $group: {
                    _id: null,
                    orders: { $sum: 1 },
                    revenue: { $sum: "$totalAmount" },
                    pendingPayments: {
                        $sum: {
                            $cond: [
                                { $eq: ["$payment.state", "pending"] },
                                "$totalAmount",
                                0,
                            ],
                        },
                    },
                },
            },
        ]);

        const topItems = await Order.aggregate([
            { $match: match },
            { $unwind: "$items" },
            {
                $group: {
                    _id: "$items.name",
                    qty: { $sum: "$items.quantity" },
                    revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
                },
            },
            { $sort: { qty: -1 } },
            { $limit: 5 },
        ]);

        // ─── 7-day trend (per-day orders + revenue, oldest → newest) ───
        const weekStart = new Date();
        weekStart.setHours(0, 0, 0, 0);
        weekStart.setDate(weekStart.getDate() - 6);

        const trendRows = await Order.aggregate([
            {
                $match: {
                    canteen: canteen._id,
                    createdAt: { $gte: weekStart },
                    status: { $nin: ["cancelled"] },
                },
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
                    },
                    orders: { $sum: 1 },
                    revenue: { $sum: "$totalAmount" },
                },
            },
        ]);

        // fill the 7 buckets so the chart has no gaps
        const trend = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            d.setDate(d.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            const row = trendRows.find((r) => r._id === key);
            trend.push({
                day: d.toLocaleDateString(undefined, { weekday: "short" }),
                orders: row?.orders || 0,
                revenue: row?.revenue || 0,
            });
        }

        // ─── peak hours (last 14 days, order count by hour of day) ───
        const fortnightStart = new Date();
        fortnightStart.setHours(0, 0, 0, 0);
        fortnightStart.setDate(fortnightStart.getDate() - 13);

        const hourRows = await Order.aggregate([
            {
                $match: {
                    canteen: canteen._id,
                    createdAt: { $gte: fortnightStart },
                    status: { $nin: ["cancelled"] },
                },
            },
            {
                $group: {
                    _id: { $hour: "$createdAt" },
                    orders: { $sum: 1 },
                },
            },
            { $sort: { orders: -1 } },
            { $limit: 3 },
        ]);

        const peakHours = hourRows.map((r) => ({
            hour: r._id,
            label: `${String(r._id).padStart(2, "0")}:00`,
            orders: r.orders,
        }));

        // ─── cancellation rate (last 7 days, incl. cancelled) ───
        const [cancelRow] = await Order.aggregate([
            {
                $match: {
                    canteen: canteen._id,
                    createdAt: { $gte: weekStart },
                },
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    cancelled: {
                        $sum: {
                            $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0],
                        },
                    },
                },
            },
        ]);

        res.status(200).json({
            success: true,
            stats: {
                orders: summary?.orders || 0,
                revenue: summary?.revenue || 0,
                pendingPayments: summary?.pendingPayments || 0,
                topItems,
                trend,
                peakHours,
                cancelled: cancelRow?.cancelled || 0,
                totalWeek: cancelRow?.total || 0,
            },
        });
    } catch (err) {
        console.error("Vendor stats error:", err);

        res.status(500).json({
            success: false,
            message: "Failed to compute stats!",
        });
    }
};
