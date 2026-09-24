import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
} from "react";

const CartContext = createContext(null);

export function useCart() {
    return useContext(CartContext);
}

export function CartProvider({ children }) {
    // { [menuItemId]: quantity }
    const [quantities, setQuantities] = useState({});
    // snapshot of item data (name/price/image) captured when added
    const [items, setItems] = useState({});
    // the canteen this cart belongs to (one canteen per order)
    const [canteen, setCanteen] = useState(null);
    const [isOpen, setIsOpen] = useState(false);

    const canteenOf = (item) =>
        item.canteen
            ? {
                  _id: item.canteen._id || item.canteen,
                  name: item.canteen.name || "",
              }
            : null;

    /**
     * Returns "added" on success, or "conflict" when the cart already
     * holds items from a different canteen (caller decides whether to
     * offer switchCanteen). `qty` lets bulk callers (reorder) add several.
     */
    const add = useCallback(
        (item, qty = 1) => {
            const incoming = canteenOf(item);
            const hasItems = Object.keys(quantities).length > 0;

            if (
                hasItems &&
                canteen &&
                incoming &&
                String(incoming._id) !== String(canteen._id)
            ) {
                return "conflict";
            }

            const n = Number.isInteger(qty) && qty > 0 ? qty : 1;
            setQuantities((q) => ({
                ...q,
                [item._id]: (q[item._id] || 0) + n,
            }));
            setItems((i) => ({ ...i, [item._id]: item }));
            // functional updates on both — two adds in the same tick would
            // otherwise read a stale `canteen === null` and both write,
            // silently letting one cart mix canteens
            setCanteen((c) => c || incoming);
            return "added";
        },
        [quantities, canteen],
    );

    // clear the cart and start fresh from another canteen
    const switchCanteen = useCallback((item) => {
        setQuantities({ [item._id]: 1 });
        setItems({ [item._id]: item });
        setCanteen(canteenOf(item));
    }, []);

    const decrement = useCallback((itemId) => {
        setQuantities((q) => {
            const next = { ...q };
            const qty = (next[itemId] || 0) - 1;
            if (qty <= 0) {
                delete next[itemId];
            } else {
                next[itemId] = qty;
            }
            return next;
        });
    }, []);

    const clear = useCallback(() => {
        setQuantities({});
        setItems({});
        setCanteen(null);
        setIsOpen(false);
    }, []);

    const count = useMemo(
        () => Object.values(quantities).reduce((sum, q) => sum + q, 0),
        [quantities],
    );

    const total = useMemo(
        () =>
            Object.entries(quantities).reduce(
                (sum, [id, q]) => sum + (items[id]?.price || 0) * q,
                0,
            ),
        [quantities, items],
    );

    const lines = useMemo(
        () =>
            Object.entries(quantities)
                .filter(([, q]) => q > 0)
                .map(([id, q]) => ({ item: items[id], qty: q }))
                .filter((line) => line.item),
        [quantities, items],
    );

    const open = useCallback(() => setIsOpen(true), []);
    const close = useCallback(() => setIsOpen(false), []);

    const value = useMemo(
        () => ({
            quantities,
            items,
            lines,
            canteen, // { _id, name } of the cart's canteen, or null
            count,
            total,
            isOpen,
            add,
            switchCanteen,
            decrement,
            clear,
            open,
            close,
        }),
        [
            quantities,
            items,
            lines,
            canteen,
            count,
            total,
            isOpen,
            add,
            switchCanteen,
            decrement,
            clear,
            open,
            close,
        ],
    );

    return (
        <CartContext.Provider value={value}>{children}</CartContext.Provider>
    );
}
