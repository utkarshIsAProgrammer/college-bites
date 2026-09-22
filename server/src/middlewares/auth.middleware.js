import { getAuth } from "@clerk/express";
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

// resolves the MongoDB user once and exposes it as req.user
// (must run after requireAuth)
export const attachUser = async (req, res, next) => {
    try {
        const { userId } = getAuth(req);

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
        console.error("Attach user error:", err);

        res.status(500).json({
            success: false,
            message: "Failed to resolve user!",
        });
    }
};
