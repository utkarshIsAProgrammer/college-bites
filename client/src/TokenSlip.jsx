import UpiQr from "./UpiQr.jsx";
import { buildUpiLink, formatRupees, orderPaymentRef } from "./upi.js";

/**
 * Printable token slip — token number, items, total, and a QR with the exact
 * amount already filled in.
 *
 * Printed at the counter so the customer can scan and pay without typing an
 * amount, and kept as the pickup token. Print styles in index.css hide the
 * rest of the app so only the sheet lands on paper.
 */
export default function TokenSlip({ order, canteen, onClose }) {
    const tr = orderPaymentRef(order);

    const upiLink = buildUpiLink({
        upiId: canteen?.upiId,
        payeeName: canteen?.name,
        amount: order.totalAmount,
        note: `Rush Bites #${order.tokenNumber ?? tr}`,
        tr,
    });

    const pickup = order.pickupAt
        ? new Date(order.pickupAt).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
          })
        : null;

    return (
        <div className="slip-root">
            <div
                className="drawer-backdrop"
                onClick={onClose}
                aria-hidden="true"
            />
            <div
                className="slip-wrap"
                role="dialog"
                aria-modal="true"
                aria-label="Token slip"
            >
                <div className="slip-sheet">
                    <header className="slip-head">
                        <div>
                            <p className="slip-brand">Rush Bites</p>
                            <p className="slip-canteen">{canteen?.name}</p>
                        </div>
                        <div className="slip-token">
                            <span className="slip-token-label">Token</span>
                            <span className="slip-token-num">
                                #{order.tokenNumber ?? "—"}
                            </span>
                        </div>
                    </header>

                    <ul className="slip-items">
                        {(order.items || []).map((it, i) => (
                            <li key={i}>
                                <span>
                                    {it.quantity}× {it.name}
                                </span>
                                <span>₹{it.price * it.quantity}</span>
                            </li>
                        ))}
                    </ul>

                    <div className="slip-total">
                        <span>Total to pay</span>
                        <span>{formatRupees(order.totalAmount)}</span>
                    </div>

                    {upiLink ? (
                        <div className="slip-pay">
                            <UpiQr upiLink={upiLink} name={canteen?.name} />
                            <div>
                                <p className="slip-pay-line">
                                    Scan to pay exactly{" "}
                                    {formatRupees(order.totalAmount)}
                                </p>
                                <p className="slip-pay-ref">Ref {tr}</p>
                                {pickup && (
                                    <p className="slip-pay-ref">
                                        Pickup {pickup}
                                    </p>
                                )}
                            </div>
                        </div>
                    ) : (
                        <p className="slip-pay-line">
                            Pay {formatRupees(order.totalAmount)} at the
                            counter.
                        </p>
                    )}

                    <p className="slip-foot">
                        Keep this slip — your token number is how the order is
                        called.
                    </p>
                </div>

                <div className="slip-actions">
                    <button
                        type="button"
                        className="btn btn-accent"
                        onClick={() => window.print()}
                    >
                        Print slip
                    </button>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={onClose}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
