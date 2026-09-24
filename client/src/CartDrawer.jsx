import { useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "./api.js";
import { useCart } from "./CartContext.jsx";
import { useToast } from "./toast.jsx";
import PayModal from "./PayModal.jsx";
import VegDot from "./VegDot.jsx";

function CartThumb({ item }) {
    const [failed, setFailed] = useState(false);

    if (item.image && !failed) {
        return (
            <img
                className="cart-thumb"
                src={item.image}
                alt=""
                loading="lazy"
                onError={() => setFailed(true)}
            />
        );
    }
    return <div className="cart-thumb cart-thumb-fallback">🍽</div>;
}

function Stepper({ qty, onAdd, onRemove }) {
    return (
        <div className="stepper">
            <button
                type="button"
                className="stepper-btn"
                onClick={onRemove}
                aria-label="Remove one"
            >
                −
            </button>
            <span className="stepper-qty">{qty}</span>
            <button
                type="button"
                className="stepper-btn"
                onClick={onAdd}
                aria-label="Add one"
            >
                +
            </button>
        </div>
    );
}

export default function CartDrawer() {
    const { getToken } = useAuth();
    const cart = useCart();
    const toast = useToast();

    const [placing, setPlacing] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState("cash");
    const [pickupMins, setPickupMins] = useState("");
    const [orderNote, setOrderNote] = useState("");

    // set right after a UPI order is placed, so we can hand the customer
    // straight to the scan-and-pay step instead of making them go find it
    const [placedOrder, setPlacedOrder] = useState(null);
    const [payCanteen, setPayCanteen] = useState(null);

    // earliest pickup estimate = 10 min from now
    const minPickup = new Date(Date.now() + 10 * 60_000);
    const fmtTime = (d) =>
        d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

    // cart closed — this component's only remaining job is to host the
    // scan-and-pay step that follows a UPI order
    if (!cart.isOpen) {
        return placedOrder ? (
            <PayModal
                order={placedOrder}
                canteen={payCanteen}
                onClose={() => setPlacedOrder(null)}
                onPaid={() => setPlacedOrder(null)}
            />
        ) : null;
    }

    const placeOrder = async () => {
        setPlacing(true);

        // the cart is cleared below, so snapshot what the payment step needs
        const canteen = cart.canteen;

        const res = await api("/api/orders", {
            method: "POST",
            getToken,
            body: {
                items: cart.lines.map((line) => ({
                    menuItem: line.item._id,
                    quantity: line.qty,
                })),
                canteen: canteen?._id,
                paymentMethod,
                ...(orderNote.trim() ? { note: orderNote.trim() } : {}),
                ...(pickupMins
                    ? {
                          pickupAt: new Date(
                              Date.now() + Number(pickupMins) * 60_000,
                          ).toISOString(),
                      }
                    : {}),
            },
        });

        setPlacing(false);

        if (!res.ok) {
            toast(
                res.data.message || `Request failed (${res.status})`,
                "error",
            );
            return;
        }

        const order = res.data.order;
        const token = order?.tokenNumber;

        cart.clear();
        cart.close();
        setOrderNote("");

        if (paymentMethod === "upi_qr" && order) {
            // pay immediately — the QR is pre-filled with this order's total
            setPlacedOrder(order);
            setPayCanteen(canteen); // cart snapshot first: name shows instantly

            // the cart snapshot only carries {_id, name} — the payment screen
            // needs the vendor's real upiId/qrImageUrl, so fetch the record
            api(`/api/canteens/${canteen?._id || order.canteen}`).then((r) => {
                if (r.ok && r.data.canteen) setPayCanteen(r.data.canteen);
            });

            toast(
                token
                    ? `Order placed — token #${token} · now scan to pay`
                    : "Order placed — now scan to pay",
            );
            return;
        }

        toast(token ? `Order placed — token #${token}` : "Order placed");
    };

    return (
        <div className="drawer-root">
            <div
                className="drawer-backdrop"
                onClick={cart.close}
                aria-hidden="true"
            />
            <aside
                className="drawer"
                role="dialog"
                aria-modal="true"
                aria-label="Your cart"
            >
                <header className="drawer-head">
                    <div>
                        <h3>Your cart</h3>
                        {cart.canteen?.name && (
                            <p className="drawer-canteen">
                                from <strong>{cart.canteen.name}</strong>
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        className="theme-toggle"
                        onClick={cart.close}
                        aria-label="Close cart"
                    >
                        ✕
                    </button>
                </header>

                {cart.lines.length === 0 ? (
                    <p className="empty">
                        Your cart is empty — add something delicious.
                    </p>
                ) : (
                    <>
                        <div className="drawer-lines">
                            {cart.lines.map(({ item, qty }) => (
                                <div key={item._id} className="cart-line">
                                    <CartThumb item={item} />
                                    <div className="cart-line-info">
                                        <span className="cart-line-name">
                                            <VegDot isVeg={item.isVeg} />{" "}
                                            {item.name}
                                        </span>
                                        <span className="cart-line-sub">
                                            ₹{item.price} each
                                        </span>
                                    </div>
                                    <Stepper
                                        qty={qty}
                                        onAdd={() => cart.add(item)}
                                        onRemove={() =>
                                            cart.decrement(item._id)
                                        }
                                    />
                                    <span className="cart-line-total">
                                        ₹{item.price * qty}
                                    </span>
                                </div>
                            ))}
                        </div>

                        <div className="bill">
                            <div className="bill-row">
                                <span>Item total</span>
                                <span>₹{cart.total}</span>
                            </div>
                            <div className="bill-row bill-grand">
                                <span>To pay</span>
                                <span>₹{cart.total}</span>
                            </div>

                            <div className="pay-methods">
                                <p className="label">Payment method</p>
                                <div className="pay-options">
                                    <button
                                        type="button"
                                        className={`pay-option${paymentMethod === "cash" ? " active" : ""}`}
                                        onClick={() =>
                                            setPaymentMethod("cash")
                                        }
                                    >
                                        💵 Cash at counter
                                    </button>
                                    <button
                                        type="button"
                                        className={`pay-option${paymentMethod === "upi_qr" ? " active" : ""}`}
                                        onClick={() =>
                                            setPaymentMethod("upi_qr")
                                        }
                                    >
                                        📷 UPI · QR
                                    </button>
                                </div>
                            </div>

                            <div className="field" style={{ margin: "0.9rem 0 0" }}>
                                <label className="label" htmlFor="pickup-at">
                                    Pick up in (minutes)
                                </label>
                                <input
                                    id="pickup-at"
                                    className="input"
                                    type="number"
                                    min="10"
                                    step="5"
                                    placeholder={`default · ~${fmtTime(minPickup)}`}
                                    value={pickupMins}
                                    onChange={(e) =>
                                        setPickupMins(e.target.value)
                                    }
                                />
                            </div>

                            <div className="field" style={{ margin: "0.9rem 0 0" }}>
                                <label className="label" htmlFor="order-note">
                                    Note for the kitchen (optional)
                                </label>
                                <textarea
                                    id="order-note"
                                    className="input"
                                    rows={2}
                                    maxLength={200}
                                    placeholder="e.g. less spicy, no onion, extra chutney"
                                    value={orderNote}
                                    onChange={(e) =>
                                        setOrderNote(e.target.value)
                                    }
                                />
                            </div>

                            <p className="bill-note">
                                {paymentMethod === "cash"
                                    ? "Pay cash at the counter — the vendor confirms receipt against your token."
                                    : "You'll scan a QR next with this exact amount already filled in."}
                            </p>

                            <div className="place-order-bar">
                                <button
                                    type="button"
                                    className="btn btn-accent btn-block place-order-btn"
                                    onClick={placeOrder}
                                    disabled={
                                        placing || cart.lines.length === 0
                                    }
                                >
                                    {placing
                                        ? "Placing order…"
                                        : paymentMethod === "cash"
                                          ? `Place order · ₹${cart.total}`
                                          : `Place order & pay ₹${cart.total}`}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </aside>
        </div>
    );
}
