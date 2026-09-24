import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "./api.js";
import { useToast } from "./toast.jsx";
import Reveal from "./Reveal.jsx";
import { useCanteen } from "./CanteenContext.jsx";
import SetupChecklist from "./SetupChecklist.jsx";
import TokenSlip from "./TokenSlip.jsx";
import VendorSettings from "./VendorSettings.jsx";
import VegDot from "./VegDot.jsx";

const POLL_MS = 12000;

const NEXT_ACTIONS = {
    pending: [
        { to: "accepted", label: "Accept" },
        { to: "cancelled", label: "Reject" },
    ],
    accepted: [
        { to: "preparing", label: "Start preparing" },
        { to: "cancelled", label: "Reject" },
    ],
    preparing: [{ to: "ready", label: "Mark ready" }],
    ready: [{ to: "completed", label: "Complete" }],
    completed: [],
    cancelled: [],
};

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

    const [soundOn, setSoundOn] = useState(
        () => localStorage.getItem("cb-order-sounds") !== "off",
    );
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

    const setStatus = async (order, status) => {
        const res = await api(`/api/orders/vendor/${order._id}/status`, {
            method: "PATCH",
            getToken,
            body: { status },
        });
        if (!res.ok) {
            toast(res.data.message || "Update failed", "error");
            return;
        }
        toast(`Order #${order.tokenNumber} → ${status}`);
        load();
    };

    const confirmPayment = async (order, outcome) => {
        const res = await api(`/api/orders/vendor/${order._id}/payment`, {
            method: "PATCH",
            getToken,
            body: { outcome },
        });
        if (!res.ok) {
            toast(res.data.message || "Failed", "error");
            return;
        }
        toast(outcome === "confirmed" ? "Payment confirmed" : "Payment rejected");
        load();
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
                                </div>
                                <div className="field">
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

    // ─── counter display mode ───
    if (servingMode) {
        const ready = orders
            .filter((o) => o.status === "ready")
            .sort((a, b) => a.tokenNumber - b.tokenNumber);
        return (
            <section className="card serving-mode">
                <div className="card-title">
                    <h3 className="serving-title">
                        {ready.length
                            ? ready.map((o) => `#${o.tokenNumber}`).join("  ·  ")
                            : "—"}
                    </h3>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setServingMode(false)}
                    >
                        Exit
                    </button>
                </div>
                <p className="muted serving-hint">
                    Now serving — ready tokens refresh automatically.
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
                                {soundOn ? "🔊 On" : "🔇 Off"}
                            </button>
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setServingMode(true)}
                            >
                                Counter display
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
                                        📝 {order.note}
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
                                            onClick={() =>
                                                confirmPayment(order, "confirmed")
                                            }
                                        >
                                            Confirm
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-ghost-danger btn-sm"
                                            onClick={() =>
                                                confirmPayment(order, "failed")
                                            }
                                        >
                                            Reject
                                        </button>
                                    </div>
                                )}

                                <div className="order-actions">
                                    {(NEXT_ACTIONS[order.status] || []).map(
                                        (a) => (
                                            <button
                                                key={a.to}
                                                type="button"
                                                className={`btn btn-sm ${a.to === "cancelled" ? "btn-ghost-danger" : "btn-primary"}`}
                                                onClick={() =>
                                                    setStatus(order, a.to)
                                                }
                                            >
                                                {a.label}
                                            </button>
                                        ),
                                    )}
                                    {order.payment?.state !== "confirmed" &&
                                        order.status !== "cancelled" && (
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm"
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
                            <span className="stat-label">orders</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-num">
                                ₹{stats?.revenue ?? "—"}
                            </span>
                            <span className="stat-label">revenue</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-num">
                                ₹{stats?.pendingPayments ?? "—"}
                            </span>
                            <span className="stat-label">unpaid</span>
                        </div>
                    </div>

                    {stats?.topItems?.length > 0 && (
                        <>
                            <p className="eyebrow">Top sellers</p>
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
