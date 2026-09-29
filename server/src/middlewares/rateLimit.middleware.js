import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { getAuth } from "@clerk/express";
import { redisEnabled, redisEval, redisDel, redisDecr } from "../lib/redis.js";

/**
 * Keying strategy for a campus deployment:
 * hundreds of customers share a handful of NAT/campus-Wi-Fi public IPs, so
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

// ─── distributed store (Upstash) ──────────────────────────────────────
// Without this, limits live in each server process's memory: they reset on
// every deploy/restart and don't add up across instances. With Redis they
// survive restarts and are shared by every replica. Falls back to the
// default in-memory store when Redis isn't configured.

// atomic INCR + first-hit PEXPIRE in one round trip; also returns the
// key's remaining TTL (ms) so the store can report an exact resetTime
const INCR_WINDOW_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {count, ttl}
`;

const redisStore = (windowMs, prefix) => ({
    init: () => {},
    /**
     * express-rate-limit store contract: return the hit count for this
     * window. Throws on Redis failure — limiters are built with
     * passOnStoreError so a Redis outage degrades to pass-through instead
     * of blocking the whole API.
     */
    /**
     * express-rate-limit v8 contract: return { totalHits, resetTime }.
     * Throws on Redis failure — limiters are built with passOnStoreError so
     * a Redis outage degrades to pass-through instead of blocking the API.
     */
    increment: async (key) => {
        const out = await redisEval(
            INCR_WINDOW_LUA,
            `${prefix}:${key}`,
            String(windowMs),
        );
        // Lua returns [count, pttl]; null/short ⇒ Redis unavailable
        if (!Array.isArray(out) || typeof out[0] !== "number") {
            throw new Error("rate-limit store unavailable");
        }
        const [totalHits, pttl] = out;
        // exact window end from the key's live TTL — falls back to a full
        // window if the key somehow lost its expiry (pttl = -1)
        const resetTime = new Date(Date.now() + (pttl > 0 ? pttl : windowMs));
        return { totalHits, resetTime };
    },
    // required by express-rate-limit's store validation — only actually
    // called when skipFailedRequests/skipSuccessfulRequests is enabled
    // (this app uses neither), but the shim must exist to pass the check
    decrement: async (key) => {
        await redisDecr(`${prefix}:${key}`);
    },
    resetKey: async (key) => {
        await redisDel(`${prefix}:${key}`);
    },
});

/** shared limiter options — Redis store when configured, memory otherwise */
const withStore = (windowMs, prefix, extra = {}) => ({
    keyGenerator,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    ...(redisEnabled() ? { store: redisStore(windowMs, prefix) } : {}),
    passOnStoreError: true, // Redis down ⇒ let traffic through, don't brick the API
    ...extra,
});

/**
 * Global limiter — applies to every /api route.
 * 300 requests / 5 min per user (~1/sec sustained), plus a shared-IP
 * fallback for unauthenticated traffic. Generous on purpose.
 */
export const globalLimiter = rateLimit(
    withStore(5 * 60 * 1000, "g", {
        limit: 300,
        message: {
            success: false,
            message:
                "Too many requests — please slow down and try again shortly.",
        },
    }),
);

/**
 * Sensitive/expensive operations — tighter buckets.
 * Auth: 30 / 5 min per user, 60 / 5 min per IP (covers the /sync storm
 * when a lecture-hall of customers signs in at once).
 */
export const authLimiter = rateLimit(
    withStore(5 * 60 * 1000, "a", {
        limit: 30,
        message: {
            success: false,
            message: "Too many attempts — try again in a few minutes.",
        },
    }),
);

export const authIpLimiter = rateLimit(
    withStore(5 * 60 * 1000, "ai", {
        limit: 60,
        // this one is IP-keyed by design, not per-user
        keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip)}`,
        message: {
            success: false,
            message: "Too many attempts from this network — try again shortly.",
        },
    }),
);

/**
 * Order placement: 20 orders / 15 min per user — plenty for real usage,
 * tight enough to stop a scripted order flood hammering the DB.
 */
export const orderLimiter = rateLimit(
    withStore(15 * 60 * 1000, "o", {
        limit: 20,
        message: {
            success: false,
            message:
                "Order limit reached — please wait before ordering again.",
        },
    }),
);

/**
 * Image uploads: 40 / 15 min per user. Each upload costs bandwidth and
 * Cloudinary credits, so this is tighter than the global ceiling — but
 * loose enough for a vendor setting up a menu in one sitting.
 */
export const uploadLimiter = rateLimit(
    withStore(15 * 60 * 1000, "u", {
        limit: 40,
        message: {
            success: false,
            message: "Too many uploads — please wait a few minutes.",
        },
    }),
);
