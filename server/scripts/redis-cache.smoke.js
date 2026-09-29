/**
 * Smoke test: server/src/lib/redis.js — read-through cache + invalidation.
 *
 * Mocks global fetch (Upstash REST) so no network is needed, then verifies:
 *   1. first read misses and caches, second read hits
 *   2. bumpVersion("<root>") invalidates every key in that namespace tree
 *      ("canteens" bumps "canteens:list" AND "canteens:detail:<id>")
 *   3. GET results are coerced from strings (Upstash returns GET values as
 *      strings) — without coercion the version reads as 0 forever and the
 *      cache would never invalidate
 */

const store = new Map(); // mocked Redis: key -> raw string value

globalThis.fetch = async (_url, opts) => {
  const [op, ...args] = JSON.parse(opts.body);
  let result = null;

  if (op === "GET") {
    // Upstash REST returns GET values as strings
    result = store.has(args[0]) ? store.get(args[0]) : null;
  } else if (op === "SET") {
    store.set(args[0], args[1]);
    result = "OK";
  } else if (op === "INCR") {
    const n = Number(store.get(args[0]) || 0) + 1;
    store.set(args[0], String(n));
    result = n; // INCR comes back as a JSON number
  } else if (op === "DEL") {
    result = store.delete(args[0]) ? 1 : 0;
  }

  return { ok: true, json: async () => ({ result }) };
};

process.env.UPSTASH_REDIS_REST_URL = "http://mock.local";
process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";

const redis = await import("../src/lib/redis.js");

let loads = 0;
const loader = async () => ({ n: ++loads });

// snapshot of loads after each call — the checks below compare against
// these, NOT the final `loads` (which is 6 once everything has run)
let lA, lB, lC, lD, lE, lF;

// 1. miss → load → cached
const a = await redis.cached("canteens:list", 60, loader);
lA = loads;

// 2. same version → hit, no reload
const b = await redis.cached("canteens:list", 60, loader);
lB = loads;

// 3. write flow bumps the ROOT namespace → list must invalidate
await redis.bumpVersion("canteens");
const c = await redis.cached("canteens:list", 60, loader);
lC = loads;

// 4. detail keys share the same root → one bump invalidates them too
const d = await redis.cached("canteens:detail:abc", 60, loader);
lD = loads;
await redis.bumpVersion("canteens");
const e = await redis.cached("canteens:detail:abc", 60, loader);
lE = loads;

// 5. reviews flow: bumpVersion("reviews") invalidates every
//    "reviews:<canteenId>:list" key (root of that namespace tree)
const f = await redis.cached("reviews:42:list", 60, loader);
lF = loads;
await redis.bumpVersion("reviews");
const g = await redis.cached("reviews:42:list", 60, loader);

const checks = [
  ["initial read is a miss", a.hit === false && lA === 1],
  ["second read is a hit", b.hit === true && lB === 1],
  ["root bump invalidates the list cache", c.hit === false && lC === 2],
  ["detail key cached after its own miss", d.hit === false && lD === 3],
  ["root bump invalidates detail keys too", e.hit === false && lE === 4],
  ["reviews list cached", f.hit === false && lF === 5],
  [
    "reviews root bump invalidates per-canteen lists",
    g.hit === false && loads === 6,
  ],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
  if (!ok) failed++;
}

// self-diagnosis: dump observations so a failure says WHAT happened
console.log(
  "observed:",
  JSON.stringify({
    loads,
    hits: [a.hit, b.hit, c.hit, d.hit, e.hit, f.hit, g.hit],
    redisEnabled: redis.redisEnabled(),
    keys: [...store.keys()],
  }),
);

if (failed) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}

console.log("All cache invalidation checks passed.");
