import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "./api.js";

const ProfileContext = createContext(null);

export function useProfile() {
    return useContext(ProfileContext);
}

/**
 * Syncs the signed-in Clerk user into the backend database (POST /api/auth/sync)
 * once per sign-in session and exposes the synced Mongo profile, including the
 * user's role — required before ordering, since every order endpoint 404s until
 * the user exists server-side.
 */
export function ProfileProvider({ children }) {
    const { isSignedIn, getToken } = useAuth();
    const [profile, setProfile] = useState(null);
    const [syncError, setSyncError] = useState(null);

    const sync = useCallback(async () => {
        try {
            const res = await api("/api/auth/sync", {
                method: "POST",
                getToken,
            });
            if (res.ok && res.data.user) {
                setProfile(res.data.user);
                setSyncError(null);
            } else {
                setSyncError(
                    res.data.message || `Sync failed (${res.status})`,
                );
            }
        } catch (err) {
            setSyncError(err.message);
        }
    }, [getToken]);

    useEffect(() => {
        if (!isSignedIn) {
            setProfile(null);
            setSyncError(null);
            return;
        }
        sync();
    }, [isSignedIn, sync]);

    const value = {
        profile, // synced Mongo user { _id, name, email, role, … } or null
        role: profile?.role || "customer",
        isStaff: profile?.role === "admin" || profile?.role === "staff",
        syncError,
        refresh: sync,
    };

    return (
        <ProfileContext.Provider value={value}>
            {children}
        </ProfileContext.Provider>
    );
}
