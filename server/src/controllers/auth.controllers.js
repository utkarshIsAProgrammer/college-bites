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

        const name =
            `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim();
        const profileImage = clerkUser.imageUrl;

        if (!email || !name) {
            return res.status(400).json({
                success: false,
                message: "Required Clerk user information is missing!",
            });
        }

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
                new: true,
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
