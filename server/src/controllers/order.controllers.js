import { getAuth } from "@clerk/express";
import Menu from "../models/menu.model.js";
import Order from "../models/order.model.js";
import Canteen from "../models/canteen.model.js";
import Counter from "../models/counter.model.js";

const MAX_QTY_PER_ITEM = 20;
const MAX_DISTINCT_ITEMS = 30;
const ORDERS_PAGE_SIZE = 50;

// create order
export const createOrder = async (req, res) => {
    try {
        // req.user resolved by attachUser middleware
        const customerId = req.user._id;

        const { items } = req.body;

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

        // ONE batched query instead of one query per item (fixes N+1)
        // canteen is included because we must verify a single-vendor order
        const menus = await Menu.find({
            _id: { $in: [...quantityByItem.keys()] },
            isAvailable: true,
        })
            .select("name price canteen")
            .lean();

        if (menus.length !== quantityByItem.size) {
            return res.status(404).json({
                success: false,
                message:
                    "One or more menu items are unavailable or do not exist!",
            });
        }

        const orderItems = [];
        let totalAmount = 0;

        // one canteen per order — every item must belong to the same vendor
        const canteenIds = new Set(menus.map((m) => String(m.canteen)));
        if (canteenIds.size !== 1) {
            return res.status(400).json({
                success: false,
                message:
                    "All items in an order must be from the same canteen!",
            });
        }

        for (const menu of menus) {
            const quantity = quantityByItem.get(String(menu._id));
            totalAmount += menu.price * quantity;

            orderItems.push({
                menuItem: menu._id,
                name: menu.name,
                price: menu.price,
                quantity,
            });
        }

        // the vendor must be open for business
        const canteen = await Canteen.findById([...canteenIds][0])
            .select("isOpen name")
            .lean();

        if (!canteen || !canteen.isOpen) {
            return res.status(400).json({
                success: false,
                message: "This canteen is currently closed!",
            });
        }

        // per-canteen per-day token number, reserved atomically (1, 2, 3… daily)
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);

        const counter = await Counter.findOneAndUpdate(
            { canteen: canteen._id, day: dayStart },
            { $inc: { seq: 1 } },
            { new: true, upsert: true },
        );

        const tokenNumber = counter.seq;

        const order = await Order.create({
            customer: customerId,
            canteen: canteen._id,
            items: orderItems,
            totalAmount,
            tokenNumber,
        });

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

// get all orders (of the signed-in user)
export const getMyOrders = async (req, res) => {
    try {
        const orders = await Order.find({ customer: req.user._id })
            .sort({ createdAt: -1 })
            .limit(ORDERS_PAGE_SIZE)
            .populate("canteen", "name location")
            .lean();

        res.status(200).json({
            success: true,
            orders,
        });
    } catch (err) {
        console.error("Get my orders error:", err);

        res.status(500).json({
            success: false,
            message: "Failed to fetch orders!",
        });
    }
};

// get single order
export const getOrderById = async (req, res) => {
    try {
        const { id } = req.params;

        const order = await Order.findOne({
            _id: id,
            customer: req.user._id,
        }).lean();

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

// cancel order
export const cancelOrder = async (req, res) => {
    try {
        const { id } = req.params;

        // atomic conditional update — no read/modify/write race
        const order = await Order.findOneAndUpdate(
            { _id: id, customer: req.user._id, status: "pending" },
            { $set: { status: "cancelled" } },
            { new: true },
        );

        if (!order) {
            return res.status(400).json({
                success: false,
                message:
                    "Order not found, already processed, or cannot be cancelled now!",
            });
        }

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
