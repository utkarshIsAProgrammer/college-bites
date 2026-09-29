import { useState } from "react";
import {
    ClerkProvider,
    SignedIn,
    SignedOut,
    SignIn,
    UserButton,
} from "@clerk/clerk-react";
import MenuPage from "./MenuPage.jsx";
import MenuManager from "./MenuManager.jsx";
import OrdersPage from "./OrdersPage.jsx";
import VendorDashboard from "./VendorDashboard.jsx";
import CanteensPage from "./CanteensPage.jsx";
import CartDrawer from "./CartDrawer.jsx";
import ConnectionBanner from "./ConnectionBanner.jsx";
import { CartProvider, useCart } from "./CartContext.jsx";
import { ProfileProvider } from "./ProfileContext.jsx";
import { CanteenProvider } from "./CanteenContext.jsx";
import Reveal from "./Reveal.jsx";
import { ToastProvider } from "./toast.jsx";
import VendorPing from "./VendorPing.jsx";
import ReadyPing from "./ReadyPing.jsx";
import { useProfile } from "./ProfileContext.jsx";
import { useCanteen } from "./CanteenContext.jsx";
import useTheme from "./useTheme.js";
import LogoLockup from "./LogoLockup.jsx";
import PushSetup from "./PushSetup.jsx";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!clerkPubKey) {
    throw new Error(
        "Missing VITE_CLERK_PUBLISHABLE_KEY — add it to client/.env",
    );
}

const clerkAppearance = {
    variables: {
        colorPrimary: "#ff4f00",
        fontFamily: "'Archivo', system-ui, sans-serif",
        borderRadius: "0.4rem",
    },
};

const CUSTOMER_TABS = [
    { key: "menu", label: "Menu" },
    { key: "orders", label: "Orders" },
    { key: "canteens", label: "Canteens" },
];

const VENDOR_TABS = [
    { key: "vendor-menu", label: "My Menu" },
    { key: "vendor", label: "My Canteen" },
];

const MARQUEE_ITEMS = [
    "Order ahead",
    "Skip the queue",
    "Pay by UPI or cash",
    "Token in hand",
    "Every canteen, one menu",
    "Food meets you at the counter",
];

// Bucks-style marquee strip — pauses on hover, respects reduced motion
function Marquee() {
    const chunk = (key) => (
        <div className="marquee-chunk" aria-hidden={key > 0}>
            {MARQUEE_ITEMS.map((item) => (
                <span key={item}>{item}</span>
            ))}
        </div>
    );

    return (
        <div className="marquee" role="presentation">
            <div className="marquee-track">
                {chunk(0)}
                {chunk(1)}
            </div>
        </div>
    );
}

function SunIcon() {
    return (
        <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2" />
            <path d="M12 20v2" />
            <path d="m4.93 4.93 1.41 1.41" />
            <path d="m17.66 17.66 1.41 1.41" />
            <path d="M2 12h2" />
            <path d="M20 12h2" />
            <path d="m6.34 17.66-1.41 1.41" />
            <path d="m19.07 4.93-1.41 1.41" />
        </svg>
    );
}

function MoonIcon() {
    return (
        <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
    );
}

function CartButton() {
    const cart = useCart();

    return (
        <button
            type="button"
            className="cart-btn"
            onClick={cart.open}
            aria-label="Open cart"
        >
            <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
            >
                <circle cx="8" cy="21" r="1" />
                <circle cx="19" cy="21" r="1" />
                <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
            </svg>
            <span className="cart-label">Cart</span>
            {cart.count > 0 && <span className="cart-badge">{cart.count}</span>}
        </button>
    );
}

function TopBar({ theme, onToggleTheme }) {
    return (
        <header className="topbar">
            <div className="topbar-inner">
                <LogoLockup size={40} className="topbar-logo" />
                <span className="topbar-date">
                    {new Date().toLocaleDateString(undefined, {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                    })}
                </span>
                <span className="topbar-meta">
                    <SignedIn>
                        <PushSetup />
                        <CartButton />
                        <UserButton afterSignOutUrl="/" />
                    </SignedIn>
                    <button
                        type="button"
                        className="theme-toggle"
                        onClick={onToggleTheme}
                        aria-label="Toggle dark mode"
                        title="Toggle dark mode"
                    >
                        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
                    </button>
                </span>
            </div>
        </header>
    );
}

