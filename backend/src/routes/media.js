import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express, { Router } from "express";
import { nanoid } from "nanoid";
import Media from "../models/Media.js";
import { requireAuth } from "../middleware/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, "../../uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const router = Router();
const rawBody = express.raw({ type: "*/*", limit: "100mb" });

// In-memory buffer store for dev mode media chunks: uploadId -> Map<chunkIndex, Buffer>
const chunkStorage = new Map();

// POST /api/media/init
router.post("/init", requireAuth, async (req, res, next) => {
  try {
    const { conversationId, totalSize, mimeType, chunkSize = 512 * 1024 } = req.body;
    const storageKey = `media/${req.userId}/${nanoid(16)}`;
    const totalChunks = Math.max(1, Math.ceil(totalSize / chunkSize));

    const media = await Media.create({
      conversationId,
      ownerId: req.userId,
      storageKey,
      totalSize,
      mimeType,
      status: "uploading",
    });

    chunkStorage.set(media._id.toString(), new Map());

    const chunkUrls = Array.from({ length: totalChunks }, (_, i) => ({
      index: i,
      url: `/api/media/${media._id}/chunk/${i}`,
    }));

    res.status(201).json({ uploadId: media._id, storageKey, chunkUrls });
  } catch (err) {
    next(err);
  }
});

// PUT /api/media/:uploadId/chunk/:idx
router.put("/:uploadId/chunk/:idx", requireAuth, rawBody, async (req, res, next) => {
  try {
    const media = await Media.findById(req.params.uploadId);
    if (!media) return res.status(404).json({ error: "upload not found" });

    const index = Number(req.params.idx);
    const chunkBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);

    let mediaStore = chunkStorage.get(media._id.toString());
    if (!mediaStore) {
      mediaStore = new Map();
      chunkStorage.set(media._id.toString(), mediaStore);
    }
    mediaStore.set(index, chunkBuffer);

    // Save to disk for persistence across server restarts
    const chunkPath = path.join(UPLOADS_DIR, `${media._id.toString()}_${index}.bin`);
    fs.writeFileSync(chunkPath, chunkBuffer);

    const existingIdx = media.chunks.findIndex((c) => c.index === index);
    if (existingIdx >= 0) {
      media.chunks[existingIdx].size = chunkBuffer.length;
    } else {
      media.chunks.push({ index, size: chunkBuffer.length, etag: `${Date.now()}` });
    }
    await media.save();

    res.json({ received: index, size: chunkBuffer.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/media/:uploadId/complete
router.post("/:uploadId/complete", requireAuth, async (req, res, next) => {
  try {
    const media = await Media.findByIdAndUpdate(
      req.params.uploadId,
      { status: "complete" },
      { new: true }
    );
    res.json({ media });
  } catch (err) {
    next(err);
  }
});

// GET /api/media/:id/download (streams full combined binary buffer)
router.get("/:id/download", requireAuth, async (req, res, next) => {
  try {
    const media = await Media.findById(req.params.id);
    if (!media) return res.status(404).json({ error: "media not found" });

    let mediaStore = chunkStorage.get(media._id.toString());
    const chunks = [];

    if (mediaStore && mediaStore.size > 0) {
      const sortedIndexes = Array.from(mediaStore.keys()).sort((a, b) => a - b);
      for (const idx of sortedIndexes) {
        chunks.push(mediaStore.get(idx));
      }
    } else {
      // Fallback: Read chunks from disk
      const totalChunks = Math.max(1, media.chunks.length);
      for (let i = 0; i < totalChunks; i++) {
        const chunkPath = path.join(UPLOADS_DIR, `${media._id.toString()}_${i}.bin`);
        if (fs.existsSync(chunkPath)) {
          chunks.push(fs.readFileSync(chunkPath));
        }
      }
    }

    if (chunks.length === 0) {
      return res.status(404).json({ error: "media chunks not found on server" });
    }

    const fullBuffer = Buffer.concat(chunks);

    res.setHeader("Content-Type", media.mimeType || "application/octet-stream");
    res.setHeader("Content-Length", fullBuffer.length);
    res.setHeader("Content-Disposition", "inline");
    res.send(fullBuffer);
  } catch (err) {
    next(err);
  }
});

export default router;
