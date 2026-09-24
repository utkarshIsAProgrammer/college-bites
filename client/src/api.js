const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

/**
 * Thin fetch wrapper. Never throws on a network failure — an unreachable
 * server is a status, not an exception, so callers can render it.
 *
 * → { ok, status, offline, data }
 *   status 0  → the server could not be reached at all
 *   status 503 → the server is up but its database is unreachable
 */
export async function api(path, { method = "GET", getToken, body } = {}) {
    const headers = { "Content-Type": "application/json" };

    if (getToken) {
        const token = await getToken();
        if (token) headers.Authorization = `Bearer ${token}`;
    }

    let res;
    try {
        res = await fetch(`${API_BASE}${path}`, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
    } catch {
        return {
            ok: false,
            status: 0,
            offline: true,
            data: {
                success: false,
                message:
                    "Can't reach the server — check that it's running and try again.",
            },
        };
    }

    const data = await res.json().catch(() => ({}));
    const offline = res.status === 503;

    return { ok: res.ok, status: res.status, offline, data };
}
