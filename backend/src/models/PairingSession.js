import mongoose from "mongoose";

const pairingSessionSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    initiatorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    initiatorPublicKey: { type: String, required: true },
    status: { type: String, enum: ["pending", "confirmed", "expired"], default: "pending" },
    confirmedDeviceId: String,
    confirmedUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation" },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// TTL index: Mongo auto-deletes the document once expiresAt passes
pairingSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("PairingSession", pairingSessionSchema);
