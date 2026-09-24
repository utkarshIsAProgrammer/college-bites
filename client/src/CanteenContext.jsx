import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";
import { useAuth } from "@clerk/clerk-react";
import { useProfile } from "./ProfileContext.jsx";
import { api } from "./api.js";

const CanteenContext = createContext(null);

export function useCanteen() {
    return useContext(CanteenContext);
}

/**
 * Vendor self-service: exposes the signed-in user's canteen (or null),
 * registration, update, and refresh. Null simply means "not a vendor".
 */
export function CanteenProvider({ children }) {
    const { isSignedIn, getToken } = useAuth();
    const profileCtx = useProfile();
    const refreshProfile = profileCtx?.refresh;
    const [canteen, setCanteen] = useState(null);
    const [loaded, setLoaded] = useState(false);

    // The role sync (ProfileProvider → clerk user → role) lags behind a fresh
    // registration, so instead of reading Clerk's role we look up the backend
    // document we own. A canteen on hand means we're a vendor.
    const isMyCanteen = useCallback(() => Boolean(canteen), [canteen]);

    const refresh = useCallback(async () => {
        try {
            const res = await api("/api/canteens/mine", { getToken });
            if (res.ok) {
                setCanteen(res.data.canteen || null);
            } else if (res.status === 401 || res.offline) {
                // Transient auth rotation or network blip — keep existing canteen
            } else if (res.status === 404) {
                // If the user was just created, sync may still be in flight; retry once
                const retry = await api("/api/canteens/mine", { getToken });
                if (retry.ok) {
                    setCanteen(retry.data.canteen || null);
                }
            }
        } catch {
            // Keep existing state on unexpected error
        } finally {
            setLoaded(true);
        }
    }, [getToken]);

    // A user is a vendor as soon as the backend has a canteen owned by their
    // clerkId — that does not wait for the role synced by ProfileProvider, so
    // we keep a single source of truth here instead of comparing role.
    useEffect(() => {
        if (!isSignedIn) {
            setCanteen(null);
            setLoaded(false);
            return;
        }
        refresh();
    }, [isSignedIn, refresh]);

    const register = useCallback(
        async ({ name, description, location, contactName, contactPhone }) => {
            try {
                const res = await api("/api/canteens", {
                    method: "POST",
                    getToken,
                    body: {
                        name,
                        description,
                        location,
                        contactName,
                        contactPhone,
                    },
                });
                if (res.ok && res.data.canteen) {
                    setCanteen(res.data.canteen);
                    refreshProfile?.();
                    return { ok: true };
                }
                return {
                    ok: false,
                    message:
                        res.data.message || "Could not register canteen",
                };
            } catch (err) {
                return { ok: false, message: err.message };
            }
        },
        [getToken, refreshProfile],
    );

    // edit canteen details / open-closed toggle
    const updateCanteen = useCallback(
        async (updates) => {
            try {
                const res = await api("/api/canteens/mine", {
                    method: "PUT",
                    getToken,
                    body: updates,
                });
                if (res.ok && res.data.canteen) {
                    setCanteen((prev) => ({
                        ...(prev || {}),
                        ...res.data.canteen,
                    }));
                    return { ok: true, message: res.data.message };
                }
                return {
                    ok: false,
                    message: res.data.message || "Update failed",
                };
            } catch (err) {
                return { ok: false, message: err.message };
            }
        },
        [getToken],
    );

    const value = { canteen, loaded, isMyCanteen, register, updateCanteen, refresh };

    return (
        <CanteenContext.Provider value={value}>
            {children}
        </CanteenContext.Provider>
    );
}
