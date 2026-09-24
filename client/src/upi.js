/**
 * Builds a UPI deep link with the amount locked in.
 *
 * This is the whole point of the generated QR: `am` is the exact order total,
 * so the payer's app pre-fills it and cannot send more or less. `tr` tags the
 * payment with our own reference so the vendor can match a credit in their
 * UPI history back to a specific order.
 *
 * Spec: https://www.npci.org.in (UPI Linking API — upi://pay)
 */
export function buildUpiLink({ upiId, payeeName, amount, note, tr }) {
    if (!upiId) return "";

    const params = new URLSearchParams({
        pa: upiId,
        pn: payeeName || "Canteen",
        am: Number(amount).toFixed(2), // paise-exact, never rounded by the app
        cu: "INR",
    });

    if (note) params.set("tn", note.slice(0, 50));
    if (tr) params.set("tr", tr.slice(0, 35));

    return `upi://pay?${params.toString()}`;
}

/**
 * A reference we control, short enough for a UPI `tr` field:
 * CB-<token>-<last 6 of the order id>.  e.g. CB-14-A1B2C3
 */
export function orderPaymentRef(order) {
    const tail = String(order?._id || "").slice(-6).toUpperCase();
    const token = order?.tokenNumber != null ? order.tokenNumber : "x";
    return `CB-${token}-${tail}`;
}

/** Human-readable amount, e.g. ₹240 or ₹240.50 */
export function formatRupees(amount) {
    const n = Number(amount) || 0;
    return `₹${Number.isInteger(n) ? n : n.toFixed(2)}`;
}
