/**
 * PWA + notifications plumbing — registered once from main.jsx.
 *
 *  • Service worker: offline shell + cached menu (see public/sw.js)
 *  • Notification permission helper: only ever requested from a user gesture
 */

export function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    // dev: actively unregister any SW from an earlier session and wipe its
    // caches — otherwise the stale shell keeps masking every code change.
    if (import.meta.env.DEV) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
            for (const reg of regs) reg.unregister();
        });
        if ("caches" in window) {
            caches.keys().then((keys) => {
                for (const key of keys) caches.delete(key);
            });
        }
        return;
    }

    if (location.protocol !== "https:" && location.hostname !== "localhost") {
        // http:// on a LAN IP (phone testing) can't run SWs — fail silently
        return;
    }
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {
            /* offline support is progressive — ignore failures */
        });
    });
}

/** true when this browser can show notifications at all */
export const notificationsSupported = () =>
    typeof window !== "undefined" && "Notification" in window;

/** current permission: "granted" | "denied" | "default" | "unsupported" */
export const notificationPermission = () =>
    notificationsSupported() ? Notification.permission : "unsupported";

/**
 * Ask for notification permission. MUST be called from a click handler —
 * browsers reject permission requests that aren't user-initiated.
 * → "granted" | "denied" | "default" | "unsupported"
 */
export async function requestNotificationPermission() {
    if (!notificationsSupported()) return "unsupported";
    if (Notification.permission !== "default") return Notification.permission;
    try {
        return await Notification.requestPermission();
    } catch {
        return "denied";
    }
}

/** fire a local notification (no-ops quietly when denied/unsupported) */
export function showNotification(title, body) {
    if (notificationPermission() !== "granted") return;
    try {
        new Notification(title, { body, icon: "/favicon.svg", tag: title });
    } catch {
        /* some browsers restrict the constructor — ignore */
    }
}
