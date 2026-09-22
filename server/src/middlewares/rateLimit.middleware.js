import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { getAuth } from "@clerk/express";

/**
 * Keying strategy for a campus deployment:
 * hundreds of students share a handful of NAT/college-WiFi public IPs, so
 * pure IP limiting would throttle the whole campus collectively. Instead:
 *   - authenticated requests are bucketed per Clerk userId
 *   - unauthenticated requests fall back to IP
 *   - a generous global ceiling protects the DB from traffic spikes
 */
const keyGenerator = (req) => {
    try {
        const { userId } = getAuth(req);
        if (userId) return `u:${userId}`;
    } catch {
        // clerkMiddleware not ready or public route — fall through to IP
    }
    // ipKeyGenerator groups IPv6 addresses into /56 subnets so a device
    // can't rotate through addresses to dodge the limit
    return `ip:${ipKeyGenerator(req.ip)}`;
};

/**
 * Global limiter — applies to every /api route.
 * 300 requests / 5 min per user (~1/sec sustained), plus a shared-IP
 * fallback for unauthenticated traffic. Generous on purpose.
 */
export const globalLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 300,
    keyGenerator,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many requests — please slow down and try again shortly.",
    },
});

/**
 * Sensitive/expensive operations — tighter buckets.
 * Auth: 30 / 5 min per user, 60 / 5 min per IP (covers the /sync storm
 * when a lecture-hall of students signs in at once).
 */
export const authLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 30,
    keyGenerator,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many attempts — try again in a few minutes.",
    },
});

export const authIpLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many attempts from this network — try again shortly.",
    },
});

/**
 * Order placement: 20 orders / 15 min per user — plenty for real usage,
 * tight enough to stop a scripted order flood hammering the DB.
 */
export const orderLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    keyGenerator,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        success: false,
        message: "Order limit reached — please wait before ordering again.",
    },
});
