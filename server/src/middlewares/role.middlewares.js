import { getAuth } from "@clerk/express";
import User from "../models/user.model.js";

export const requireRole = (...allowedRoles) => {
    return async (req, res, next) => {
        try {
            const { isAuthenticated, userId } = getAuth(req);

            // check authentication
            if (!isAuthenticated) {
                return res.status(401).json({
                    success: false,
                    message: "Unauthorized!",
                });
            }

            // find user in the database
            const user = await User.findOne({
                clerkId: userId,
            });

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: "User not found!",
                });
            }

            // check role
            if (!allowedRoles.includes(user.role)) {
                return res.status(403).json({
                    success: false,
                    message: "Forbidden! You don't have permission.",
                });
            }

            // make user available to controllers
            req.user = user;
            next();
        } catch (err) {
            console.error("Role middleware error:", err);

            return res.status(500).json({
                success: false,
                message: "Authorization failed!",
            });
        }
    };
};
