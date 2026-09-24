import { useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "./api.js";
import { useToast } from "./toast.jsx";
import UpiQr from "./UpiQr.jsx";
import { buildUpiLink, formatRupees, orderPaymentRef } from "./upi.js";

export default function PayModal({ order, canteen, onClose, onPaid }) {
    const { getToken } = useAuth();
    const toast = useToast();

    const [reference, setReference] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const amount = order.totalAmount;
    const upiId = canteen?.upiId;
    const uploadedQr = canteen?.qrImageUrl;

    // our own reference for this order — shows up in the vendor's UPI history
    const tr = orderPaymentRef(order);

    // amount-locked deep link + QR. Opens GPay/PhonePe/Paytm pre-filled on
    // mobile, and renders as a scannable QR for desktop/counter use.
    const upiLink = buildUpiLink({
        upiId,
        payeeName: canteen?.name,
        amount,
        note: `Rush Bites #${order.tokenNumber ?? tr}`,
        tr,
    });

    const copyUpi = async () => {
        try {
            await navigator.clipboard.writeText(upiId);
            toast("UPI ID copied");
        } catch {
            /* clipboard unavailable */
        }
    };

    const submitRef = async (e) => {
        e.preventDefault();
        setError(null);

        const ref = reference.trim();
        if (ref.length < 6) {
            setError(
                "Enter the UPI reference/UTR from your payment app (min 6 characters).",
            );
            return;
        }

        setSubmitting(true);
        try {
            const res = await api(`/api/orders/${order._id}/payment`, {
                method: "POST",
                getToken,
                body: { reference: ref },
            });

            if (!res.ok) {
                setError(res.data.message || "Submission failed");
                return;
            }

            toast("Payment reference submitted");
            onPaid(res.data.order);
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="drawer-root">
            <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
            <aside
                className="drawer pay-drawer"
                role="dialog"
                aria-modal="true"
                aria-label="Pay for your order"
            >
                <header className="drawer-head">
                    <div>
                        <h3>Pay ₹{amount}</h3>
                        <p className="drawer-canteen">
                            to <strong>{canteen?.name}</strong> · token #
                            {order.tokenNumber ?? "—"}
                        </p>
                    </div>
                    <button
                        type="button"
                        className="theme-toggle"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </header>

                <div className="pay-body">
                    <UpiQr
                        upiLink={upiLink}
                        uploadedQr={uploadedQr}
                        name={canteen?.name}
                    />

                    {upiLink ? (
                        <>
                            <p className="pay-qr-cap">
                                Scan to pay exactly{" "}
                                <strong>{formatRupees(amount)}</strong> — the
                                amount is locked into this code.
                            </p>
                            <p className="pay-qr-ref">
                                Reference <code>{tr}</code> — quote it if the
                                counter asks.
                            </p>
                        </>
                    ) : uploadedQr ? (
                        <p className="pay-qr-cap">
                            Scan the canteen's QR and pay{" "}
                            <strong>{formatRupees(amount)}</strong>.
                        </p>
                    ) : (
                        <p className="bill-note">
                            This canteen hasn't added a UPI ID or QR yet — pay
                            cash at the counter instead.
                        </p>
                    )}

                    {upiId && (
                        <div className="pay-upi-row">
                            <code>{upiId}</code>
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={copyUpi}
                            >
                                Copy
                            </button>
                        </div>
                    )}

                    {upiLink && (
                        <a
                            className="btn btn-accent btn-block"
                            href={upiLink}
                            rel="noreferrer"
                        >
                            Open any UPI app
                        </a>
                    )}

                    {upiLink && uploadedQr && (
                        <details className="pay-fallback">
                            <summary>
                                Prefer the canteen's own QR? (no amount
                                pre-filled)
                            </summary>
                            <img
                                className="pay-qr pay-qr-sm"
                                src={uploadedQr}
                                alt=""
                            />
                        </details>
                    )}

                    <ol className="pay-steps">
                        <li>
                            Pay <strong>{formatRupees(amount)}</strong> — the
                            QR already has this exact amount.
                        </li>
                        <li>
                            Copy the{" "}
                            <strong>reference / UTR number</strong> from your
                            payment receipt.
                        </li>
                        <li>
                            Paste it below — the vendor matches it against
                            order {tr}.
                        </li>
                    </ol>

                    <form onSubmit={submitRef}>
                        <div className="field">
                            <label className="label" htmlFor="pay-ref">
                                UPI reference / UTR *
                            </label>
                            <input
                                id="pay-ref"
                                className="input"
                                placeholder="e.g. 4231 8890 772"
                                value={reference}
                                onChange={(e) => setReference(e.target.value)}
                                required
                            />
                        </div>

                        {error && (
                            <div className="alert alert-error">{error}</div>
                        )}

                        <button
                            className="btn btn-primary btn-block"
                            type="submit"
                            disabled={submitting}
                        >
                            {submitting ? "Submitting…" : "I've paid — submit reference"}
                        </button>
                    </form>

                    <p className="bill-note">
                        The vendor verifies this reference before preparing
                        marks your order paid — both sides keep the record.
                    </p>
                </div>
            </aside>
        </div>
    );
}
