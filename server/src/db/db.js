import mongoose from "mongoose";

export const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MONGODB connected successfully!`, conn.connection.host);
    } catch (err) {
        console.log(`Error connecting MONGODB! ${err}`);
        process.exit(1);
    }
};