function Footer() {
    return (
        <footer className="footer">
            © {new Date().getFullYear()} <strong>PrePlate</strong> — campus
            dining, pre-ordered.
        </footer>
    );
}

function Shell() {
    // focusCanteenId — set when a customer taps "View menu" on a canteen card;
    // MenuPage then filters to that canteen until cleared
    const [tab, setTab] = useState("menu");
    const [focusCanteenId, setFocusCanteenId] = useState(null);

    const { isStaff } = useProfile();
    const { canteen } = useCanteen();

    const openCanteenMenu = (canteenId) => {
        setFocusCanteenId(canteenId);
        setTab("menu");
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    // role-aware tabs — customers never see vendor chrome; the "My Canteen"
    // tab appears once you're a vendor. Checks the canteen context too because
    // the synced role lags behind a fresh registration until the next sync.
    const isVendor = isStaff || Boolean(canteen);
    const tabs = isVendor ? [...CUSTOMER_TABS, ...VENDOR_TABS] : CUSTOMER_TABS;

    return (
        <>
            <main className="page">
                <div className="page-head">
                    <Reveal>
                        <p className="eyebrow">Campus dining, pre-ordered</p>
                        <h1 className="display">
                            Skip the queue, <em>keep it hot</em>
                        </h1>
                        <p className="lede">
                            Every canteen on campus, one loud little app. Order
                            from your seat, pay by UPI or cash, and your food
                            meets you at the counter — token in hand.
                        </p>
                    </Reveal>
                    <nav className="tabs" aria-label="Sections">
                        {tabs.map(({ key, label }) => (
                            <button
                                key={key}
                                type="button"
                                className={`tab${tab === key ? " active" : ""}`}
                                onClick={() => setTab(key)}
                            >
                                {label}
                            </button>
                        ))}
                    </nav>
                </div>
                <div className="stack">
                    {tab === "menu" ? (
                        <MenuPage
                            focusCanteenId={focusCanteenId}
                            onClearFocus={() => setFocusCanteenId(null)}
                        />
                    ) : tab === "orders" ? (
                        <OrdersPage />
                    ) : tab === "canteens" ? (
                        <CanteensPage onOpenCanteenMenu={openCanteenMenu} />
                    ) : tab === "vendor-menu" ? (
                        <MenuManager />
                    ) : (
                        <VendorDashboard />
                    )}
                </div>
            </main>
            <CartDrawer />
            <Footer />
        </>
    );
}

function SignInScreen() {
    return (
        <div className="auth-wrap">
            <Marquee />
            <div className="auth-split">
            <div className="auth-hero">
                {/* the navbar's own LogoLockup at the same footprint as the
                    old 46px mark — size 46 makes the mark artwork render at
                    the same ~40px height it had before (the artwork spans
                    ~87% of the lockup's viewBox); same fonts as the navbar;
                    CSS keeps it light-inked on this always-dark hero */}
                <LogoLockup size={46} tagline className="auth-hero-logo" />
                    <p className="auth-hero-quote">
                        Great meals, <em>zero queues.</em> Food that meets you
                        at the counter — already paid, already prepared, still
                        hot.
                    </p>
                    <p className="auth-hero-foot">
                        Campus dining, pre-ordered · Est. 2026
                    </p>
                </div>
                <div className="auth-panel">
                    <div className="auth-panel-head">
                        <h1>Welcome back</h1>
                        <p>Sign in to continue to your console.</p>
                    </div>
                    <SignIn signUpUrl="/sign-up" />
                </div>
            </div>
        </div>
    );
}

export default function App() {
    const { theme, toggle } = useTheme();

    return (
        <ClerkProvider
            publishableKey={clerkPubKey}
            appearance={clerkAppearance}
        >
            <ToastProvider>
                <div className="grain" aria-hidden="true" />
                <ConnectionBanner />
                <SignedOut>
                    <SignInScreen />
                </SignedOut>
                <SignedIn>
                    <ProfileProvider>
                        <CanteenProvider>
                            <CartProvider>
                                <Marquee />
                                <TopBar theme={theme} onToggleTheme={toggle} />
                                <VendorPing />
                                <ReadyPing />
                                <Shell />
                            </CartProvider>
                        </CanteenProvider>
                    </ProfileProvider>
                </SignedIn>
            </ToastProvider>
        </ClerkProvider>
    );
}
