import mongoose from "mongoose";

// Mongo tells us when the cluster is reachable again, so we can answer
// "why is every write failing?" without digging through stack traces.
export const isDBReady = () => mongoose.connection.readyState === 1;

export const connectDB = async () => {
    mongoose.connection.on("disconnected", () => {
        console.warn("MONGODB disconnected — retrying in the background…");
    });

    mongoose.connection.on("reconnected", () => {
        console.log("MONGODB reconnected successfully!");
    });

    mongoose.connection.on("error", (err) => {
        console.error("MONGODB connection error:", err.message);
    });

    try {
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            // fail fast with a readable error instead of hanging for 30s
            serverSelectionTimeoutMS: 10_000,
            // some home/ISP resolvers choke resolving both A and AAAA records
            // for Atlas shards (EAI_AGAIN) — resolving IPv4 only is the fix
            family: 4,
            maxPoolSize: 10,
        });
        console.log(`MONGODB connected successfully!`, conn.connection.host);
    } catch (err) {
        console.error(`Error connecting MONGODB! ${err.message}`);
        process.exit(1);
    }
};
