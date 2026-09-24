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
import { useProfile } from "./ProfileContext.jsx";
import { useCanteen } from "./CanteenContext.jsx";
import useTheme from "./useTheme.js";
import logoLockupUrl from "./assets/logo-lockup.svg";
import logoLockupLightUrl from "./assets/logo-lockup-light.svg";
import logoMarkLightUrl from "./assets/logo-mark-light.svg";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!clerkPubKey) {
    throw new Error(
        "Missing VITE_CLERK_PUBLISHABLE_KEY — add it to client/.env",
    );
}

const clerkAppearance = {
    variables: {
        colorPrimary: "#d75a1e",
        fontFamily: "'Inter', system-ui, sans-serif",
        borderRadius: "0.6rem",
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
            Cart
            {cart.count > 0 && <span className="cart-badge">{cart.count}</span>}
        </button>
    );
}

function TopBar({ theme, onToggleTheme }) {
    return (
        <header className="topbar">
            <div className="topbar-inner">
                <img
                    src={theme === "dark" ? logoLockupLightUrl : logoLockupUrl}
                    alt="Rush Bites"
                    className="topbar-logo"
                />
                <span className="topbar-date">
                    {new Date().toLocaleDateString(undefined, {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                    })}
                </span>
                <span className="topbar-meta">
                    <SignedIn>
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
            © {new Date().getFullYear()} <strong>Rush Bites</strong> —
            campus dining, pre-ordered.
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
    const tabs = isVendor
        ? [...CUSTOMER_TABS, ...VENDOR_TABS]
        : CUSTOMER_TABS;

    return (
        <>
            <main className="page">
                <div className="page-head">
                    <Reveal>
                        <p className="eyebrow">Campus dining, pre-ordered</p>
                        <h1 className="display">
                            Order ahead, <em>skip the queue</em>
                        </h1>
                        <p className="lede">
                            Browse every canteen on campus, order from your
                            seat, and pay by UPI or cash — your food meets you
                            at the counter.
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
                        <CanteensPage onOpenCanteen={openCanteenMenu} />
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
        <div className="auth-split">
            <div className="auth-hero">
                <div className="auth-hero-mark">
                    <img src={logoMarkLightUrl} alt="" />
                    Rush Bites
                </div>
                <p className="auth-hero-quote">
                    Great meals, <em>zero queues.</em> Food that meets you at
                    the counter — already paid, already prepared.
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
                                <TopBar theme={theme} onToggleTheme={toggle} />
                                <VendorPing />
                                <Shell />
                            </CartProvider>
                        </CanteenProvider>
                    </ProfileProvider>
                </SignedIn>
            </ToastProvider>
        </ClerkProvider>
    );
}
