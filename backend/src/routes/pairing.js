import { Router } from "express";
import { nanoid } from "nanoid";
import PairingSession from "../models/PairingSession.js";
import Conversation from "../models/Conversation.js";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { broadcastToUser } from "../ws/wsServer.js";

const router = Router();
const TTL_SECONDS = Number(process.env.PAIRING_TTL_SECONDS || 120);

// POST /api/pairing/init
router.post("/init", requireAuth, async (req, res, next) => {
  try {
    const { publicKey } = req.body;
    if (!publicKey) return res.status(400).json({ error: "publicKey is required" });

    const code = nanoid(24);
    const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);

    await PairingSession.create({
      code,
      initiatorUserId: req.userId,
      initiatorPublicKey: publicKey,
      status: "pending",
      expiresAt,
    });

    res.status(201).json({ code, expiresAt, deepLink: `baatein://pair/${code}` });
  } catch (err) {
    next(err);
  }
});

// POST /api/pairing/:code/confirm
router.post("/:code/confirm", requireAuth, async (req, res, next) => {
  try {
    const { publicKey } = req.body;
    const session = await PairingSession.findOne({ code: req.params.code });

    if (!session) return res.status(404).json({ error: "pairing code not found or expired" });
    if (session.status !== "pending") return res.status(409).json({ error: "pairing already used" });
    if (session.initiatorUserId.toString() === req.userId) {
      return res.status(400).json({ error: "cannot pair with yourself" });
    }

    const conversation = await Conversation.create({
      participantIds: [session.initiatorUserId, req.userId],
      type: "direct",
    });

    session.status = "confirmed";
    session.confirmedUserId = req.userId;
    session.conversationId = conversation._id;
    await session.save();

    // Broadcast to Device A
    broadcastToUser(session.initiatorUserId.toString(), {
      type: "pairing:confirmed",
      conversationId: conversation._id,
      peerUserId: req.userId,
      peerPublicKey: publicKey,
    });

    res.json({
      conversationId: conversation._id,
      peerUserId: session.initiatorUserId,
      peerPublicKey: session.initiatorPublicKey,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/pairing/:code/status
router.get("/:code/status", requireAuth, async (req, res, next) => {
  try {
    const session = await PairingSession.findOne({ code: req.params.code });
    if (!session) return res.status(404).json({ error: "not found or expired" });

    let peerPublicKey = null;
    if (session.confirmedUserId) {
      const confirmedUser = await User.findById(session.confirmedUserId);
      peerPublicKey = confirmedUser?.identityPublicKey || null;
    }

    res.json({
      status: session.status,
      conversationId: session.conversationId || null,
      peerUserId: session.confirmedUserId || null,
      peerPublicKey,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
