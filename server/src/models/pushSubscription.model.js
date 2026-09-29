import mongoose from "mongoose";

/**
 * A browser push subscription, scoped to a user — not a device. One user may
 * have several (phone + laptop + lab computer); every one of them gets the
 * notification. Endpoints are unique in the collection: re-subscribing a
 * device (new keys after permission re-grant) replaces its stale row.
 */
const pushSubscriptionSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        endpoint: {
            type: String,
            required: true,
            unique: true,
            // push endpoints are long HTTPS URLs (FCM/APNs endpoints run
            // 200–400 chars); 1024 is a safe ceiling
            maxlength: 1024,
        },

        // p256dh public key + auth secret — the per-subscription encryption
        // keys the Web Push protocol requires
        keys: {
            p256dh: { type: String, required: true },
            auth: { type: String, required: true },
        },

        // what this device wants to hear about, so a vendor's kitchen tablet
        // can mute marketing pings without muting new orders
        topics: {
            type: [String],
            enum: ["orders", "ready"],
            default: ["orders", "ready"],
        },
    },
    { timestamps: true },
);

// push fan-out: all subscriptions for a user
pushSubscriptionSchema.index({ user: 1 });

const PushSubscription = mongoose.model(
    "PushSubscription",
    pushSubscriptionSchema,
);

export default PushSubscription;
