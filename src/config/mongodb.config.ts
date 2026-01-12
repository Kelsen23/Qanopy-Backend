import mongoose from "mongoose";

const connectMongoDB = async (mongoUrl: string) => {
  try {
    await mongoose.connect(mongoUrl);
    console.log("Successfully connected to MongoDB 🍃");
  } catch (error) {
    console.error("Couldn't connect to MongoDB ❌:", error);
    process.exit(1);
  }
};

export default connectMongoDB;
