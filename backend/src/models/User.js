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
    displayName: { type: String, required: true },
    passwordHash: { type: String, required: true },
    identityPublicKey: { type: String }, // long-term E2EE public key, base64
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
