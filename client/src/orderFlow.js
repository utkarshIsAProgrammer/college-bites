/* The one source of truth for order status flow on the client — mirrors
 * server/src/controllers/order.controllers.js TRANSITIONS exactly.
 * Every button that advances an order must consult this file, so an
 * impossible move like completed → completed can never be offered, let
 * alone fired. */

export const ORDER_TRANSITIONS = {
    pending: ["accepted", "cancelled"],
    accepted: ["preparing", "cancelled"],
    preparing: ["ready"],
    ready: ["completed"],
    completed: [],
    cancelled: [],
};

export const TERMINAL_STATES = new Set(["completed", "cancelled"]);

export function canTransition(from, to) {
    return Boolean(ORDER_TRANSITIONS[from]?.includes(to));
}

/** Actions the vendor may take right now, in display order. */
export function nextActions(status) {
    const LABELS = {
        accepted: "Accept",
        preparing: "Start preparing",
        ready: "Mark ready",
        completed: "Complete",
        cancelled: "Reject",
    };
    return (ORDER_TRANSITIONS[status] || []).map((to) => ({
        to,
        label: LABELS[to] || to,
    }));
}
