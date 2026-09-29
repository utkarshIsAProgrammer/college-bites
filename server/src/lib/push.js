import webpush from "web-push";
import User from "../models/user.model.js";
import PushSubscription from "../models/pushSubscription.model.js";

/**
 * Web Push fan-out — fire-and-forget by design.
 *
 * A failed push must never fail the API request that triggered it: if FCM is
 * slow or a subscription is stale, the order still goes through. Every send
 * is best-effort; 404/410 responses prune the dead subscription.
 */

let configured = null;

/** configure web-push once from env; null when keys are missing (dev) */
function pushConfigured() {
    if (configured !== null) return configured;
    configured = Boolean(
        process.env.VAPID_PUBLIC_KEY &&
            process.env.VAPID_PRIVATE_KEY &&
            process.env.VAPID_SUBJECT,
    );
    if (configured) {
        webpush.setVapidDetails(
            process.env.VAPID_SUBJECT,
            process.env.VAPID_PUBLIC_KEY,
            process.env.VAPID_PRIVATE_KEY,
        );
    } else {
        console.warn(
            "Web Push disabled — VAPID_* env vars missing. Notifications will not be delivered.",
        );
    }
    return configured;
}

/** the public key clients need to subscribe (empty string when unconfigured) */
export const getVapidPublicKey = () =>
    pushConfigured() ? process.env.VAPID_PUBLIC_KEY : "";

/**
 * Send a push to every subscription of a user, pruning dead endpoints.
 * payload: { title, body, tag?, url?, kind? } — JSON, encrypted per device.
 *
 * @returns {number} how many devices accepted the push
 */
export async function sendPushToUser(userId, payload) {
    if (!pushConfigured()) return 0;

    const subs = await PushSubscription.find({ user: userId })
        .select("endpoint keys")
        .lean();

    if (!subs.length) return 0;

    const body = JSON.stringify(payload);
    let delivered = 0;

    await Promise.all(
        subs.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: sub.keys },
                    body,
                    { TTL: 3600 }, // stale food news is worthless after an hour
                );
                delivered++;
            } catch (err) {
                const code = err?.statusCode;
                if (code === 404 || code === 410) {
                    // subscription expired/uninstalled — drop it
                    PushSubscription.deleteOne({ _id: sub._id })
                        .catch(() => {});
                } else {
                    // transient (429/5xx/network) — keep the subscription
                    console.error(
                        "Push send error:",
                        code || err?.message || err,
                    );
                }
            }
        }),
    );

    return delivered;
}

/** helper: Mongo userId ← clerkId (vendors may only have clerkId handy) */
export async function userIdFromClerkId(clerkId) {
    if (!clerkId) return null;
    const user = await User.findOne({ clerkId }).select("_id").lean();
    return user?._id || null;
}
