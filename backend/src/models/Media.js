import mongoose from "mongoose";

const chunkSchema = new mongoose.Schema(
  {
    index: { type: Number, required: true },
    size: { type: Number, required: true },
    etag: String,
  },
  { _id: false }
);

const mediaSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    storageKey: { type: String, required: true }, // S3 object key
    chunks: [chunkSchema],
    totalSize: Number,
    mimeType: String,
    encrypted: { type: Boolean, default: true },
    thumbnailCiphertext: String,
    status: { type: String, enum: ["uploading", "complete"], default: "uploading" },
  },
  { timestamps: true }
);

export default mongoose.model("Media", mediaSchema);
