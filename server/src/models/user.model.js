import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        clerkId: {
            type: String,
            required: true,
            unique: true,
        },

        name: {
            type: String,
            required: true,
            trim: true,
            minLength: 2,
            maxLength: 50,
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },

        role: {
            type: String,
            enum: ["admin", "customer", "staff"],
            default: "customer",
        },

        phone: {
            type: String,
            trim: true,
            maxLength: 10,
        },

        profileImage: {
            type: String,
        },
    },
    { timestamps: true },
);

const User = mongoose.model("User", userSchema);

export default User;
