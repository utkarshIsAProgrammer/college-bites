import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "./api.js";
import { useCanteen } from "./CanteenContext.jsx";
import { useToast } from "./toast.jsx";
import { playNewOrderSound } from "./sound.js";

const POLL_MS = 10_000;

const prefersSound = () => localStorage.getItem("cb-order-sounds") !== "off";

/**
 * Watches the vendor's queue from App level — regardless of which tab is
 * open — and fires a toast + beep the moment a new order appears, so a
 * busy vendor never misses one. Renders nothing.
 */
export default function VendorPing() {
    const { getToken } = useAuth();
    const { canteen } = useCanteen();
    const toast = useToast();

    const knownIds = useRef(null); // null until the first successful load
    const loadRef = useRef(null);

    useEffect(() => {
        if (!canteen) {
            knownIds.current = null;
            return;
        }

        loadRef.current = async () => {
            try {
                const res = await api("/api/orders/vendor/queue?active=1", {
                    getToken,
                });
                if (!res.ok) return;

                const next = res.data.orders || [];
                const ids = new Set(next.map((o) => o._id));

                if (knownIds.current) {
                    for (const o of next) {
                        if (!knownIds.current.has(o._id)) {
                            toast(`🔔 New order #${o.tokenNumber}`);
                            if (prefersSound()) playNewOrderSound();
                        }
                    }
                }

                knownIds.current = ids;
            } catch {
                /* transient network error — the next poll retries */
            }
        };

        loadRef.current();
        const t = setInterval(() => loadRef.current?.(), POLL_MS);
        return () => clearInterval(t);
    }, [canteen?._id, getToken, toast]);

    return null;
}
