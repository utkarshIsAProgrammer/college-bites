import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "./api.js";
import { useCart } from "./CartContext.jsx";
import { useToast } from "./toast.jsx";
import Reveal from "./Reveal.jsx";
import VegDot from "./VegDot.jsx";

function MenuSkeleton() {
    return (
        <div className="product-grid">
            {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="skeleton skeleton-card" />
            ))}
        </div>
    );
}

function Thumb({ item }) {
    if (item.image) {
        return (
            <img
                className="product-img"
                src={item.image}
                alt=""
                loading="lazy"
                onError={(e) => {
                    e.currentTarget.style.display = "none";
                }}
            />
        );
    }
    return <div className="thumb-fallback">🍽</div>;
}

/**
 * The customer marketplace — every available dish across all open canteens.
 * All vendor tooling lives on the "My Canteen" screen now; this page is
 * purely for browsing and adding to cart.
 */
export default function MenuPage({ focusCanteenId, onClearFocus }) {
    const { getToken } = useAuth();
    const cart = useCart();
    const toast = useToast();

    const [items, setItems] = useState([]);
    const [listError, setListError] = useState(null);
    const [listLoading, setListLoading] = useState(true);

    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("All");

    const load = useCallback(async () => {
        setListLoading(true);
        setListError(null);
        try {
            const res = await api(
                focusCanteenId ? `/api/menu?canteen=${focusCanteenId}` : "/api/menu",
                { getToken },
            );
            if (res.ok) {
                setItems(res.data.menu || []);
            } else {
                setListError(
                    res.data.message || `Request failed (${res.status})`,
                );
            }
        } catch (err) {
            setListError(err.message);
        } finally {
            setListLoading(false);
        }
    }, [getToken, focusCanteenId]);

    useEffect(() => {
        load();
    }, [load]);

    // stable per-category counts (not affected by search)
    const catList = useMemo(() => {
        const counts = new Map();
        for (const item of items) {
            counts.set(item.category, (counts.get(item.category) || 0) + 1);
        }
        return [
            { name: "All", count: items.length },
            ...[...counts.keys()]
                .sort((a, b) => a.localeCompare(b))
                .map((name) => ({ name, count: counts.get(name) })),
        ];
    }, [items]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return items
            .filter((item) => category === "All" || item.category === category)
            .filter(
                (item) =>
                    !q ||
                    item.name.toLowerCase().includes(q) ||
                    (item.description || "").toLowerCase().includes(q),
            );
    }, [items, search, category]);

    const grouped = useMemo(() => {
        const map = new Map();
        for (const item of filtered) {
            if (!map.has(item.category)) map.set(item.category, []);
            map.get(item.category).push(item);
        }
        return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    }, [filtered]);

    const addToCart = (item) => {
        const result = cart.add(item);
        if (result === "conflict") {
            if (
                window.confirm(
                    `Your cart has items from ${cart.canteen?.name || "another canteen"}. Start a new cart from ${item.canteen?.name || "this canteen"}?`,
                )
            ) {
                cart.switchCanteen(item);
            }
        }
    };

    return (
        <>
            {focusCanteenId && (
                <div className="alert alert-setup focus-banner">
                    <span>
                        Showing items from{" "}
                        <strong>
                            {items[0]?.canteen?.name || "this canteen"}
                        </strong>
                    </span>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={onClearFocus}
                    >
                        Show all items
                    </button>
                </div>
            )}

            <Reveal>
                <section className="card">
                    <div className="card-title">
                        <div>
                            <p className="eyebrow">The offering</p>
                            <h3>
                                Menu{" "}
                                <span className="muted">({items.length})</span>
                            </h3>
                        </div>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={load}
                            disabled={listLoading}
                        >
                            {listLoading ? "Loading…" : "Refresh"}
                        </button>
                    </div>

                    <div className="menu-layout">
                        <nav className="cat-rail" aria-label="Categories">
                            {catList.map((cat) => (
                                <button
                                    key={cat.name}
                                    type="button"
                                    className={`rail-item${category === cat.name ? " active" : ""}`}
                                    onClick={() => setCategory(cat.name)}
                                >
                                    <span>{cat.name}</span>
                                    <span className="rail-count">
                                        {cat.count}
                                    </span>
                                </button>
                            ))}
                        </nav>

                        <div className="menu-content">
                            <div className="search-wrap">
                                <span className="search-icon">⌕</span>
                                <input
                                    className="input"
                                    type="search"
                                    placeholder="Search dishes…"
                                    value={search}
                                    onChange={(e) =>
                                        setSearch(e.target.value)
                                    }
                                />
                            </div>

                            {listError && (
                                <div className="alert alert-error">
                                    {listError}
                                </div>
                            )}

                            {listLoading && <MenuSkeleton />}

                            {!listLoading &&
                                !listError &&
                                filtered.length === 0 && (
                                    <p className="empty">
                                        {items.length === 0
                                            ? focusCanteenId
                                                ? "This canteen hasn't listed any items yet."
                                                : "No items on the menu yet — check back soon."
                                            : "Nothing matches your search."}
                                    </p>
                                )}

                            {!listLoading &&
                                grouped.map(([cat, catItems]) => (
                                    <div key={cat} className="cat-group">
                                        <div className="cat-header">
                                            <h4>{cat}</h4>
                                            <span className="cat-count">
                                                {catItems.length}{" "}
                                                {catItems.length === 1
                                                    ? "item"
                                                    : "items"}
                                            </span>
                                        </div>
                                        <div className="product-grid">
                                            {catItems.map((item) => (
                                                <article
                                                    key={item._id}
                                                    className={`product-card${item.isAvailable ? "" : " unavailable"}`}
                                                >
                                                    <div className="product-media">
                                                        <Thumb item={item} />
                                                        {!item.isAvailable && (
                                                            <div className="soldout-veil">
                                                                <span className="soldout-tag">
                                                                    Sold out
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="product-body">
                                                        <h5 className="product-name">
                                                            <VegDot
                                                                isVeg={
                                                                    item.isVeg
                                                                }
                                                            />{" "}
                                                            {item.name}
                                                        </h5>
                                                        {item.canteen?.name && (
                                                            <p className="product-vendor">
                                                                {item.canteen.name}
                                                            </p>
                                                        )}
                                                        {item.prepMins > 0 && (
                                                            <p className="product-prep">
                                                                ~{item.prepMins} min
                                                            </p>
                                                        )}
                                                        {item.description && (
                                                            <p className="product-desc">
                                                                {
                                                                    item.description
                                                                }
                                                            </p>
                                                        )}
                                                        <div className="product-foot">
                                                            <span className="product-price">
                                                                ₹{item.price}
                                                            </span>
                                                            {!item.isAvailable ||
                                                            !item.canteen?.isOpen ? (
                                                                <button
                                                                    type="button"
                                                                    className="btn-add"
                                                                    disabled
                                                                >
                                                                    {!item.isAvailable
                                                                        ? "SOLD OUT"
                                                                        : "CLOSED"}
                                                                </button>
                                                            ) : (cart.quantities[item._id] || 0) > 0 ? (
                                                                <div className="stepper">
                                                                    <button
                                                                        type="button"
                                                                        className="stepper-btn"
                                                                        aria-label="Remove one"
                                                                        onClick={() =>
                                                                            cart.decrement(
                                                                                item._id,
                                                                            )
                                                                        }
                                                                    >
                                                                        −
                                                                    </button>
                                                                    <span className="stepper-qty">
                                                                        {
                                                                            cart.quantities[
                                                                                item._id
                                                                            ]
                                                                        }
                                                                    </span>
                                                                    <button
                                                                        type="button"
                                                                        className="stepper-btn"
                                                                        aria-label="Add one"
                                                                        onClick={() =>
                                                                            addToCart(
                                                                                item,
                                                                            )
                                                                        }
                                                                    >
                                                                        +
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    className="btn-add"
                                                                    onClick={() =>
                                                                        addToCart(
                                                                            item,
                                                                        )
                                                                    }
                                                                >
                                                                    ADD
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </article>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                </section>
            </Reveal>
        </>
    );
}
