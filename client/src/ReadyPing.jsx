import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "./api.js";
import { useProfile } from "./ProfileContext.jsx";
import {
    notificationPermission,
    showNotification,
} from "./pwa.js";

const POLL_MS = 20_000;

/**
 * Watches the customer's in-flight orders and fires a browser notification
 * the moment one turns "ready" — the campus equivalent of "your food is up".
 * Renders nothing. The in-app chime (OrdersPage) still plays as before;
 * this covers the tab-in-the-background case.
 */
export default function ReadyPing() {
    const { getToken } = useAuth();
    const profileCtx = useProfile();
    const isStaff = profileCtx?.isStaff;

    // orderId → last status we saw
    const statusMap = useRef(null);

    useEffect(() => {
        if (isStaff) {
            statusMap.current = null;
            return;
        }

        let cancelled = false;

        const tick = async () => {
            try {
                const res = await api("/api/orders", { getToken });
                if (!res.ok || cancelled) return;

                const orders = res.data.orders || [];
                const next = new Map(
                    orders.map((o) => [o._id, o.status]),
                );

                if (statusMap.current && notificationPermission() === "granted") {
                    for (const o of orders) {
                        const before = statusMap.current.get(o._id);
                        if (before && before !== "ready" && o.status === "ready") {
                            showNotification(
                                "Your food is ready!",
                                `Token #${o.tokenNumber ?? ""} — pick it up at ${
                                    o.canteen?.name || "the counter"
                                }`,
                            );
                        }
                    }
                }

                statusMap.current = next;
            } catch {
                /* transient — next poll retries */
            }
        };

        tick();
        const t = setInterval(tick, POLL_MS);
        return () => {
            cancelled = true;
            clearInterval(t);
        };
    }, [getToken, isStaff]);

    return null;
}
