import { Router } from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { signToken, requireAuth } from "../middleware/auth.js";

const router = Router();

// Helper to parse JWT payload without verifying signature (for Google GIS credential tokens in demo/dev)
function parseJwtPayload(tokenStr) {
  try {
    const parts = tokenStr.split(".");
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = Buffer.from(base64, "base64").toString("utf8");
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

// POST /api/auth/signup
router.post("/signup", async (req, res, next) => {
  try {
    const { username, email, password, displayName, identityPublicKey } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    if (email) {
      const existingEmail = await User.findOne({ email: email.toLowerCase() });
      if (existingEmail) {
        return res.status(409).json({ error: "Email already registered" });
      }
    }

    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(409).json({ error: "Username already taken" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      username,
      email: email ? email.toLowerCase() : undefined,
      displayName: displayName || username,
      passwordHash,
      identityPublicKey: identityPublicKey || "",
      authProvider: "local",
    });

    const token = signToken(user._id.toString());
    return res.status(201).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        avatar: user.avatar,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "Username or email already taken" });
    }
    next(err);
  }
});

// POST /api/auth/login
router.post("/login", async (req, res, next) => {
  try {
    const { username, email, emailOrUsername, password } = req.body;
    const identifier = emailOrUsername || username || email;
    if (!identifier || !password) {
      return res.status(400).json({ error: "Email/Username and password are required" });
    }

    const user = await User.findOne({
      $or: [
        { username: identifier },
        { email: identifier.toLowerCase() },
      ],
    });

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: "Invalid username/email or password" });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid username/email or password" });
    }

    const token = signToken(user._id.toString());
    return res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        avatar: user.avatar,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/google
router.post("/google", async (req, res, next) => {
  try {
    const { credential, googleId: reqGoogleId, email: reqEmail, name: reqName, picture: reqPicture, identityPublicKey } = req.body;
    let email = reqEmail;
    let name = reqName;
    let picture = reqPicture;
    let googleId = reqGoogleId;

    if (credential) {
      const decoded = parseJwtPayload(credential);
      if (decoded) {
        email = decoded.email || email;
        name = decoded.name || decoded.given_name || name;
        picture = decoded.picture || picture;
        googleId = decoded.sub || googleId;
      }
    }

    if (!email) {
      return res.status(400).json({ error: "Google authentication payload missing email" });
    }

    email = email.toLowerCase();
    let user = await User.findOne({
      $or: [{ googleId }, { email }],
    });

    if (!user) {
      const baseUsername = email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "_");
      let username = baseUsername;
      let count = 1;
      while (await User.findOne({ username })) {
        username = `${baseUsername}_${count++}`;
      }

      user = await User.create({
        username,
        email,
        displayName: name || username,
        googleId: googleId || `g_${Date.now()}`,
        authProvider: "google",
        avatar: picture || "",
        identityPublicKey: identityPublicKey || "",
      });
    } else {
      if (!user.googleId && googleId) {
        user.googleId = googleId;
      }
      if (picture && !user.avatar) {
        user.avatar = picture;
      }
      if (identityPublicKey && !user.identityPublicKey) {
        user.identityPublicKey = identityPublicKey;
      }
      await user.save();
    }

    const token = signToken(user._id.toString());
    return res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        avatar: user.avatar,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select("-passwordHash");
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    return res.json({ user });
  } catch (err) {
    next(err);
  }
});

export default router;
