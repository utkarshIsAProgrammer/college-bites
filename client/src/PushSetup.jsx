import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { pushState, enablePush, disablePush } from "./push.js";
import { useProfile } from "./ProfileContext.jsx";
import { useToast } from "./toast.jsx";

/**
 * The opt-in for device notifications — rendered inside the topbar so both
 * customers and vendors see it until they've made a choice. The browser only
 * allows the permission prompt from a real click, so this is deliberately a
 * button, never an automatic prompt.
 *
 * enablePush() returns a state string, including "default" (the user
 * dismissed the browser prompt) and "error" — both are surfaced as toasts
 * so the button never looks dead.
 */
export default function PushSetup() {
    const { getToken } = useAuth();
    const { isStaff } = useProfile();
    const toast = useToast();
    const [state, setState] = useState(null); // null = still checking
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let alive = true;
        pushState()
            .then((s) => alive && setState(s))
            .catch(() => alive && setState("unsubscribed"));
        return () => {
            alive = false;
        };
    }, []);

    const turnOn = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const next = await enablePush(getToken);
            setState(next === "error" ? "unsubscribed" : next);
            if (next === "default") {
                toast("Allow notifications in the browser prompt to finish");
            } else if (next === "denied") {
                toast(
                    "Notifications are blocked — enable them in this site's settings",
                    "error",
                );
            } else if (next === "error" || next === "unsubscribed") {
                toast("Couldn't enable notifications — try again", "error");
            }
        } finally {
            setBusy(false);
        }
    };

    const turnOff = async () => {
        if (busy) return;
        setBusy(true);
        try {
            setState(await disablePush(getToken));
        } finally {
            setBusy(false);
        }
    };

    // hidden entirely while checking, unsupported, or already on
    if (!state || state === "subscribed" || state === "unsupported") {
        return null;
    }

    if (state === "denied") {
        return (
            <button
                type="button"
                className="push-chip push-chip-denied"
                title="Notifications are blocked for this site — enable them in your browser's site settings, then reload."
                onClick={turnOff}
            >
                Notifications blocked
            </button>
        );
    }

    return (
        <button
            type="button"
            className="push-chip"
            onClick={turnOn}
            disabled={busy}
            title={
                isStaff
                    ? "Get a system alert for every new order, payment proof and cancellation — even with this tab closed."
                    : "Get a system alert when your food is ready — even with this tab closed."
            }
        >
            {busy ? "Enabling…" : "Enable notifications"}
        </button>
    );
}
