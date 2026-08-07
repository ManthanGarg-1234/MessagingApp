import mongoose from "mongoose";

let memoryServer;

async function dropLegacyUserIndexes() {
  const { default: User } = await import("../models/User.js");

  try {
    const indexes = await User.collection.indexes();
    const legacyIndex = indexes.find((index) => index.name === "email_1");

    if (legacyIndex) {
      await User.collection.dropIndex("email_1");
      console.log("[db] dropped legacy users.email_1 index");
    }
  } catch (error) {
    if (error.codeName !== "NamespaceNotFound" && error.code !== 26) {
      console.warn("[db] skipped legacy index cleanup:", error.message);
    }
  }
}

async function connectWithMemoryServer() {
  const { MongoMemoryServer } = await import("mongodb-memory-server");
  memoryServer = await MongoMemoryServer.create();
  const memoryUri = memoryServer.getUri("baatein");
  await mongoose.connect(memoryUri);
  console.log(`[db] connected -> ${memoryUri} (memory)`);
  await dropLegacyUserIndexes();
}

export async function connectDB() {
  const uri = process.env.MONGO_URI || "mongodb://localhost:27017/baatein";
  mongoose.set("strictQuery", true);

  try {
    await mongoose.connect(uri);
    console.log(`[db] connected -> ${uri}`);
    await dropLegacyUserIndexes();
  } catch (error) {
    console.warn(
      `[db] Mongo unavailable at ${uri}, starting in-memory fallback`,
    );
    await connectWithMemoryServer();
  }
}
