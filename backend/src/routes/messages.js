import { Router } from "express";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// GET /api/conversations
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const conversations = await Conversation.find({ participantIds: req.userId })
      .sort({ lastMessageAt: -1 })
      .lean();
    res.json({ conversations });
  } catch (err) {
    next(err);
  }
});

// GET /api/conversations/:id/messages?before=<cursor>&limit=50
router.get("/:id/messages", requireAuth, async (req, res, next) => {
  try {
    const { before, limit = 50 } = req.query;
    const query = { conversationId: req.params.id };
    if (before) query.createdAt = { $lt: new Date(before) };

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit), 100))
      .lean();

    res.json({ messages: messages.reverse() });
  } catch (err) {
    next(err);
  }
});

// POST /api/conversations/:id/messages
router.post("/:id/messages", requireAuth, async (req, res, next) => {
  const { ciphertext, nonce, clientMsgId, contentType = "text", threadParentId = null } = req.body;
  if (!ciphertext || !nonce || !clientMsgId) {
    return res.status(400).json({ error: "ciphertext, nonce, clientMsgId are required" });
  }

  try {
    const message = await Message.create({
      conversationId: req.params.id,
      senderId: req.userId,
      ciphertext,
      nonce,
      contentType,
      threadParentId,
      clientMsgId,
    });

    await Conversation.findByIdAndUpdate(req.params.id, {
      lastMessageAt: message.createdAt,
      lastMessagePreviewCiphertext: ciphertext,
    });

    res.status(201).json({ message });
  } catch (err) {
    if (err.code === 11000) {
      const existing = await Message.findOne({ conversationId: req.params.id, clientMsgId });
      return res.status(200).json({ message: existing, deduped: true });
    }
    next(err);
  }
});

export default router;
