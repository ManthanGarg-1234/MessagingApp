import { Router } from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { signToken, requireAuth } from "../middleware/auth.js";

const router = Router();

// POST /api/auth/signup
router.post("/signup", async (req, res, next) => {
  try {
    const { username, password, displayName, identityPublicKey } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }

    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(409).json({ error: "username already taken" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      username,
      displayName: displayName || username,
      passwordHash,
      identityPublicKey: identityPublicKey || "",
    });

    const token = signToken(user._id.toString());
    return res.status(201).json({ token, user: { id: user._id, username: user.username } });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "username already taken" });
    }
    next(err);
  }
});

// POST /api/auth/login
router.post("/login", async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }

    const user = await User.findOne({ username });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    const token = signToken(user._id.toString());
    return res.json({ token, user: { id: user._id, username: user.username } });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select("-passwordHash");
    if (!user) {
      return res.status(401).json({ error: "user not found" });
    }
    return res.json({ user });
  } catch (err) {
    next(err);
  }
});

export default router;
