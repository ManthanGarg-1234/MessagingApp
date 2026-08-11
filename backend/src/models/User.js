import mongoose from "mongoose";

const deviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true },
    publicKey: { type: String, required: true }, // X25519 public key, base64
    lastSeen: { type: Date, default: Date.now },
    pushToken: String,
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, index: true },
    email: { type: String, lowercase: true, trim: true, sparse: true, index: true },
    displayName: { type: String, required: true },
    passwordHash: { type: String }, // Optional for OAuth users
    authProvider: { type: String, enum: ["local", "google"], default: "local" },
    googleId: { type: String, sparse: true, index: true },
    identityPublicKey: { type: String }, // long-term E2EE public key, base64
    avatar: { type: String, default: "" },
    bio: { type: String, default: "Hey there! I am using Baatein." },
    customStatus: { type: String, default: "Online" },
    interests: [{ type: String }],
    friends: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        addedAt: { type: Date, default: Date.now },
      },
    ],
    friendRequests: [
      {
        fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        status: { type: String, enum: ["pending", "accepted", "declined"], default: "pending" },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    devices: [deviceSchema],
    twoFA: {
      enabled: { type: Boolean, default: false },
      secretEncrypted: String,
    },
    presence: {
      online: { type: Boolean, default: false },
      lastSeenAt: Date,
    },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
