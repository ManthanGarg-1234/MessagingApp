import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ciphertext: { type: String, required: true }, // base64
    nonce: { type: String, required: true }, // base64
    contentType: { type: String, enum: ["text", "media", "system"], default: "text" },
    threadParentId: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
    replyToSnippet: { type: String, default: "" },
    status: { type: String, enum: ["sent", "delivered", "read"], default: "sent" },
    clientMsgId: { type: String, required: true }, // idempotency key for offline resend
    reactions: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        emoji: { type: String, required: true },
      },
    ],
    deletedForEveryone: { type: Boolean, default: false },
    deletedForUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

messageSchema.index({ conversationId: 1, createdAt: -1 });
// Idempotency: a client should never create two persisted messages for one clientMsgId
messageSchema.index({ conversationId: 1, clientMsgId: 1 }, { unique: true });

export default mongoose.model("Message", messageSchema);
