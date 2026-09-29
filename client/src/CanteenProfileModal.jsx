import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import useOverlayA11y from "./useOverlayA11y.js";
import { useCart } from "./CartContext.jsx";
import { useToast } from "./toast.jsx";
import VegDot from "./VegDot.jsx";
import {
    ArrowRightIcon,
    CloseIcon,
    PhoneIcon,
    PinIcon,
    StarIcon,
    StoreIcon,
} from "./icons.jsx";

function Stars({ n }) {
    return (
        <span className="review-stars" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} className={i <= n ? "star star-on" : "star"}>
                    <StarIcon size={12} />
                </span>
            ))}
        </span>
    );
}

function toMins(t) {
    const [h, m] = String(t).split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
}

function openState(c) {
    if (!c?.hours?.open || !c?.hours?.close) {
        return { open: Boolean(c?.isOpen), label: null };
    }
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const open = toMins(c.hours.open);
    const close = toMins(c.hours.close);
    const isOpen =
        close === open
            ? Boolean(c.isOpen)
            : close > open
              ? cur >= open && cur < close
              : cur >= open || cur < close;
    return {
        open: isOpen,
        label: `${c.hours.open} – ${c.hours.close}`,
    };
}

/**
 * Full canteen profile — photo, hours, contact, rating and reviews, plus
 * quick-add of popular dishes straight from the profile.
 */
