import QRCode from "react-qr-code";

/**
 * The QR a customer scans to pay.
 *
 * Preference order:
 *  1. Generated live from the canteen's UPI ID with the exact amount baked in
 *     — the payer's app pre-fills it, so over/underpayment isn't possible.
 *  2. The still image the vendor uploaded (no amount control, but always works
 *     even if they never typed a UPI ID).
 *
 * While a customer looks at option 1, the vendor's own QR stays reachable as a
 * labelled fallback below it.
 */
export default function UpiQr({ upiLink, uploadedQr, name }) {
    if (upiLink) {
        return (
            <div className="qr-frame">
                <QRCode
                    value={upiLink}
                    size={216}
                    level="M"
                    bgColor="#ffffff"
                    fgColor="#17130e"
                    style={{ height: "auto", width: "100%", maxWidth: "216px" }}
                />
            </div>
        );
    }

    if (uploadedQr) {
        return (
            <div className="qr-frame">
                <img
                    className="pay-qr"
                    src={uploadedQr}
                    alt={`UPI QR for ${name || "this canteen"}`}
                />
            </div>
        );
    }

    return null;
}
