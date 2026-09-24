/**
 * FSSAI-style veg / non-veg indicator — the green or brown square dot every
 * Indian food app is expected to have. Renders nothing when unknown, so old
 * orders without the flag stay clean.
 */
export default function VegDot({ isVeg, title }) {
    if (typeof isVeg !== "boolean") return null;

    return (
        <span
            className={`veg-dot ${isVeg ? "veg" : "nonveg"}`}
            title={title || (isVeg ? "Veg" : "Non-veg")}
            aria-label={isVeg ? "Vegetarian" : "Non-vegetarian"}
        />
    );
}
