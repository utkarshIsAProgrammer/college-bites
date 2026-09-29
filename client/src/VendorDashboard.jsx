import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "./api.js";
import { useToast } from "./toast.jsx";
import Reveal from "./Reveal.jsx";
import { useCanteen } from "./CanteenContext.jsx";
import PhotoPicker from "./PhotoPicker.jsx";
import SetupChecklist from "./SetupChecklist.jsx";
import TokenSlip from "./TokenSlip.jsx";
import VendorSettings from "./VendorSettings.jsx";
import VegDot from "./VegDot.jsx";
import { canTransition, nextActions } from "./orderFlow.js";
import {
    AlertIcon,
    BellIcon,
    CheckIcon,
    CloseIcon,
    FlameIcon,
    InboxIcon,
    MaximizeIcon,
    MonitorIcon,
    NoteIcon,
    PotIcon,
    VolOffIcon,
    VolOnIcon,
} from "./icons.jsx";
import { playKitchenChime } from "./sound.js";
import {
    notificationPermission,
    requestNotificationPermission,
} from "./pwa.js";

const POLL_MS = 12000;

const STATUS_STYLES = {
    pending: "pill-amber",
    accepted: "pill-ink",
    preparing: "pill-ember",
    ready: "pill-green",
    completed: "pill-green",
    cancelled: "pill-red",
};

function PayPill({ payment }) {
    if (!payment) return null;
    const cls =
        payment.state === "confirmed"
            ? "pill-green"
            : payment.state === "failed"
              ? "pill-red"
              : "pill-amber";
    const label =
        payment.state === "submitted"
            ? "verify"
            : payment.state === "confirmed"
              ? "paid"
              : payment.state === "failed"
                ? "failed"
                : "pending";
    return (
        <span className={`pill ${cls}`}>
            {payment.method === "upi_qr" ? "UPI" : "Cash"} · {label}
        </span>
    );
}

/**
 * The seller's single screen — everything a canteen owner needs, in one place:
 * setup checklist, canteen settings (incl. UPI/QR payments), the live order
 * queue, today's stats, and dish management. No tab-hopping.
 */
