import { getAuth } from "@clerk/express";
import mongoose from "mongoose";
import User from "../models/user.model.js";

// blocks unauthenticated requests
export const requireAuth = (req, res, next) => {
    const { isAuthenticated } = getAuth(req);

    if (!isAuthenticated) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized!",
        });
    }

    next();
};

// resolves the MongoDB user once and exposes it as req.user.
// Also safe on PUBLIC routes: no token → no user attached, request continues
// anonymously (protected routes must still be gated by requireAuth).
export const attachUser = async (req, res, next) => {
    try {
        const { userId } = getAuth(req);

        if (!userId) {
            next();
            return;
        }

        const user = await User.findOne({ clerkId: userId })
            .select("_id clerkId role name email")
            .lean();

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found!",
            });
        }

        req.user = user;
        next();
    } catch (err) {
        console.error("Attach user error:", err.message);

        // Mongo unreachable (DNS failure, paused cluster, IP not allowlisted)
        // is an outage, not a bug — say so, and don't pretend it's a 500.
        const network =
            err.name === "MongoNetworkError" ||
            err.name === "MongooseServerSelectionError" ||
            err.name === "MongoServerSelectionError" ||
            mongoose.connection.readyState !== 1;

        if (network) {
            return res.status(503).json({
                success: false,
                message:
                    "Database is unreachable right now. Check your network and the Atlas allowlist, then try again.",
            });
        }

        res.status(500).json({
            success: false,
            message: "Failed to resolve user!",
        });
    }
};
