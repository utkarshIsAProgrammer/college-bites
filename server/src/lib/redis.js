/**
 * Upstash Redis REST client — a ~40-line fetch wrapper, not a dependency.
 *
 * Upstash speaks a simple HTTP protocol: POST the command as a JSON array,
 * get back `{ result, error }`. No TCP socket, no connection pool to manage.
 *
 * Everything here degrades gracefully: if the env vars are absent or Redis
 * errors, callers get `null` and fall back to their in-memory behavior, so
 * the app never hard-depends on Redis being reachable.
 */

const URL_ = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

/** true when Redis is configured and callable */
export const redisEnabled = () => Boolean(URL_ && TOKEN);

/** run a raw command; resolves to `result` or null (never throws) */
async function cmd(...args) {
    if (!redisEnabled()) return null;
    try {
        const res = await fetch(URL_, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(args),
            signal: AbortSignal.timeout(2500), // Redis must never slow the API down
        });
        if (!res.ok) return null;
        const { result, error } = await res.json();
        if (error) {
            console.error("Redis error:", error);
            return null;
        }
        return result;
    } catch {
        return null; // timeout, network blip, bad env — all the same: skip Redis
    }
}

/** GET a key, JSON-parsed. null on miss/absence/error. */
export const redisGet = async (key) => {
    const raw = await cmd("GET", key);
    if (raw === null) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
};

/** SET a key with optional TTL seconds. false on error. */
export const redisSet = async (key, value, ttlSeconds) => {
    const args = ["SET", key, JSON.stringify(value)];
    if (ttlSeconds) args.push("EX", String(ttlSeconds));
    const res = await cmd(...args);
    return res !== null;
};

/** delete one key. false on error. */
export const redisDel = (key) => cmd("DEL", key).then((r) => r !== null);

/** bump a counter by 1, creating it at 0 if missing; -1 on error. */
export const redisIncr = (key) =>
    cmd("INCR", key).then((r) => (typeof r === "number" ? r : -1));

/** drop a counter by 1 (may go negative — caller clamps); -1 on error. */
export const redisDecr = (key) =>
    cmd("DECR", key).then((r) => (typeof r === "number" ? r : -1));

/**
 * EVAL a Lua script with keys/args. Unlike the helpers above this does NOT
 * swallow script errors (a bad script is a deploy bug, not a transient),
 * but network/env failures still resolve to null so callers can fall back.
 */
export async function redisEval(script, ...keysAndArgs) {
    if (!redisEnabled()) return null;
    try {
        const res = await fetch(URL_, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(["EVAL", script, "1", ...keysAndArgs]),
            signal: AbortSignal.timeout(2500),
        });
        if (!res.ok) return null;
        const { result, error } = await res.json();
        if (error) throw new Error(error);
        return result;
    } catch (err) {
        if (err instanceof SyntaxError || /script/i.test(String(err?.message))) {
            console.error("Redis EVAL error:", err);
        }
        return null;
    }
}

/**
 * Versioned cache — the cheap way to invalidate without SCAN/keyspace hooks.
 *
 * Every key is prefixed with a version number stored in Redis. Bumping the
 * version instantly orphans every old key in that namespace (they expire on
 * their own TTL), and the next read starts fresh. Write flows bump; nothing
 * else needs to know the keys.
 *
 * The version counter lives at the ROOT of the namespace (everything before
 * the first ":"): bumping "canteens" invalidates "canteens:list" and every
 * "canteens:detail:<id>" in one shot — no way to enumerate per-id keys, so
 * root versioning is what makes detail caches invalidatable at all.
 *
 *   await cached("canteens:list", 60, loader)   // read-through
 *   await bumpVersion("canteens")               // after any write
 */
// "canteens:detail:abc" → "canteens" (root of the namespace tree)
const rootNs = (ns) => String(ns).split(":", 1)[0] || String(ns);

const bumpKey = (ns) => `cver:${rootNs(ns)}`;

export async function bumpVersion(ns) {
    const v = await redisIncr(bumpKey(ns));
    return v > 0 ? v : null; // -1/0 ⇒ Redis down or not configured
}

async function currentVersion(ns) {
    const v = await cmd("GET", bumpKey(ns));
    // Upstash REST returns INCR results as JSON numbers but GET results as
    // strings — coerce, or the version would read as v0 forever and the
    // cache would never invalidate.
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : 0; // missing/unparseable ⇒ v0
}

/** read-through cache: returns cached data, or runs loader() and caches it */
export async function cached(ns, ttlSeconds, loader) {
    if (!redisEnabled()) return { data: await loader(), hit: false };

    const v = await currentVersion(ns);
    const key = `cv${v}:${ns}`;

    const hit = await redisGet(key);
    if (hit !== null) return { data: hit, hit: true };

    const data = await loader();
    // cache regardless of the version we read — a concurrent bump only means
    // this entry gets orphaned early, which is fine
    redisSet(key, data, ttlSeconds).catch(() => {});
    return { data, hit: false };
}