export default function VendorDashboard() {
    const { getToken } = useAuth();
    const { canteen, isMyCanteen, register, loaded } = useCanteen();
    const toast = useToast();

    const [orders, setOrders] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [servingMode, setServingMode] = useState(false);
    const [menuBusy, setMenuBusy] = useState(false);

    // "active" = the live queue, "unpaid" = money still owed (includes
    // completed orders, since cash is handed over at pickup)
    const [view, setView] = useState("active");

    // order currently rendered as a printable token slip
    const [slipOrder, setSlipOrder] = useState(null);

    // kitchen display needs fullscreen; track the request so the "enter" button
    // flips to "exit" when the browser actually goes fullscreen (Esc/ F11)
    const [isFullscreen, setIsFullscreen] = useState(false);

    // known order ids across polls — the diff is what triggers the chime
    const knownOrderIds = useRef(null);

    // per-action in-flight locks — one click = one request; double-taps are
    // swallowed instead of firing duplicate (and second-invalid) API calls
    const busyKeys = useRef(new Set());
    const [, setBusyTick] = useState(0); // re-render trigger when locks change
    const isBusy = (prefix, id) => busyKeys.current.has(`${prefix}:${id}`);

    // "NEW ORDER" flash banner: shows on fresh orders, auto-clears, can be
    // tapped to dismiss instantly
    const [flash, setFlash] = useState(null); // null | { token, count }
    const flashTimer = useRef(null);
    const showFlash = (order) => {
        setFlash((prev) => ({
            token: prev ? `${prev.token} · #${order.tokenNumber}` : `#${order.tokenNumber}`,
            count: (prev?.count || 0) + 1,
        }));
        clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlash(null), 8000);
    };
    useEffect(() => () => clearTimeout(flashTimer.current), []);

    const [soundOn, setSoundOn] = useState(
        () => localStorage.getItem("cb-order-sounds") !== "off",
    );
    const [notifyPerm, setNotifyPerm] = useState(() => notificationPermission());
    const toggleSound = () => {
        setSoundOn((s) => {
            localStorage.setItem("cb-order-sounds", s ? "off" : "on");
            return !s;
        });
    };

    // ─── registration form (pre-canteen state) ───
    const [regName, setRegName] = useState("");
    const [regLocation, setRegLocation] = useState("");
    const [regContactName, setRegContactName] = useState("");
    const [regContactPhone, setRegContactPhone] = useState("");
    const [regPhoto, setRegPhoto] = useState("");
    const [regBusy, setRegBusy] = useState(false);

    const handleRegister = async (e) => {
        e.preventDefault();
        if (!regName.trim()) return;
        setRegBusy(true);
        const result = await register({
            name: regName.trim(),
            location: regLocation.trim(),
            contactName: regContactName.trim(),
            contactPhone: regContactPhone.trim(),
            photo: regPhoto || undefined,
        });
        setRegBusy(false);
        if (result.ok) {
            toast("Canteen registered — welcome aboard!");
        } else {
            toast(result.message || "Could not register canteen", "error");
        }
    };

    const load = useCallback(async () => {
        try {
            const [q, s] = await Promise.all([
                api(
                    view === "unpaid"
                        ? "/api/orders/vendor/queue?unpaid=1"
                        : "/api/orders/vendor/queue?active=1",
                    { getToken },
                ),
                api("/api/orders/vendor/stats", { getToken }),
            ]);

            if (q.ok) {
                setOrders(q.data.orders || []);
                setError(null);

                // kitchen chime — diff against the previous poll; one bell per
                // poll even if several orders land together. Only sounds while
                // the kitchen display is open (VendorPing owns the global alert).
                const next = q.data.orders || [];
                const ids = new Set(next.map((o) => o._id));
                if (
                    knownOrderIds.current &&
                    document.body.dataset.kitchen === "1"
                ) {
                    const fresh = next.find(
                        (o) =>
                            !knownOrderIds.current.has(o._id) &&
                            o.status !== "completed" &&
                            o.status !== "cancelled",
                    );
                    if (fresh) {
                        showFlash(fresh);
                        if (
                            localStorage.getItem("cb-order-sounds") !== "off"
                        ) {
                            playKitchenChime();
                        }
                    }
                }
                knownOrderIds.current = ids;
            } else {
                setError(q.data.message || "Failed to load queue");
            }

            if (s.ok) setStats(s.data.stats);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [getToken, view]);

    useEffect(() => {
        if (!canteen) return;
        load();
        const t = setInterval(load, POLL_MS);
        return () => clearInterval(t);
    }, [load, canteen]);

    // tell the rest of the app the kitchen display owns alerts right now
    // (VendorPing reads this flag and stays quiet)
    useEffect(() => {
        if (servingMode) {
            document.body.dataset.kitchen = "1";
        } else {
            delete document.body.dataset.kitchen;
        }
        return () => delete document.body.dataset.kitchen;
    }, [servingMode]);

    // ─── fullscreen for the counter tablet ───
    const enterFullscreen = async () => {
        try {
            await document.documentElement.requestFullscreen();
        } catch {
            /* embedded/iframe or denied — the display still works inline */
        }
    };

    useEffect(() => {
        const onChange = () =>
            setIsFullscreen(Boolean(document.fullscreenElement));
        document.addEventListener("fullscreenchange", onChange);
        return () =>
            document.removeEventListener("fullscreenchange", onChange);
    }, []);

    // leaving kitchen mode also leaves fullscreen
    useEffect(() => {
        if (!servingMode && document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }
    }, [servingMode]);

    // Optimistic status change: the card moves the instant it's tapped, the
    // server reconciles afterwards, and any failure rolls the UI right back.
    const setStatus = async (order, status) => {
        // impossible moves (e.g. completed → completed) never leave the client
        if (!canTransition(order.status, status)) {
            toast(
                `Order #${order.tokenNumber} can't move from "${order.status}" to "${status}"`,
                "error",
            );
            return;
        }

        const actionKey = `status:${order._id}`;
        if (busyKeys.current.has(actionKey)) return;
        busyKeys.current.add(actionKey);
        setBusyTick((t) => t + 1);

        const snapshot = orders;
        setOrders((prev) =>
            prev.map((o) =>
                o._id === order._id ? { ...o, status } : o,
            ),
        );

        try {
            const res = await api(`/api/orders/vendor/${order._id}/status`, {
                method: "PATCH",
                getToken,
                body: { status },
            });
            if (!res.ok) {
                setOrders(snapshot); // undo — put the card back
                toast(res.data.message || "Update failed", "error");
                return;
            }
            // adopt the server's copy (token, timestamps, anything else)
            if (res.data.order) {
                const saved = res.data.order;
                setOrders((prev) =>
                    prev.map((o) =>
                        o._id === order._id ? { ...o, ...saved } : o,
                    ),
                );
            }
            toast(`Order #${order.tokenNumber} → ${status}`);
        } catch (err) {
            setOrders(snapshot);
            toast(err.message || "Update failed", "error");
        } finally {
            busyKeys.current.delete(actionKey);
            setBusyTick((t) => t + 1);
            load(); // quiet re-sync with the server's truth (+ fresh stats)
        }
    };

    const confirmPayment = async (order, outcome) => {
        if (order.payment?.state === outcome) return; // already settled

        const actionKey = `pay:${order._id}`;
        if (busyKeys.current.has(actionKey)) return;
        busyKeys.current.add(actionKey);
        setBusyTick((t) => t + 1);

        const snapshot = orders;
        setOrders((prev) =>
            prev.map((o) =>
                o._id === order._id
                    ? {
                          ...o,
                          payment: { ...o.payment, state: outcome },
                      }
                    : o,
            ),
        );

        try {
            const res = await api(`/api/orders/vendor/${order._id}/payment`, {
                method: "PATCH",
                getToken,
                body: { outcome },
            });
            if (!res.ok) {
                setOrders(snapshot);
                toast(res.data.message || "Failed", "error");
                return;
            }
            if (res.data.order) {
                const saved = res.data.order;
                setOrders((prev) =>
                    prev.map((o) =>
                        o._id === order._id ? { ...o, ...saved } : o,
                    ),
                );
            }
            toast(
                outcome === "confirmed"
                    ? "Payment confirmed"
                    : "Payment rejected",
            );
        } catch (err) {
            setOrders(snapshot);
            toast(err.message || "Failed", "error");
        } finally {
            busyKeys.current.delete(actionKey);
            setBusyTick((t) => t + 1);
            load();
        }
    };

    const bulkToggle = async (isAvailable) => {
        setMenuBusy(true);
        const res = await api("/api/menu/availability", {
            method: "PATCH",
            getToken,
            body: { isAvailable },
        });
        setMenuBusy(false);
        if (!res.ok) {
            toast(res.data.message || "Failed", "error");
            return;
        }
        toast(`${res.data.modifiedCount} item(s) updated`);
    };

    // outstanding money across whatever the queue is currently showing
    const unpaidTotal = orders.reduce(
        (sum, o) => sum + (o.totalAmount || 0),
        0,
    );

    // ─── not a vendor yet: checklist + inline registration ───
    if (!loaded) {
        return <div className="skeleton skeleton-order" />;
    }

    if (!canteen || !isMyCanteen()) {
        return (
            <>
                <SetupChecklist />
                <Reveal>
                    <section className="card">
                        <div className="card-title">
                            <div>
                                <p className="eyebrow">Step 1</p>
                                <h3>Register your canteen</h3>
                            </div>
                        </div>
                        <form onSubmit={handleRegister}>
                            <div className="form-grid">
                                <div className="field">
                                    <label className="label" htmlFor="cn-name">
                                        Canteen name *
                                    </label>
                                    <input
                                        id="cn-name"
                                        className="input"
                                        placeholder="e.g. Spice Junction"
                                        value={regName}
                                        onChange={(e) =>
                                            setRegName(e.target.value)
                                        }
                                        required
                                    />
                                </div>
                                <div className="field">
                                    <label
                                        className="label"
                                        htmlFor="cn-location"
                                    >
                                        Location in hall
                                    </label>
                                    <input
                                        id="cn-location"
                                        className="input"
                                        placeholder="e.g. Ground floor, east wing"
                                        value={regLocation}
                                        onChange={(e) =>
                                            setRegLocation(e.target.value)
                                        }
                                    />
                                </div>
                                <div className="field">
                                    <label
                                        className="label"
                                        htmlFor="cn-contact-name"
                                    >
                                        Contact person *
                                    </label>
                                    <input
                                        id="cn-contact-name"
                                        className="input"
                                        placeholder="e.g. Ramesh Kumar"
                                        value={regContactName}
                                        onChange={(e) =>
                                            setRegContactName(e.target.value)
                                        }
                                        required
                                    />
                                </div>                                    <div className="field">
                                        <label
                                            className="label"
                                            htmlFor="cn-contact-phone"
                                        >
                                            Contact number *
                                        </label>
                                        <input
                                            id="cn-contact-phone"
                                            className="input"
                                            type="tel"
                                            inputMode="numeric"
                                            placeholder="e.g. 9876543210"
                                            value={regContactPhone}
                                            onChange={(e) =>
                                                setRegContactPhone(e.target.value)
                                            }
                                            required
                                        />
                                    </div>
                                </div>
                            <PhotoPicker
                                value={regPhoto}
                                onChange={setRegPhoto}
                                busy={regBusy}
                                setBusy={setRegBusy}
                            />
                            <button
                                className="btn btn-accent"
                                type="submit"
                                disabled={regBusy}
                            >
                                {regBusy
                                    ? "Registering…"
                                    : "Register & start selling"}
                            </button>
                        </form>
                    </section>
                </Reveal>
            </>
        );
    }

    // ─── kitchen display mode — full-screen counter view ───
    if (servingMode) {
        const byToken = (a, b) => a.tokenNumber - b.tokenNumber;
        const ready = orders
            .filter((o) => o.status === "ready")
            .sort(byToken);
        const cooking = orders
            .filter((o) => o.status === "preparing")
            .sort(byToken);
        const incoming = orders
            .filter((o) => o.status === "pending" || o.status === "accepted")
            .sort(byToken);
        const itemCount = (o) =>
            (o.items || []).reduce((s, i) => s + (i.quantity || 1), 0);

        return (
            <section
                className={`kitchen-root${
                    isFullscreen ? " kitchen-fullscreen" : ""
                }`}
            >
                {flash && (
                    <button
                        type="button"
                        className="kitchen-flash"
                        onClick={() => {
                            clearTimeout(flashTimer.current);
                            setFlash(null);
                        }}
                        aria-live="assertive"
                    >
                        <span className="kitchen-flash-text">
                            <AlertIcon size={22} /> NEW ORDER — {flash.token}
                        </span>
                    </button>
                )}
                <header className="kitchen-head">
                    <div>
                        <p className="eyebrow">{canteen.name} — kitchen</p>
                        <h2 className="kitchen-title">Now serving</h2>
                    </div>
                    <div className="vendor-actions">
                        {!isFullscreen && (
                            <button
                                type="button"
                                className="btn btn-accent"
                                onClick={enterFullscreen}
                                title="Hide browser chrome — ideal for the counter tablet"
                            >
                                <MaximizeIcon /> Go fullscreen
                            </button>
                        )}
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setServingMode(false)}
                        >
                            Exit display
                        </button>
                    </div>
                </header>

                <div className="kitchen-now">
                    {ready.length > 0 ? (
                        ready.map((o) => (
                            <div
                                key={o._id}
                                className="kitchen-token kitchen-ready"
                            >
                                <span className="kitchen-token-label">
                                    Ready
                                </span>
                                <span className="kitchen-token-num">
                                    #{o.tokenNumber}
                                </span>
                                <button
                                    type="button"
                                    className="kitchen-act kitchen-act-done"
                                    onClick={() => setStatus(o, "completed")}
                                    disabled={
                                        !canTransition(o.status, "completed") ||
                                        isBusy("status", o._id)
                                    }
                                >
                                    <CheckIcon /> Picked up
                                </button>
                            </div>
                        ))
                    ) : (
                        <div className="kitchen-token kitchen-idle">
                            <span className="kitchen-token-num">—</span>
                            <span className="kitchen-token-label">
                                Nothing ready yet
                            </span>
                        </div>
                    )}
                </div>

                <div className="kitchen-cols">
                    <div className="kitchen-col">
                        <h4>
                            <span className="kitchen-col-icon"><PotIcon /></span> Cooking ({cooking.length})
                        </h4>
                        {cooking.length === 0 && (
                            <p className="kitchen-empty">Nothing on the stove</p>
                        )}
                        <ul>
                            {cooking.map((o) => (
                                <li key={o._id} className="kitchen-row">
                                    <b>#{o.tokenNumber}</b>
                                    <span>{itemCount(o)} items</span>
                                    <button
                                        type="button"
                                        className="kitchen-act kitchen-act-ready"
                                        onClick={() => setStatus(o, "ready")}
                                        disabled={
                                            !canTransition(o.status, "ready") ||
                                            isBusy("status", o._id)
                                        }
                                    >
                                        Ready
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="kitchen-col">
                        <h4>
                            <span className="kitchen-col-icon"><InboxIcon /></span> Incoming ({incoming.length})
                        </h4>
                        {incoming.length === 0 && (
                            <p className="kitchen-empty">Queue is clear</p>
                        )}
                        <ul>
                            {incoming.map((o) => (
                                <li key={o._id} className="kitchen-row">
                                    <b>#{o.tokenNumber}</b>
                                    <span>{itemCount(o)} items</span>
                                    <span className="kitchen-row-actions">
                                        {o.status === "pending" && (
                                            <>
                                                <button
                                                    type="button"
                                                    className="kitchen-act kitchen-act-go"
                                                    onClick={() =>
                                                        setStatus(o, "accepted")
                                                    }
                                                    disabled={
                                                        !canTransition(o.status, "accepted") ||
                                                        isBusy("status", o._id)
                                                    }
                                                >
                                                    Accept
                                                </button>
                                                <button
                                                    type="button"
                                                    className="kitchen-act kitchen-act-no"
                                                    onClick={() =>
                                                        setStatus(o, "cancelled")
                                                    }
                                                    disabled={
                                                        !canTransition(o.status, "cancelled") ||
                                                        isBusy("status", o._id)
                                                    }
                                                    aria-label="Reject order"
                                                >
                                                    <CloseIcon />
                                                </button>
                                            </>
                                        )}
                                        {o.status === "accepted" && (
                                            <button
                                                type="button"
                                                className="kitchen-act kitchen-act-go"
                                                onClick={() =>
                                                    setStatus(o, "preparing")
                                                }
                                                disabled={
                                                    !canTransition(o.status, "preparing") ||
                                                    isBusy("status", o._id)
                                                }
                                            >
                                                Start cooking
                                            </button>
                                        )}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <p className="kitchen-hint">
                    {isFullscreen
                        ? "Press Esc to leave fullscreen."
                        : "Tip: go fullscreen for the counter tablet."}{" "}
                    New orders ring the chime — auto-refreshes every 12s.
                </p>
            </section>
        );
    }

    // ─── merged vendor screen ───
    return (
        <>
            <SetupChecklist />
            <VendorSettings />

            <Reveal>
                <section className="card">
                    <div className="card-title">
                        <div>
                            <p className="eyebrow">Live</p>
                            <h3>
                                {view === "unpaid"
                                    ? "Unpaid orders"
                                    : "Order queue"}{" "}
                                <span className="muted">({orders.length})</span>
                            </h3>
                        </div>
                        <div className="vendor-actions">
                            <div className="view-toggle">
                                <button
                                    type="button"
                                    className={`view-chip${view === "active" ? " active" : ""}`}
                                    onClick={() => setView("active")}
                                >
                                    Active
                                </button>
                                <button
                                    type="button"
                                    className={`view-chip${view === "unpaid" ? " active" : ""}`}
                                    onClick={() => setView("unpaid")}
                                >
                                    Unpaid
                                </button>
                            </div>
                            <button
                                type="button"
                                className={`btn btn-sm ${soundOn ? "btn-accent" : "btn-secondary"}`}
                                onClick={toggleSound}
                                title="Toggle new-order sound"
                                aria-pressed={soundOn}
                            >
                                {soundOn ? (
                                    <>
                                        <VolOnIcon /> On
                                    </>
                                ) : (
                                    <>
                                        <VolOffIcon /> Off
                                    </>
                                )}
                            </button>
                            {notifyPerm === "default" && (
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    title="Get system notifications for new orders — even when this tab is in the background"
                                    onClick={async () => {
                                        const perm =
                                            await requestNotificationPermission();
                                        setNotifyPerm(perm);
                                        if (perm === "granted") {
                                            toast(
                                                "Order notifications enabled",
                                            );
                                        }
                                    }}
                                >
                                    <BellIcon /> Enable alerts
                                </button>
                            )}
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setServingMode(true)}
                            >
                                <MonitorIcon /> Kitchen display
                            </button>
                        </div>
                    </div>

                    {!canteen.upiId && (
                        <div className="alert alert-setup">
                            {canteen.qrImageUrl
                                ? "Customers can scan your QR, but they have to type the amount. Add your UPI ID in the settings above to send them an exact-amount QR instead."
                                : "No payment details yet — customers can only pay cash. Add a UPI ID or QR image in the settings above."}
                        </div>
                    )}

                    {error && <div className="alert alert-error">{error}</div>}

                    {loading && <div className="skeleton skeleton-order" />}

                    {!loading &&
                        orders.length > 0 &&
                        view === "unpaid" && (
                            <p className="unpaid-summary">
                                <strong>₹{unpaidTotal}</strong> outstanding
                                across {orders.length} order
                                {orders.length === 1 ? "" : "s"}
                            </p>
                        )}

                    {!loading && !error && orders.length === 0 && (
                        <p className="empty">
                            {view === "unpaid"
                                ? "Nothing outstanding — every order is settled."
                                : "No active orders — you're all caught up."}
                        </p>
                    )}

                    <div className="orders-list">
                        {orders.map((order) => (
                            <article key={order._id} className="order-card">
                                <div className="order-head">
                                    <div className="order-title">
                                        <span className="order-token">
                                            #{order.tokenNumber}
                                        </span>
                                        <span
                                            className={`pill ${STATUS_STYLES[order.status] || "pill-ink"}`}
                                        >
                                            {order.status}
                                        </span>
                                        <PayPill payment={order.payment} />
                                    </div>
                                    <div className="order-head-actions">
                                        <div className="order-total">
                                            ₹{order.totalAmount}
                                        </div>
                                    </div>
                                </div>

                                <ul className="order-items">
                                    {(order.items || []).map((it, i) => (
                                        <li key={i}>
                                            <span>
                                                <VegDot isVeg={it.isVeg} />{" "}
                                                <b>{it.quantity}×</b> {it.name}
                                            </span>
                                            <span className="order-item-price">
                                                ₹{it.price * it.quantity}
                                            </span>
                                        </li>
                                    ))}
                                </ul>

                                {order.note && (
                                    <p className="order-note order-note-vendor">
                                        <NoteIcon /> {order.note}
                                    </p>
                                )}

                                {order.payment?.state === "submitted" && (
                                    <div className="pay-verify">
                                        <code>
                                            UTR: {order.payment.reference}
                                        </code>
                                        <button
                                            type="button"
                                            className="btn btn-accent btn-sm"
                                            disabled={isBusy("pay", order._id)}
                                            onClick={() =>
                                                confirmPayment(order, "confirmed")
                                            }
                                        >
                                            Confirm
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-ghost-danger btn-sm"
                                            disabled={isBusy("pay", order._id)}
                                            onClick={() =>
                                                confirmPayment(order, "failed")
                                            }
                                        >
                                            Reject
                                        </button>
                                    </div>
                                )}

                                <div className="order-actions">
                                    {/* only ever render moves the flow allows
                                        — completed/cancelled render nothing */}
                                    {nextActions(order.status).map((a) => (
                                        <button
                                            key={a.to}
                                            type="button"
                                            className={`btn btn-sm ${a.to === "cancelled" ? "btn-ghost-danger" : "btn-primary"}`}
                                            disabled={isBusy("status", order._id)}
                                            onClick={() =>
                                                setStatus(order, a.to)
                                            }
                                        >
                                            {a.label}
                                        </button>
                                    ))}
                                    {order.payment?.state !== "confirmed" &&
                                        order.payment?.state !== "failed" &&
                                        order.status !== "cancelled" && (
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm"
                                                disabled={isBusy("pay", order._id)}
                                                onClick={() =>
                                                    confirmPayment(order, "confirmed")
                                                }
                                            >
                                                {order.payment?.method === "cash"
                                                    ? "Cash received"
                                                    : "Mark paid"}
                                            </button>
                                        )}
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => setSlipOrder(order)}
                                    >
                                        Print slip
                                    </button>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>
            </Reveal>

            <Reveal delay={100}>
                <section className="card">
                    <div className="card-title">
                        <div>
                            <p className="eyebrow">Today at a glance</p>
                            <h3>Stats</h3>
                        </div>
                        <div className="vendor-actions">
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled={menuBusy}
                                onClick={() => bulkToggle(false)}
                            >
                                All sold out
                            </button>
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled={menuBusy}
                                onClick={() => bulkToggle(true)}
                            >
                                All available
                            </button>
                        </div>
                    </div>

                    <div className="stats-grid">
                        <div className="stat-card">
                            <span className="stat-num">
                                {stats?.orders ?? "—"}
                            </span>
                            <span className="stat-label">orders today</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-num">
                                ₹{stats?.revenue ?? "—"}
                            </span>
                            <span className="stat-label">revenue today</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-num">
                                ₹{stats?.pendingPayments ?? "—"}
                            </span>
                            <span className="stat-label">unpaid</span>
                        </div>
                    </div>

                    {stats?.trend?.length > 0 && (
                        <div className="insights-row">
                            <div className="insight-box">
                                <p className="stat-label">Last 7 days</p>
                                <div
                                    className="trend-chart"
                                    role="img"
                                    aria-label={`Orders per day over the last 7 days, peaking at ${Math.max(
                                        ...stats.trend.map((d) => d.orders),
                                    )}`}
                                >
                                    {stats.trend.map((d) => {
                                        const max = Math.max(
                                            ...stats.trend.map((x) => x.orders),
                                            1,
                                        );
                                        return (
                                            <div
                                                key={d.day}
                                                className="trend-col"
                                                title={`${d.day}: ${d.orders} orders · ₹${d.revenue}`}
                                            >
                                                <div
                                                    className="trend-bar"
                                                    style={{
                                                        height: `${Math.max(
                                                            (d.orders / max) * 100,
                                                            d.orders ? 8 : 2,
                                                        )}%`,
                                                    }}
                                                />
                                                <span className="trend-day">
                                                    {d.day[0]}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="insight-box">
                                <p className="stat-label">Busy hours (2 wks)</p>
                                {stats.peakHours?.length > 0 ? (
                                    <ul className="peak-list">
                                        {stats.peakHours.map((p) => (
                                            <li key={p.hour}>
                                                <strong>{p.label}</strong>
                                                <span>
                                                    {p.orders} order
                                                    {p.orders === 1 ? "" : "s"}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="muted">Not enough data yet</p>
                                )}
                                {stats.totalWeek > 0 && (
                                    <p className="muted insight-foot">
                                        {stats.cancelled} of {stats.totalWeek}{" "}
                                        cancelled (
                                        {Math.round(
                                            (stats.cancelled / stats.totalWeek) *
                                                100,
                                        )}
                                        %)
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {stats?.topItems?.length > 0 && (
                        <>
                            <p className="eyebrow">Top sellers today</p>
                            <ul className="order-items">
                                {stats.topItems.map((t) => (
                                    <li key={t._id}>
                                        <span>{t._id}</span>
                                        <span className="order-item-price">
                                            {t.qty} sold · ₹{t.revenue}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </section>
            </Reveal>

            {slipOrder && (
                <TokenSlip
                    order={slipOrder}
                    canteen={canteen}
                    onClose={() => setSlipOrder(null)}
                />
            )}
        </>
    );
}
