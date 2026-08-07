import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    participantIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],
    type: { type: String, enum: ["direct"], default: "direct" },
    lastMessageAt: Date,
    lastMessagePreviewCiphertext: String,
    sessionKeyFingerprint: String, // for audit/rotation tracking only, never the key itself
  },
  { timestamps: true }
);

conversationSchema.index({ participantIds: 1 });

export default mongoose.model("Conversation", conversationSchema);
