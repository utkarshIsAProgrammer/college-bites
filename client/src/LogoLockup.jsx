import { useId } from "react";

/**
 * The one true PrePlate logo — a React component, not an <img>.
 *
 * Why: SVGs loaded via <img> can't use the page's web fonts, so the old
 * wordmark rendered in fallback fonts and looked broken. This component
 * inlines the SVG mark (same plate/noodles/fork/spoon artwork as the
 * favicon) and renders the wordmark as real text — real brand fonts,
 * theme-aware colors via CSS variables. One component, identical everywhere.
 *
 * Geometry is designed on a fixed 200×64 viewBox and scaled by `height`,
 * so it stays pixel-consistent at any size.
 *
 * Usage: <LogoLockup size={40} />            // navbar
 *        <LogoLockup size={56} tagline />    // signup hero
 */
export default function LogoLockup({ size = 40, tagline = false, className = "" }) {
    // unique ids per instance — the navbar and hero can both be mounted
    const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
    const gradId = `ppGrad${uid}`;
    const clipId = `ppClip${uid}`;

    return (
        <svg
            className={`logo-lockup ${className}`.trim()}
            height={size}
            viewBox="0 0 200 64"
            role="img"
            aria-label="PrePlate — campus dining, pre-ordered"
        >
            <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#FF7A3D" />
                    <stop offset="0.55" stopColor="#FF4F00" />
                    <stop offset="1" stopColor="#FF4F00" />
                </linearGradient>
                <clipPath id={clipId}>
                    <circle cx="32" cy="36" r="17" />
                </clipPath>
            </defs>

            {/* ── mark: same plate/noodles/fork/spoon artwork as the favicon ── */}
            <g className="logo-mark">
                <circle cx="32" cy="36" r="23" fill="none" strokeWidth="2.5" />
                <circle
                    cx="32"
                    cy="36"
                    r="18"
                    fill="none"
                    strokeWidth="1.2"
                    opacity="0.5"
                />
                <g
                    className="logo-noodles"
                    clipPath={`url(#${clipId})`}
                    fill="none"
                    strokeWidth="2"
                    strokeLinecap="round"
                >
                    <path d="M13 33 q6 -5 12 0 t12 0 t12 0" />
                    <path d="M14 40 q6 -5 12 0 t12 0 t12 0" />
                    <path d="M17 47 q5 -4 10 0 t10 0" />
                </g>
                <g className="logo-fork" transform="rotate(-20 32 44)">
                    <rect x="24.75" y="10" width="2.5" height="14" rx="1.25" />
                    <rect x="30.75" y="10" width="2.5" height="14" rx="1.25" />
                    <rect x="36.75" y="10" width="2.5" height="14" rx="1.25" />
                    <path d="M22.5 22.5h19c0 4.4-2.9 7-6.4 7h-6.2c-3.5 0-6.4-2.6-6.4-7z" />
                    <rect x="29.75" y="28.5" width="4.5" height="25.5" rx="2.25" />
                </g>
                <g className="logo-spoon" transform="rotate(20 32 44)" strokeWidth="1.5">
                    <ellipse cx="32" cy="16.5" rx="6.2" ry="8.5" />
                    <rect x="29.75" y="27" width="4.5" height="27" rx="2.25" />
                </g>
                <circle cx="32" cy="6" r="2.5" fill="#FF4F00" />
            </g>

            {/* ── wordmark: real text, real fonts. textLength pins each
                word's width so the layout holds even before the web font
                loads, and the two words can never collide. ── */}
            <text
                x="68"
                y="42"
                className="logo-pre"
                textLength="46"
                lengthAdjust="spacingAndGlyphs"
                fill={`url(#${gradId})`}
            >
                Pre
            </text>
            <text
                x="122"
                y="42"
                className="logo-plate"
                textLength="70"
                lengthAdjust="spacing"
            >
                PLATE
            </text>

            {tagline && (
                <text x="68" y="58" className="logo-tagline">
                    SKIP THE QUEUE
                </text>
            )}
        </svg>
    );
}
