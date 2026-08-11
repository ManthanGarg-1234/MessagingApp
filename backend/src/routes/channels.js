import { Router } from "express";
import Channel from "../models/Channel.js";
import Message from "../models/Message.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Default public channels seed list if DB is fresh
const SEED_CHANNELS = [
  { name: "General Lounge 💬", description: "Open conversation and greetings with everyone", topic: "General", icon: "💬" },
  { name: "Tech & Code 💻", description: "Discuss web dev, AI, algorithms, and tech stacks", topic: "Technology", icon: "💻" },
  { name: "Music & Chill 🎵", description: "Share your favorite songs, playlists, and jams", topic: "Music", icon: "🎵" },
  { name: "Gaming Hub 🎮", description: "Esports, game recommendations, and squad setups", topic: "Gaming", icon: "🎮" },
];

// GET /api/channels
router.get("/", requireAuth, async (req, res, next) => {
  try {
    let channels = await Channel.find().sort({ createdAt: 1 }).lean();

    if (channels.length === 0) {
      channels = await Channel.insertMany(
        SEED_CHANNELS.map((c) => ({ ...c, createdBy: req.userId, members: [req.userId] }))
      );
    }

    res.json({ channels });
  } catch (err) {
    next(err);
  }
});

// POST /api/channels
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { name, description, topic, icon } = req.body;
    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "Channel name is required" });
    }

    const channel = await Channel.create({
      name: name.trim(),
      description: description || "",
      topic: topic || "General",
      icon: icon || "🌐",
      createdBy: req.userId,
      members: [req.userId],
    });

    res.status(201).json({ channel });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "Channel name already exists" });
    }
    next(err);
  }
});

// POST /api/channels/:id/join
router.post("/:id/join", requireAuth, async (req, res, next) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) {
      return res.status(404).json({ error: "Channel not found" });
    }

    if (!channel.members.includes(req.userId)) {
      channel.members.push(req.userId);
      await channel.save();
    }

    res.json({ channel });
  } catch (err) {
    next(err);
  }
});

export default router;