export default function CanteenProfileModal({ canteenId, onClose, onOpenMenu }) {
    const modalRef = useOverlayA11y(true, onClose);
    const cart = useCart();
    const toast = useToast();

    const [canteen, setCanteen] = useState(null);
    const [items, setItems] = useState([]);
    const [reviews, setReviews] = useState(null);
    const [error, setError] = useState(false);

    const load = useCallback(async () => {
        const [cRes, rRes] = await Promise.all([
            api(`/api/canteens/${canteenId}`),
            api(`/api/reviews/canteen/${canteenId}`),
        ]);

        if (cRes.ok && cRes.data.canteen) {
            setCanteen(cRes.data.canteen);
        } else {
            setError(true);
            return;
        }

        if (rRes.ok) setReviews(rRes.data.reviews || []);

        // menu for quick-add — the detail payload already carries items when
        // it can; otherwise fall back to the public menu listing
        if (Array.isArray(cRes.data.canteen?.items)) {
            setItems(cRes.data.canteen.items);
        } else {
            const mRes = await api(`/api/menu?canteen=${canteenId}`);
            if (mRes.ok) setItems(mRes.data.items || mRes.data.menu || []);
        }
    }, [canteenId]);

    useEffect(() => {
        load();
    }, [load]);

    const quickAdd = (item) => {
        const result = cart.add(item);
        if (result === "conflict") {
            toast("Cart has items from another canteen", "error");
            return;
        }
        toast(`${item.name} added to cart`);
    };

    const { open: isOpenNow, label: hoursLabel } = openState(canteen);

    return (
        <div className="drawer-root">
            <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
            <aside
                ref={modalRef}
                className="drawer profile-drawer"
                role="dialog"
                aria-modal="true"
                aria-label={canteen ? `${canteen.name} profile` : "Canteen profile"}
                tabIndex={-1}
            >
                {error && (
                    <>
                        <header className="drawer-head">
                            <h3>Canteen</h3>
                            <button
                                type="button"
                                className="theme-toggle"
                                onClick={onClose}
                                aria-label="Close profile"
                            >
                                <CloseIcon />
                            </button>
                        </header>
                        <p className="empty">
                            Couldn't load this canteen — it may have closed.
                        </p>
                    </>
                )}

                {canteen && (
                    <>
                        <div className="profile-hero">
                            {canteen.photo ? (
                                <img
                                    className="profile-photo"
                                    src={canteen.photo}
                                    alt={`${canteen.name} canteen`}
                                />
                            ) : (
                                <div className="profile-photo profile-photo-fallback">
                                    <StoreIcon />
                                </div>
                            )}
                            <div className="profile-id">
                                <h3>{canteen.name}</h3>
                                <p className="profile-sub">
                                    <span
                                        className={`pill ${isOpenNow ? "pill-green" : "pill-red"}`}
                                    >
                                        {isOpenNow ? "Open now" : "Closed"}
                                    </span>
                                    {hoursLabel && (
                                        <span className="profile-hours">
                                            {" "}
                                            · {hoursLabel}
                                        </span>
                                    )}
                                </p>
                                {canteen.location && (
                                    <p className="profile-sub">
                                        <PinIcon /> {canteen.location}
                                    </p>
                                )}
                                {canteen.ratingCount > 0 && (
                                    <p className="profile-sub">
                                        <Stars n={Math.round(canteen.ratingAvg)} />{" "}
                                        <strong>
                                            {Number(canteen.ratingAvg).toFixed(1)}
                                        </strong>
                                        <span className="rating-count">
                                            {" "}
                                            ({canteen.ratingCount})
                                        </span>
                                    </p>
                                )}
                            </div>
                            <button
                                type="button"
                                className="theme-toggle profile-close"
                                onClick={onClose}
                                aria-label="Close profile"
                            >
                                <CloseIcon />
                            </button>
                        </div>

                        {(canteen.contactName || canteen.contactPhone) && (
                            <p className="profile-contact">
                                {canteen.contactName && (
                                    <strong>{canteen.contactName}</strong>
                                )}
                                {canteen.contactName && canteen.contactPhone && " · "}
                                {canteen.contactPhone && (
                                    <a
                                        className="profile-phone"
                                        href={`tel:${canteen.contactPhone}`}
                                    >
                                        <PhoneIcon /> {canteen.contactPhone}
                                    </a>
                                )}
                            </p>
                        )}

                        {canteen.description && (
                            <p className="profile-desc">{canteen.description}</p>
                        )}

                        {items.length > 0 && (
                            <section className="profile-section">
                                <h4>
                                    Popular here{" "}
                                    <span className="muted">({items.length})</span>
                                </h4>
                                <ul className="profile-items">
                                    {items.slice(0, 6).map((item) => (
                                        <li key={item._id}>
                                            <span className="profile-item-name">
                                                <VegDot isVeg={item.isVeg} />{" "}
                                                {item.name}
                                            </span>
                                            <span className="profile-item-side">
                                                <span className="profile-item-price">
                                                    ₹{item.price}
                                                </span>
                                                <button
                                                    type="button"
                                                    className="btn-add"
                                                    onClick={() => quickAdd(item)}
                                                    disabled={!item.isAvailable}
                                                >
                                                    Add
                                                </button>
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                                <button
                                    type="button"
                                    className="btn btn-accent btn-block"
                                    onClick={() => onOpenMenu(canteenId)}
                                >
                                    View full menu <ArrowRightIcon />
                                </button>
                            </section>
                        )}

                        <section className="profile-section">
                            <h4>Reviews</h4>
                            {!reviews && <div className="skeleton skeleton-row" />}
                            {reviews?.length === 0 && (
                                <p className="muted reviews-empty">
                                    No reviews yet.
                                </p>
                            )}
                            {reviews?.length > 0 && (
                                <ul className="reviews-list">
                                    {reviews.slice(0, 8).map((r) => (
                                        <li key={r._id} className="review-row">
                                            <div className="review-row-head">
                                                <strong>
                                                    {r.customer?.name || "Customer"}
                                                </strong>
                                                <Stars n={r.rating} />
                                                <span className="review-date">
                                                    {new Date(
                                                        r.createdAt,
                                                    ).toLocaleDateString(undefined, {
                                                        day: "numeric",
                                                        month: "short",
                                                    })}
                                                </span>
                                            </div>
                                            {r.comment && (
                                                <p className="review-text">
                                                    {r.comment}
                                                </p>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </>
                )}
            </aside>
        </div>
    );
}
