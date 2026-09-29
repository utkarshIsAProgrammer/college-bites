/* PrePlate service worker — offline shell + menu cache + web push.
 *
 * Strategy:
 *   • app shell (index.html, assets): cache-first, refreshed in the background
 *     (stale-while-revalidate) so the app opens instantly, even offline
 *   • GET /api/menu + /api/canteens: network-first with cache fallback, so the
 *     menu still renders when campus Wi-Fi drops
 *   • everything else (POST/PATCH, auth, orders): always network — never cached
 *   • push: server-sent order events shown as system notifications, even when
 *     every tab is closed
 */

const VERSION = "ft-v3";
const SHELL_CACHE = `${VERSION}-shell`;
const DATA_CACHE = `${VERSION}-data`;
const SHELL_ASSETS = ["/", "/index.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches
            .open(SHELL_CACHE)
            .then((cache) => cache.addAll(SHELL_ASSETS))
            .then(() => self.skipWaiting()),
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((k) => !k.startsWith(VERSION))
                        .map((k) => caches.delete(k)),
                ),
            )
            .then(() => self.clients.claim()),
    );
});

self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") return;

    const url = new URL(request.url);

    // menu & canteen data: network-first, fall back to cache when offline
    const isMenuData =
        url.pathname.startsWith("/api/menu") ||
        url.pathname.startsWith("/api/canteens");

    if (isMenuData) {
        event.respondWith(
            fetch(request)
                .then((res) => {
                    const copy = res.clone();
                    caches.open(DATA_CACHE).then((cache) => cache.put(request, copy));
                    return res;
                })
                .catch(() =>
                    caches.match(request).then(
                        (cached) =>
                            cached ||
                            new Response(
                                JSON.stringify({
                                    success: false,
                                    message: "Offline — showing saved data.",
                                }),
                                { status: 503, headers: { "Content-Type": "application/json" } },
                            ),
                    ),
                ),
        );
        return;
    }

    // same-origin static assets + shell: stale-while-revalidate
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(request).then((cached) => {
                const fresh = fetch(request)
                    .then((res) => {
                        const copy = res.clone();
                        caches
                            .open(SHELL_CACHE)
                            .then((cache) => cache.put(request, copy));
                        return res;
                    })
                    .catch(() => cached);
                return cached || fresh;
            }),
        );
    }
});

// allow the app to trigger a skip-waiting update on new deploys
self.addEventListener("message", (event) => {
    if (event.data === "SKIP_WAITING") self.skipWaiting();
});

// ─── Web Push — server-sent order events ─────────────────────────────
// The server fires a VAPID-signed push on order/payment events; this shows
// it as a system notification even when every PrePlate tab is closed.

self.addEventListener("push", (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = { title: "PrePlate", body: event.data?.text() || "" };
    }

    event.waitUntil(
        self.registration.showNotification(data.title || "PrePlate", {
            body: data.body || "",
            icon: "/favicon.svg",
            badge: "/favicon.svg",
            tag: data.tag, // same-tag events replace each other, not stack
            renotify: Boolean(data.tag), // ...and re-alert when they do
            data: { url: data.url || "/" },
        }),
    );
});

// tapping a notification opens/focuses the app — focus what's already there,
// otherwise open a fresh window (SPA has no per-path routes)
self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    event.waitUntil(
        (async () => {
            const clientList = await self.clients.matchAll({
                type: "window",
                includeUncontrolled: true,
            });

            for (const client of clientList) {
                if (new URL(client.url).origin === self.location.origin) {
                    await client.focus();
                    return;
                }
            }
            await self.clients.openWindow(event.notification?.data?.url || "/");
        })(),
    );
});
