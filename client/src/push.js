/**
 * Web Push plumbing — subscription lifecycle, called from PushSetup.
 *
 * Flow: fetch the server's public VAPID key → ask the browser for
 * notification permission (user gesture only) → subscribe to push →
 * POST the subscription to the server. Unsubscribing reverses it.
 *
 * getToken comes from useAuth() in the component (same convention as api.js).
 */

const API_BASE = import.meta.env.VITE_API_URL || "";

const urlBase64ToUint8Array = (base64String) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, "+")
        .replace(/_/g, "/");
    const raw = atob(base64);
    return Uint8Array.from([...raw].map((ch) => ch.charCodeAt(0)));
};

const authedFetch = async (path, body, getToken) => {
    const headers = { "Content-Type": "application/json" };
    if (getToken) {
        const token = await getToken();
        if (token) headers.Authorization = `Bearer ${token}`;
    }

    return fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });
};

/** true when this browser can do web push at all */
export const pushSupported = () =>
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

/** current push state: "subscribed" | "unsubscribed" | "unsupported" | "denied" */
export const pushState = async () => {
    if (!pushSupported()) return "unsupported";
    if (Notification.permission === "denied") return "denied";

    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return sub ? "subscribed" : "unsubscribed";
};

/**
 * A usable registration for push. pwa.js skips SW registration in dev
 * (it unregisters to avoid stale shells), which would leave
 * navigator.serviceWorker.ready hanging forever — so register on demand
 * here instead. In prod this just picks up the registration pwa.js made.
 */
const ensureRegistration = async () => {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing) return navigator.serviceWorker.ready;

    await navigator.serviceWorker.register("/sw.js");
    return navigator.serviceWorker.ready; // resolves once it's active
};

/**
 * Ask permission + subscribe this device + register it server-side.
 * MUST be called from a click handler.
 *
 * → "subscribed" | "denied" (blocked) | "default" (dismissed prompt)
 *   | "unsubscribed" (server/config issue) | "error" (unexpected)
 */
export const enablePush = async (getToken) => {
    if (!pushSupported()) return "unsupported";

    try {
        const permission = await Notification.requestPermission();
        if (permission === "denied") return "denied";
        if (permission !== "granted") return "default"; // dismissed

        const reg = await ensureRegistration();
        const vapidKey = await fetch(`${API_BASE}/api/push/key`)
            .then((r) => r.json())
            .then((d) => d.publicKey)
            .catch(() => null);

        if (!vapidKey) return "unsubscribed";

        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidKey),
            });
        }

        const res = await authedFetch(
            "/api/push/subscribe",
            { subscription: sub.toJSON(), topics: ["orders", "ready"] },
            getToken,
        );

        return res.ok ? "subscribed" : "unsubscribed";
    } catch (err) {
        console.error("enablePush failed:", err);
        return "error";
    }
};

/** remove this device's subscription both browser-side and server-side */
export const disablePush = async (getToken) => {
    if (!pushSupported()) return "unsubscribed";

    try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (sub) {
            await authedFetch(
                "/api/push/unsubscribe",
                { subscription: sub.toJSON() },
                getToken,
            ).catch(() => {});

            await sub.unsubscribe();
        }
    } catch (err) {
        console.error("disablePush failed:", err);
    }
    return "unsubscribed";
};
