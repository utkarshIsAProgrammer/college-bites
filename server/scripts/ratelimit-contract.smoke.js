/**
 * Smoke test: express-rate-limit v8 store contract for the Upstash store.
 * Run with: node scripts/ratelimit-contract.smoke.js
 *
 * Mocks the Upstash REST endpoint (EVAL returns the [count, pttl] array the
 * middleware's Lua script expects), then drives the globalLimiter middleware
 * with stub req/res — the exact path that produced ERR_ERL_INVALID_HITS and
 * ERR_ERL_HEADERS_NO_RESET before the { totalHits, resetTime } fix.
 *
 * Verifies:
 *   1. the request passes through (next called, no 429, no thrown error)
 *   2. draft-8 RateLimit headers were set (resetTime path exercised)
 *   3. a second request increments (totalHits=2 reported via headers)
 */

const store = new Map(); // mocked Redis

globalThis.fetch = async (_url, opts) => {
    const [op, key] = JSON.parse(opts.body);
    let result = null;

    // Upstash EVAL body: ["EVAL", script, "1", key, windowMs]
    if (op === "EVAL") {
        const body = JSON.parse(opts.body);
        const fullKey = body[3];
        const windowMs = Number(body[4]);
        const n = Number(store.get(fullKey) || 0) + 1;
        store.set(fullKey, n);
        const pttl = windowMs; // fresh key ⇒ full window remaining
        result = [n, pttl]; // Lua returns {count, ttl} → JSON array
    } else if (op === "DEL") {
        result = store.delete(key) ? 1 : 0;
    }

    return { ok: true, json: async () => ({ result }) };
};

process.env.UPSTASH_REDIS_REST_URL = "http://mock.local";
process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";

const { globalLimiter } = await import("../src/middlewares/rateLimit.middleware.js");

const makeReq = () => ({ ip: "10.0.0.9", method: "GET", path: "/x", headers: {} });
const makeRes = () => {
    const headers = {};
    return {
        headers,
        headersSent: false,
        setHeader: (k, v) => {
            headers[k] = v;
        },
        append: (k, v) => {
            headers[k] = headers[k]
                ? `${headers[k]}, ${v}`
                : v;
        },
        status() {
            return this;
        },
        send() {},
    };
};

let failures = 0;
const check = (name, ok) => {
    console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
    if (!ok) failures++;
};

// request 1 — first hit in the window
{
    const req = makeReq();
    const res = makeRes();
    let nextCalled = 0;
    let err = null;
    await new Promise((resolve) => {
        try {
            globalLimiter(req, res, () => {
                nextCalled++;
                resolve();
            });
        } catch (e) {
            err = e;
            resolve();
        }
        setTimeout(resolve, 3000); // hang guard
    });

    check("no error thrown on first request", err === null);
    check("request passes through (next called)", nextCalled === 1);
    const rl = res.headers["RateLimit"] || res.headers["ratelimit"];
    check("draft-8 RateLimit header set", Boolean(rl));
    // draft-8 reports REMAINING: 300-limit ⇒ r=299 after one hit
    check(
        "header reports remaining=299 with a reset time",
        /r=299/.test(String(rl)) && /t=\d+/.test(String(rl)),
    );
}

// request 2 — same window, counter must increment
{
    const req = makeReq();
    const res = makeRes();
    await new Promise((resolve) => {
        globalLimiter(req, res, () => resolve());
        setTimeout(resolve, 3000);
    });
    const rl = String(res.headers["RateLimit"] || res.headers["ratelimit"]);
    check("second request decrements remaining to 298", /r=298/.test(rl));
}

if (failures) {
    console.error(`${failures} check(s) failed`);
    process.exit(1);
}
console.log("Rate-limit store contract verified.");
