import { clerkClient, getAuth } from "@clerk/express";

import User from "../models/user.model.js";

export const authenticate = async (req, res) => {
    try {
        const { isAuthenticated, userId } = getAuth(req);

        if (!isAuthenticated) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized!",
            });
        }

        const clerkUser = await clerkClient.users.getUser(userId);

        res.json({
            success: true,
            message: "Authenticated successfully!",
            userId,
            clerkUser,
        });
    } catch (err) {
        console.log(`Auth error: ${err}`);

        res.status(500).json({
            success: false,
            message: "Authentication failed!",
        });
    }
};

export const syncUser = async (req, res) => {
    try {
        const { isAuthenticated, userId } = getAuth(req);
        if (!isAuthenticated) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized!",
            });
        }

        const clerkUser = await clerkClient.users.getUser(userId);
        const email = clerkUser.emailAddresses[0]?.emailAddress;

        // Clerk allows nameless accounts (email-OTP signups skip the name
        // field), so derive a display name instead of rejecting the sync —
        // an unsynced user would 404 on every order/menu endpoint afterwards.
        const derivedName =
            `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim() ||
            (email ? email.split("@")[0] : "");

        if (!email || !derivedName) {
            return res.status(400).json({
                success: false,
                message: "Required Clerk user information is missing!",
            });
        }

        const name = derivedName.slice(0, 50); // user.model caps name at 50
        const profileImage = clerkUser.imageUrl;

        const user = await User.findOneAndUpdate(
            {
                clerkId: userId,
            },
            {
                clerkId: userId,
                name,
                email,
                profileImage,
            },
            {
                returnDocument: "after",
                upsert: true,
            },
        );

        res.status(200).json({
            success: true,
            message: "User synced successfully!",
            user,
        });
    } catch (err) {
        console.log(`User sync error: ${err}`);

        res.status(500).json({
            success: false,
            message: "Failed to sync user!",
            error: err.message,
        });
    }
};
