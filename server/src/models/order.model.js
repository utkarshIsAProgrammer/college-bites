import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
    {
        menuItem: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Menu",
            required: true,
        },

        name: {
            type: String,
            required: true,
            trim: true,
        },

        price: {
            type: Number,
            required: true,
            min: 0,
        },

        quantity: {
            type: Number,
            required: true,
            min: 1,
        },
    },

    { _id: false, timestamps: true },
);

const orderSchema = new mongoose.Schema(
    {
        customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        // one canteen per order — cart is locked to a single vendor
        canteen: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Canteen",
            required: true,
        },

        items: {
            type: [orderItemSchema],
            required: true,
            validate: {
                validator: (items) => items.length > 0,
                message: "Order must contain at least one item!",
            },
        },

        totalAmount: {
            type: Number,
            required: true,
            min: 0,
        },

        status: {
            type: String,
            enum: [
                "pending",
                "accepted",
                "preparing",
                "ready",
                "completed",
                "cancelled",
            ],
            default: "pending",
        },

        // token number scoped per canteen per day (each canteen's queue: 1, 2, 3…)
        tokenNumber: {
            type: Number,
        },
    },
    { timestamps: true },
);

// query patterns: "my orders" (customer, newest first),
// per-canteen-per-day token reservation (today's highest tokenNumber),
// vendor order lists, and staff views filtered by status
orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ canteen: 1, createdAt: -1, tokenNumber: -1 });
orderSchema.index({ canteen: 1, status: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });

const Order = mongoose.model("Order", orderSchema);
export default Order;
