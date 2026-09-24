import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import Reveal from "./Reveal.jsx";
import { useCanteen } from "./CanteenContext.jsx";
import { useToast } from "./toast.jsx";

function Stars({ n }) {
    return (
        <span className="review-stars" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} className={i <= n ? "star star-on" : "star"}>
                    ★
                </span>
            ))}
        </span>
    );
}

/** Expandable review list — reviews were always collectable, now they're
 * readable where the decision actually happens: on the canteen card. */
function CanteenReviews({ canteenId }) {
    const [reviews, setReviews] = useState(null); // null = not loaded yet
    const [error, setError] = useState(false);

    const load = useCallback(async () => {
        setError(false);
        const res = await api(`/api/reviews/canteen/${canteenId}`);
        if (res.ok) {
            setReviews(res.data.reviews || []);
        } else {
            setError(true);
        }
    }, [canteenId]);

    if (error) {
        return <p className="muted reviews-error">Couldn't load reviews.</p>;
    }

    if (!reviews) {
        return <div className="skeleton skeleton-row" />;
    }

    if (reviews.length === 0) {
        return <p className="muted reviews-empty">No reviews yet.</p>;
    }

    return (
        <ul className="reviews-list">
            {reviews.map((r) => (
                <li key={r._id} className="review-row">
                    <div className="review-row-head">
                        <strong>{r.customer?.name || "Customer"}</strong>
                        <Stars n={r.rating} />
                        <span className="review-date">
                            {new Date(r.createdAt).toLocaleDateString(undefined, {
                                day: "numeric",
                                month: "short",
                            })}
                        </span>
                    </div>
                    {r.comment && <p className="review-text">{r.comment}</p>}
                </li>
            ))}
        </ul>
    );
}

export default function CanteensPage({ onOpenCanteen, onOpenCanteenMenu }) {
    const [canteens, setCanteens] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // which canteen's reviews are expanded (one at a time keeps it tidy)
    const [openReviews, setOpenReviews] = useState(null);

    // "become a seller" CTA with an inline registration form — lives here
    // because non-vendors can't see the My Canteen tab (it appears only
    // after registering), so this is the one entry point that must work
    const { canteen: myCanteen, isMyCanteen, register, refresh } = useCanteen();
    const toast = useToast();
    const [showVendorCta, setShowVendorCta] = useState(false);
    const [regName, setRegName] = useState("");
    const [regLocation, setRegLocation] = useState("");
    const [regContactName, setRegContactName] = useState("");
    const [regContactPhone, setRegContactPhone] = useState("");
    const [regBusy, setRegBusy] = useState(false);

    const handleRegister = async (e) => {
        e.preventDefault();
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
            setShowVendorCta(false);
        } else {
            toast(result.message || "Could not register canteen", "error");
        }
    };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api("/api/canteens");
            if (res.ok) {
                setCanteens(res.data.canteens || []);
                setError(null);
            } else {
                setError(res.data.message || "Failed to load canteens");
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    // keep own-canteen state in line with the server
    useEffect(() => {
        load();
        refresh();
    }, [load, refresh]);

    return (
        <Reveal>
            <section className="card">
                <div className="card-title">
                    <div>
                        <p className="eyebrow">
                            <span className="eyebrow-num">No. 4</span> — The
                            hall
                        </p>
                        <h3>
                            Canteens{" "}
                            <span className="muted">({canteens.length})</span>
                        </h3>
                    </div>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={load}
                        disabled={loading}
                    >
                        {loading ? "Loading…" : "Refresh"}
                    </button>
                </div>

                {error && <div className="alert alert-error">{error}</div>}

                {loading && <div className="skeleton skeleton-order" />}

                {!loading && !error && canteens.length === 0 && (
                    <p className="empty">
                        No canteens registered yet — be the first!
                    </p>
                )}

                {!myCanteen && !loading && (
                    <div className="vendor-cta">
                        <div className="card-title">
                            <div>
                                <p className="eyebrow">For canteen owners</p>
                                <h3>Run a canteen on campus?</h3>
                            </div>
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setShowVendorCta((s) => !s)}
                            >
                                {showVendorCta ? "Close" : "How it works"}
                            </button>
                        </div>
                        {showVendorCta && (
                            <form onSubmit={handleRegister}>
                                <div className="form-grid">
                                    <div className="field">
                                        <label className="label" htmlFor="cc-name">
                                            Canteen name *
                                        </label>
                                        <input
                                            id="cc-name"
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
                                            htmlFor="cc-location"
                                        >
                                            Location in hall
                                        </label>
                                        <input
                                            id="cc-location"
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
                                            htmlFor="cc-contact-name"
                                        >
                                            Contact person *
                                        </label>
                                        <input
                                            id="cc-contact-name"
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
                                            htmlFor="cc-contact-phone"
                                        >
                                            Contact number *
                                        </label>
                                        <input
                                            id="cc-contact-phone"
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
                                <p className="muted image-hint">
                                    After registering, <strong>My Menu</strong> and{" "}
                                    <strong>My Canteen</strong> tabs appear — your
                                    dishes, queue and settings all live there.
                                </p>
                            </form>
                        )}
                    </div>
                )}

                <div className="product-grid">
                    {canteens.map((c) => (
                        <article
                            key={c._id}
                            className="product-card canteen-card"
                            onClick={() => onOpenCanteenMenu?.(c._id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) =>
                                e.key === "Enter" && onOpenCanteenMenu?.(c._id)
                            }
                        >
                            <div className="product-media">
                                {c.photo ? (
                                    <img
                                        className="product-img"
                                        src={c.photo}
                                        alt=""
                                        loading="lazy"
                                    />
                                ) : (
                                    <div className="thumb-fallback">🏪</div>
                                )}
                            </div>
                            <div className="product-body">
                                <h5 className="product-name">{c.name}</h5>
                                {c.location && (
                                    <p className="product-desc">📍 {c.location}</p>
                                )}
                                {c.description && (
                                    <p className="product-desc">{c.description}</p>
                                )}
                                <div className="product-foot">
                                    <span className="product-vendor">
                                        {c.itemCount} items
                                        {Number(c.queue) > 0 && (
                                            <span className="queue-chip">
                                                {" "}
                                                · 🔥 {c.queue} in queue
                                            </span>
                                        )}
                                    </span>
                                    {c.ratingCount > 0 ? (
                                        <button
                                            type="button"
                                            className="rating-badge rating-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setOpenReviews((cur) =>
                                                    cur === c._id ? null : c._id,
                                                );
                                            }}
                                            title="Show reviews"
                                        >
                                            ★ {Number(c.ratingAvg).toFixed(1)}
                                            <span className="rating-count">
                                                {" "}
                                                ({c.ratingCount})
                                            </span>
                                        </button>
                                    ) : (
                                        <span className="rating-badge rating-empty">
                                            No reviews yet
                                        </span>
                                    )}
                                </div>

                                {openReviews === c._id && (
                                    <div className="reviews-panel">
                                        <CanteenReviews canteenId={c._id} />
                                    </div>
                                )}

                                {c.itemCount > 0 && (
                                    <button
                                        type="button"
                                        className="btn btn-accent btn-sm btn-block canteen-cta"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onOpenCanteenMenu?.(c._id);
                                        }}
                                    >
                                        View menu →
                                    </button>
                                )}

                                {c.itemCount === 0 && (
                                    <p className="muted">
                                        No dishes added yet — head to <strong>My
                                        Menu</strong> to add the first item.
                                    </p>
                                )}
                            </div>
                        </article>
                    ))}
                </div>
            </section>
        </Reveal>
    );
}
