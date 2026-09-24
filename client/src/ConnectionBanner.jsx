import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "./toast.jsx";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";
const POLL_MS = 15_000;

/**
 * Watches /api/health and shows a strip across the top when the server or
 * its database goes away, with a Retry button and a toast on recovery.
 *
 * Distinguishes the two failure modes that actually happen here:
 *   "offline" → nothing answered (server not running / no network)
 *   "db"      → server answered 503, its database is unreachable
 */
export default function ConnectionBanner() {
    const toast = useToast();
    const [state, setState] = useState("ok"); // ok | db | offline
    const [checking, setChecking] = useState(false);
    const wasDown = useRef(false);

    const check = useCallback(async () => {
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
            wasDown.current = true;
            setState("offline");
            return;
        }

        setChecking(true);
        try {
            const res = await fetch(`${API_BASE}/api/health`);

            if (res.ok) {
                if (wasDown.current) toast("Back online ✓");
                wasDown.current = false;
                setState("ok");
            } else {
                wasDown.current = true;
                setState("db");
            }
        } catch {
            wasDown.current = true;
            setState("offline");
        } finally {
            setChecking(false);
        }
    }, [toast]);

    useEffect(() => {
        check();

        const timer = setInterval(check, POLL_MS);
        window.addEventListener("online", check);
        window.addEventListener("offline", check);

        return () => {
            clearInterval(timer);
            window.removeEventListener("online", check);
            window.removeEventListener("offline", check);
        };
    }, [check]);

    if (state === "ok") return null;

    const isDb = state === "db";

    return (
        <div
            className={`conn-banner ${isDb ? "conn-db" : "conn-offline"}`}
            role="status"
        >
            <span className="conn-dot" aria-hidden="true" />
            <p className="conn-text">
                {isDb ? (
                    <>
                        <strong>Database unreachable.</strong> The server is
                        running but can't reach MongoDB — orders and menu edits
                        will fail until it reconnects.
                    </>
                ) : (
                    <>
                        <strong>No connection to the server.</strong> Retrying
                        in the background…
                    </>
                )}
            </p>
            <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={check}
                disabled={checking}
            >
                {checking ? "Checking…" : "Retry now"}
            </button>
        </div>
    );
}
