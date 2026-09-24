import { useCanteen } from "./CanteenContext.jsx";
import Reveal from "./Reveal.jsx";

/**
 * Three steps between signing up and taking the first order. A new vendor is
 * dropped into a menu page with no instruction otherwise, and payments in
 * particular are easy to never configure.
 *
 * Disappears on its own once every step is done.
 */
export default function SetupChecklist() {
    const { canteen, loaded } = useCanteen();

    if (!loaded) return null;

    const steps = [
        {
            label: "Register your canteen",
            done: Boolean(canteen),
            hint: "Use the registration form on this screen — name, location and a contact number.",
        },
        {
            label: "Set up payments",
            done: Boolean(canteen?.upiId || canteen?.qrImageUrl),
            hint: `"Edit details" above — add a UPI ID to send customers an exact-amount QR, or upload your own QR image.`,
        },
        {
            label: "Add your first dish",
            done: (canteen?.itemCount ?? 0) > 0,
            hint: `Open the "My Menu" tab — add items with a price. Customers can only order what's listed.`,
        },
    ];

    const doneCount = steps.filter((s) => s.done).length;
    if (doneCount === steps.length) return null;

    return (
        <Reveal>
            <section className="card setup-card">
                <div className="card-title">
                    <div>
                        <p className="eyebrow">Vendor setup</p>
                        <h3>Get your canteen taking orders</h3>
                    </div>
                    <span className="pill pill-amber">
                        {doneCount}/{steps.length} done
                    </span>
                </div>

                <ol className="setup-steps">
                    {steps.map((step) => (
                        <li
                            key={step.label}
                            className={`setup-step${step.done ? " done" : ""}`}
                        >
                            <span className="setup-mark" aria-hidden="true">
                                {step.done ? "✓" : ""}
                            </span>
                            <div>
                                <p className="setup-label">{step.label}</p>
                                {!step.done && (
                                    <p className="setup-hint">{step.hint}</p>
                                )}
                            </div>
                        </li>
                    ))}
                </ol>
            </section>
        </Reveal>
    );
}
