import { useEffect, useRef } from "react";

/**
 * Accessibility plumbing for overlays (drawers, modals, fullscreen modes):
 *
 *   • Escape closes the overlay (via onClose)
 *   • focus moves into the overlay on open and returns to the previously
 *     focused element on close
 *   • Tab / Shift+Tab are trapped inside the overlay while it's open
 *   • the page behind can't scroll (body scroll lock with scrollbar-gap
 *     compensation so the layout doesn't jump)
 *
 * Usage: const ref = useOverlayA11y(isOpen, onClose); <aside ref={ref} …>
 */
export default function useOverlayA11y(isOpen, onClose) {
    const overlayRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return;

        const overlay = overlayRef.current;
        if (!overlay) return;

        // remember where focus came from so we can hand it back on close
        const previouslyFocused = document.activeElement;
        const prevOverflow = document.body.style.overflow;
        const prevPaddingRight = document.body.style.paddingRight;

        // scroll lock — compensate for the disappearing scrollbar
        const scrollbarGap = window.innerWidth - document.documentElement.clientWidth;
        if (scrollbarGap > 0) {
            document.body.style.paddingRight = `${scrollbarGap}px`;
        }
        document.body.style.overflow = "hidden";

        // move focus into the overlay: first focusable element, else the
        // overlay itself (which must therefore have tabIndex={-1})
        const selector = [
            "button:not([disabled])",
            "[href]",
            "input:not([disabled])",
            "select:not([disabled])",
            "textarea:not([disabled])",
            "[tabindex]:not([tabindex='-1'])",
        ].join(", ");

        const focusables = () =>
            Array.from(overlay.querySelectorAll(selector)).filter(
                (el) => el.offsetParent !== null || el === document.activeElement,
            );

        const first = focusables()[0] || overlay;
        first.focus({ preventScroll: true });

        const handleKey = (e) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                onClose?.();
                return;
            }
            if (e.key !== "Tab") return;

            // focus trap
            const list = focusables();
            if (list.length === 0) return;
            const firstEl = list[0];
            const lastEl = list[list.length - 1];

            if (e.shiftKey && document.activeElement === firstEl) {
                e.preventDefault();
                lastEl.focus();
            } else if (!e.shiftKey && document.activeElement === lastEl) {
                e.preventDefault();
                firstEl.focus();
            }
        };

        document.addEventListener("keydown", handleKey, true);

        return () => {
            document.removeEventListener("keydown", handleKey, true);
            document.body.style.overflow = prevOverflow;
            document.body.style.paddingRight = prevPaddingRight;
            previouslyFocused?.focus?.({ preventScroll: true });
        };
    }, [isOpen, onClose]);

    return overlayRef;
}
