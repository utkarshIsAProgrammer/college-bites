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

        // snapshot of the item's prep time at order time — lets the ETA math
        // work without re-joining the (possibly since-edited) menu
        prepMins: {
            type: Number,
            min: 0,
            default: 0,
        },

        // veg snapshot for order-history dots
        isVeg: {
            type: Boolean,
            default: true,
        },
    },

    { _id: false },
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

        // customer's cooking note, e.g. "no onion, less spicy"
        note: {
            type: String,
            trim: true,
            maxLength: 200,
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

        // when the customer plans to collect
        pickupAt: {
            type: Date,
        },

        // ─── payment ───
        payment: {
            method: {
                type: String,
                enum: ["cash", "upi_qr"],
                required: true,
            },

            // pending → submitted → confirmed | failed
            state: {
                type: String,
                enum: ["pending", "submitted", "confirmed", "failed"],
                default: "pending",
            },

            // UPI reference/UTR typed by the payer — the proof trail
            reference: {
                type: String,
                trim: true,
                maxLength: 60,
            },

            confirmedAt: {
                type: Date,
            },

            confirmedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
        },
    },
    { timestamps: true },
);

// query patterns: "my orders" (customer, newest first),
// vendor queue (canteen + active statuses, token order),
// per-canteen-per-day stats, and token counters
orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ canteen: 1, createdAt: -1, tokenNumber: -1 });
orderSchema.index({ canteen: 1, status: 1, createdAt: -1 });
orderSchema.index({ canteen: 1, "payment.state": 1, createdAt: -1 });

const Order = mongoose.model("Order", orderSchema);
export default Order;
