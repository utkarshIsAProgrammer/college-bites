import express from "express";
import "dotenv/config";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";

import { connectDB } from "./db/db.js";
import { authRoutes } from "./routes/auth.routes.js";
import { menuRoutes } from "./routes/menu.routes.js";

const app = express();
const port = process.env.PORT;

app.use(
    cors({
        origin: process.env.CLIENT_URL || "http://localhost:5173",
    }),
);
app.use(express.json());
app.use(clerkMiddleware());

app.use("/api/auth", authRoutes);
app.use("/api/menu", menuRoutes);

connectDB().then(() => {
    app.listen(port, () => {
        console.log(`Server is running on PORT: ${port}`);
    });
});
