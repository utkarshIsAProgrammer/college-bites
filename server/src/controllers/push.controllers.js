import mongoose from "mongoose";
import PushSubscription from "../models/pushSubscription.model.js";
import { getVapidPublicKey } from "../lib/push.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// browser-generated subscription keys are ~90 chars (p256dh) / ~24 (auth);
// caps here are generous but bound what we'll store per row
const MAX_KEY_CHARS = 255;

// a real user has a handful of devices; anything beyond this is abuse
const MAX_SUBS_PER_USER = 20;

// GET /api/push/key — public VAPID key for applicationServerKey
export const getPushKey = (req, res) => {
    const publicKey = getVapidPublicKey();
    if (!publicKey) {
        return res.status(503).json({
            success: false,
            message: "Push notifications are not configured on this server.",
        });
    }
    res.status(200).json({ success: true, publicKey });
};

// POST /api/push/subscribe — register (or refresh) this device
export const subscribe = async (req, res) => {
    try {
        const { subscription, topics } = req.body || {};
        const endpoint = subscription?.endpoint;
        const p256dh = subscription?.keys?.p256dh;
        const auth = subscription?.keys?.auth;

        if (
            typeof endpoint !== "string" ||
            !/^https:\/\//.test(endpoint) ||
            endpoint.length > 1024 ||
            typeof p256dh !== "string" ||
            typeof auth !== "string" ||
            !p256dh.length ||
            !auth.length ||
            p256dh.length > MAX_KEY_CHARS ||
            auth.length > MAX_KEY_CHARS
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid push subscription payload!",
            });
        }

        const validTopics = ["orders", "ready"];
        const chosen = Array.isArray(topics)
            ? topics.filter((t) => validTopics.includes(t))
            : validTopics;

        // upsert by endpoint: same device re-subscribing replaces its row
        // (keys rotate whenever permission is re-granted).
        // user-scoped filter — an endpoint already owned by ANOTHER user is
        // never silently reassigned; the attacker gets a 409 instead.
        const result = await PushSubscription.findOneAndUpdate(
            { endpoint, user: req.user._id },
            {
                keys: { p256dh, auth },
                topics: chosen.length ? chosen : validTopics,
            },
            { runValidators: true },
        );

        if (!result) {
            // new endpoint for this user — enforce a per-user device cap so
            // one account can't bloat the collection unboundedly
            const count = await PushSubscription.countDocuments({
                user: req.user._id,
            });
            if (count >= MAX_SUBS_PER_USER) {
                return res.status(409).json({
                    success: false,
                    message:
                        "Too many devices registered — remove one before adding another.",
                });
            }

            try {
                await PushSubscription.create({
                    user: req.user._id,
                    endpoint,
                    keys: { p256dh, auth },
                    topics: chosen.length ? chosen : validTopics,
                });
            } catch (err) {
                // lost a race with another device registering the same
                // endpoint — treat as success, the row exists either way
                if (err?.code !== 11000) throw err;
            }
        }

        res.status(201).json({
            success: true,
            message: "Device registered for notifications.",
        });
    } catch (err) {
        console.error("Push subscribe error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to save push subscription!",
        });
    }
};

// POST /api/push/unsubscribe — this device opted out (or its sub went bad)
export const unsubscribe = async (req, res) => {
    try {
        const endpoint = req.body?.subscription?.endpoint;
        if (typeof endpoint !== "string" || !endpoint) {
            return res.status(400).json({
                success: false,
                message: "Subscription endpoint is required!",
            });
        }

        // only the owner's row — never delete another user's subscription
        await PushSubscription.deleteOne({
            endpoint,
            user: req.user._id,
        });

        res.status(200).json({
            success: true,
            message: "Device unsubscribed.",
        });
    } catch (err) {
        console.error("Push unsubscribe error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to remove push subscription!",
        });
    }
};
