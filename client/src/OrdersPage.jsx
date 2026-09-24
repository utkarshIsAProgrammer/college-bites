import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "./api.js";
import Reveal from "./Reveal.jsx";
import { useToast } from "./toast.jsx";
import PayModal from "./PayModal.jsx";
import { useCart } from "./CartContext.jsx";
import { playReadySound } from "./sound.js";
import VegDot from "./VegDot.jsx";

const STATUS_STYLES = {
    pending: "pill-amber",
    accepted: "pill-ink",
    preparing: "pill-ember",
    ready: "pill-green",
    completed: "pill-green",
    cancelled: "pill-red",
};

const STATUS_LABELS = {
    pending: "Placed",
    accepted: "Accepted",
    preparing: "Preparing",
    ready: "Ready",
    completed: "Completed",
    cancelled: "Cancelled",
};

const PAY_LABELS = {
    pending: "Payment pending",
    submitted: "Ref. submitted",
    confirmed: "Paid ✓",
    failed: "Payment failed",
};

const POLL_MS = 15_000;

function OrdersSkeleton() {
    return (
        <div className="stack">
            {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton skeleton-order" />
            ))}
        </div>
    );
}

export default function OrdersPage() {
    const { getToken } = useAuth();
    const toast = useToast();
    const cart = useCart();

    const [orders, setOrders] = useState([]);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [payOrder, setPayOrder] = useState(null);

    // inline review form — one order at a time
    const [reviewFor, setReviewFor] = useState(null);
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState("");
    const [reviewBusy, setReviewBusy] = useState(false);

    // remember statuses to detect changes between polls
    const prevStatuses = useRef({});
    const soundOn = useRef(
        localStorage.getItem("cb-order-sounds") !== "off",
    );

    const load = useCallback(async () => {
        try {
            const res = await api("/api/orders", { getToken });
            if (res.ok) {
                setOrders((prev) => {
                    const next = res.data.orders || [];
                    // toast when a status changes externally (vendor action)
                    for (const o of next) {
                        const before = prevStatuses.current[o._id];
                        if (before && before !== o.status) {
                            toast(
                                `Order #${o.tokenNumber ?? ""} is now ${STATUS_LABELS[o.status] || o.status}`,
                            );
                            // the moment the customer is waiting for
                            if (
                                soundOn.current &&
                                o.status === "ready" &&
                                before !== "ready"
                            ) {
                                playReadySound();
                            }
                        }
                        prevStatuses.current[o._id] = o.status;
                    }
                    return next;
                });
                setError(null);
            } else if (res.status === 401) {
                // token briefly invalid (Clerk rotates ~1/min) — treat as
                // loading, the next poll or next getToken() resolves it
                setError(undefined);
            } else {
                setError(res.data.message || `Request failed (${res.status})`);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [getToken]);

    useEffect(() => {
        load();
        const t = setInterval(load, POLL_MS);
        return () => clearInterval(t);
    }, [load]);

    const handleCancel = async (order) => {
        try {
            const res = await api(`/api/orders/${order._id}/cancel`, {
                method: "PATCH",
                getToken,
            });
            if (!res.ok) {
                toast(res.data.message || "Cancel failed", "error");
                return;
            }
            setOrders((prev) =>
                prev.map((o) =>
                    o._id === order._id ? { ...o, status: "cancelled" } : o,
                ),
            );
            toast(`Order #${order.tokenNumber ?? ""} cancelled`);
        } catch (err) {
            toast(err.message, "error");
        }
    };

    const openReview = (order) => {
        setReviewFor(order);
        setRating(0);
        setComment("");
    };

    const submitReview = async (e) => {
        e.preventDefault();

        if (!rating) {
            toast("Pick a star rating first", "error");
            return;
        }

        setReviewBusy(true);
        const res = await api("/api/reviews", {
            method: "POST",
            getToken,
            body: {
                orderId: reviewFor._id,
                rating,
                comment: comment.trim(),
            },
        });
        setReviewBusy(false);

        if (!res.ok) {
            toast(res.data.message || "Could not save review", "error");
            return;
        }

        setOrders((prev) =>
            prev.map((o) =>
                o._id === reviewFor._id ? { ...o, reviewed: true } : o,
            ),
        );
        toast(`Thanks — ${rating}★ logged for ${reviewFor.canteen?.name || "this canteen"}`);
        setReviewFor(null);
    };

    const fmtDate = (d) =>
        new Date(d).toLocaleString(undefined, {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
        });

    const fmtTime = (d) =>
        d
            ? new Date(d).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
              })
            : null;

    // daily-use magic: yesterday's order back in the cart in one tap.
    // Prices/availability are re-validated server-side at placement time.
    const reorder = (order) => {
        if (!order.canteen || !(order.items || []).length) {
            toast("Can't reorder this order", "error");
            return;
        }

        const lines = (order.items || [])
            .filter((it) => it.menuItem)
            .map((it) => ({
                qty: it.quantity,
                item: {
                    _id: it.menuItem,
                    name: it.name,
                    price: it.price,
                    image: "",
                    isVeg: it.isVeg,
                    canteen: {
                        _id: order.canteen._id,
                        name: order.canteen.name,
                    },
                },
            }));

        if (!lines.length) {
            toast("Can't reorder this order", "error");
            return;
        }

        cart.clear();
        lines.forEach((l) => cart.add(l.item, l.qty));

        if (cart.open) {
            cart.open();
            toast(
                `Added ${lines.length} item${lines.length === 1 ? "" : "s"} — check availability before placing`,
            );
        } else {
            toast("Cart is loading — tap Reorder again in a moment", "error");
        }
    };

    return (
        <Reveal>
            <section className="card">
                <div className="card-title">
                    <div>
                        <p className="eyebrow">
                            <span className="eyebrow-num">No. 3</span> — Your
                            orders
                        </p>
                        <h3>
                            Orders{" "}
                            <span className="muted">({orders.length})</span>
                        </h3>
                    </div>
                    <span className="topbar-status">
                        <span className="status-dot" /> live
                    </span>
                </div>

                {error && <div className="alert alert-error">{error}</div>}

                {loading && <OrdersSkeleton />}

                {!loading && !error && orders.length === 0 && (
                    <p className="empty">
                        No orders yet — head to the Menu tab and place your
                        first one.
                    </p>
                )}

                <div className="orders-list">
                    {orders.map((order, idx) => {
                        const canPay =
                            order.payment?.method === "upi_qr" &&
                            order.payment?.state === "pending" &&
                            order.status !== "cancelled";

                        // paid orders (UPI confirmed / UTR submitted) can't be
                        // cancelled — the server rejects it and it needs a
                        // vendor-side refund instead
                        const canCancel =
                            (order.status === "pending" ||
                                order.status === "accepted") &&
                            order.payment?.state === "pending";

                        return (
                            <article
                                key={order._id}
                                className="order-card"
                                style={{ animationDelay: `${idx * 0.06}s` }}
                            >
                                <div className="order-head">
                                    <div className="order-title">
                                        {order.tokenNumber != null && (
                                            <span className="order-token">
                                                #{order.tokenNumber}
                                            </span>
                                        )}
                                        {order.canteen?.name && (
                                            <span className="order-canteen">
                                                {order.canteen.name}
                                            </span>
                                        )}
                                        <span className="order-id">
                                            {fmtDate(order.createdAt)}
                                        </span>
                                        {["pending", "accepted", "preparing"].includes(
                                            order.status,
                                        ) && (
                                            <span className="order-eta">
                                                👤 {order.queueAhead ?? 0} ahead
                                                · ready ~
                                                {fmtTime(
                                                    order.estimatedReadyAt,
                                                )}
                                            </span>
                                        )}
                                        <span
                                            className={`pill ${
                                                STATUS_STYLES[order.status] ||
                                                "pill-ink"
                                            }`}
                                        >
                                            {STATUS_LABELS[order.status] ||
                                                order.status}
                                        </span>
                                    </div>

                                    <div className="order-head-actions">
                                        {order.payment && (
                                            <span
                                                className={`pill ${
                                                    order.payment.state ===
                                                    "confirmed"
                                                        ? "pill-green"
                                                        : order.payment
                                                              .state ===
                                                          "failed"
                                                        ? "pill-red"
                                                        : "pill-amber"
                                                }`}
                                            >
                                                {order.payment.method ===
                                                "upi_qr"
                                                    ? "UPI · "
                                                    : "Cash · "}
                                                {PAY_LABELS[
                                                    order.payment.state
                                                ] || order.payment.state}
                                            </span>
                                        )}
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
                                    <p className="order-note">📝 {order.note}</p>
                                )}

                                {(canPay ||
                                    canCancel ||
                                    order.status === "completed") && (
                                    <div className="order-actions">
                                        {canPay && (
                                            <button
                                                type="button"
                                                className="btn btn-accent btn-sm"
                                                onClick={() =>
                                                    setPayOrder(order)
                                                }
                                            >
                                                Pay now
                                            </button>
                                        )}
                                        {canCancel && (
                                            <button
                                                type="button"
                                                className="btn btn-ghost-danger btn-sm"
                                                onClick={() =>
                                                    handleCancel(order)
                                                }
                                            >
                                                Cancel
                                            </button>
                                        )}
                                        {order.status === "completed" && (
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => reorder(order)}
                                            >
                                                🔁 Reorder
                                            </button>
                                        )}
                                    </div>
                                )}

                                {order.status === "completed" &&
                                    (reviewFor?._id === order._id ? (
                                        <form
                                            className="review-form"
                                            onSubmit={submitReview}
                                        >
                                            <div className="star-picker">
                                                {[1, 2, 3, 4, 5].map((n) => (
                                                    <button
                                                        key={n}
                                                        type="button"
                                                        className={`star${
                                                            n <= rating
                                                                ? " star-on"
                                                                : ""
                                                        }`}
                                                        aria-label={`${n} star${n > 1 ? "s" : ""}`}
                                                        onClick={() =>
                                                            setRating(n)
                                                        }
                                                    >
                                                        ★
                                                    </button>
                                                ))}
                                                <span className="muted review-scale">
                                                    {rating
                                                        ? `${rating}/5`
                                                        : "Tap to rate"}
                                                </span>
                                            </div>

                                            <textarea
                                                className="input"
                                                rows={2}
                                                maxLength={500}
                                                placeholder="How was the food? (optional)"
                                                value={comment}
                                                onChange={(e) =>
                                                    setComment(e.target.value)
                                                }
                                            />

                                            <div className="order-actions">
                                                <button
                                                    type="submit"
                                                    className="btn btn-accent btn-sm"
                                                    disabled={reviewBusy}
                                                >
                                                    {reviewBusy
                                                        ? "Saving…"
                                                        : "Submit review"}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={() =>
                                                        setReviewFor(null)
                                                    }
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </form>
                                    ) : order.reviewed ? (
                                        <p className="order-reviewed">
                                            Reviewed ✓
                                        </p>
                                    ) : (
                                        <div className="order-actions">
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm"
                                                onClick={() =>
                                                    openReview(order)
                                                }
                                            >
                                                ★ Rate this order
                                            </button>
                                        </div>
                                    ))}
                            </article>
                        );
                    })}
                </div>

                {payOrder && (
                    <PayModal
                        order={payOrder}
                        canteen={payOrder.canteen}
                        onClose={() => setPayOrder(null)}
                        onPaid={() => load()}
                    />
                )}
            </section>
        </Reveal>
    );
}
