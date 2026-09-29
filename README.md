# PrePlate — campus dining, pre-ordered

Students order from their seat, pay by UPI or cash, and pick up with a token —
no queue. Vendors run their canteen from a dashboard: live queue, menu
management, payment verification, daily stats.

## Stack

| Layer | Tech |
| --- | --- |
| Client | React 19 + Vite, Clerk auth, PWA (offline shell), Web Push |
| API | Node + Express 5, Clerk auth, Mongoose (MongoDB Atlas) |
| Payments | UPI deep links + QR (amount-locked), UTR verification flow |
| Infra (optional) | Upstash Redis (REST) — shared rate limiting + read-through cache; Cloudinary — image CDN |

## Repo layout

```
client/   React SPA (Vite) — src/, public/ (sw.js, manifest)
server/   Express API — src/{routes,controllers,middlewares,models,lib}
render.yaml  Render deploy blueprint (API + static site)
```

## Quick start (local)

Prereqs: Node 20+, a MongoDB Atlas cluster (free tier is fine), a Clerk app
(publishable + secret keys).

```bash
# 1 — API
cd server
cp .env.example .env            # fill in MONGO_URI + CLERK keys at minimum
npm install
npm run dev                     # → http://localhost:5000

# 2 — Web Push (one-time)
node -e "console.log(JSON.stringify(require('web-push').generateVAPIDKeys()))"
# put publicKey/privateKey into server/.env as VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
# VAPID_SUBJECT is just a contact identifier (mailto: or https://) — no mail is sent

# 3 — Client
cd ../client
cp .env .example 2>/dev/null || true
# .env needs: VITE_CLERK_PUBLISHABLE_KEY, VITE_API_URL=http://localhost:5000
npm install
npm run dev                     # → http://localhost:5173 (proxies /api to :5000)
```

The client's dev proxy forwards `/api` to the server, so `VITE_API_URL` can
stay empty locally; set it to the deployed API URL in production.

## Smoke tests

No database or network needed — both mock their I/O:

```bash
cd server
node scripts/redis-cache.smoke.js         # cache invalidation contract (7 checks)
node scripts/ratelimit-contract.smoke.js  # express-rate-limit v8 store contract (5 checks)
```

## Deployment (Render)

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, select the repo — `render.yaml` provisions
   the API service and the static client.
3. Fill the `sync: false` env vars in each service's dashboard:
   - API: `MONGO_URI`, `CLERK_SECRET_KEY`, Cloudinary keys, VAPID keys,
     optional Upstash keys
   - Client: `VITE_CLERK_PUBLISHABLE_KEY`
4. Add your Clerk production domain to the Clerk dashboard's allowed origins.
5. First deploy creates the free services; the API health check lives at
   `/api/health`.

Optional: create a free Upstash Redis (REST API) database and paste its
`UPSTASH_REDIS_REST_URL`/`TOKEN` into the API service — without them the app
falls back to in-memory rate limiting and no caching, which is fine to start.

## Notes

- CORS: the API allows only `CLIENT_URL` in production.
- Rate limiting is keyed per Clerk user (campus-NAT safe), with an IP fallback
  for anonymous traffic.
- Push notifications require HTTPS (or localhost) — that's a browser rule.
