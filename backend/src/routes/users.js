import { Router } from "express";
import User from "../models/User.js";
import Conversation from "../models/Conversation.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// GET /api/users/search?q=query
router.get("/search", requireAuth, async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== "string" || q.trim() === "") {
      return res.json({ users: [] });
    }

    const searchRegex = new RegExp(q.trim(), "i");
    const currentUser = await User.findById(req.userId).lean();

    const users = await User.find({
      _id: { $ne: req.userId },
      $or: [
        { username: searchRegex },
        { displayName: searchRegex },
        { email: searchRegex },
        { interests: searchRegex },
      ],
    })
      .select("username displayName email avatar bio customStatus presence interests friends friendRequests")
      .limit(20)
      .lean();

    const formatted = users.map((u) => {
      const isFriend = (currentUser.friends || []).some(
        (f) => f.userId?.toString() === u._id.toString()
      );
      const pendingIncoming = (currentUser.friendRequests || []).find(
        (fr) => fr.fromUserId?.toString() === u._id.toString() && fr.status === "pending"
      );
      const pendingOutgoing = (u.friendRequests || []).find(
        (fr) => fr.fromUserId?.toString() === req.userId.toString() && fr.status === "pending"
      );

      let connectionState = "none";
      if (isFriend) connectionState = "friends";
      else if (pendingIncoming) connectionState = "incoming_request";
      else if (pendingOutgoing) connectionState = "outgoing_request";

      return {
        id: u._id,
        username: u.username,
        displayName: u.displayName,
        email: u.email || "",
        avatar: u.avatar || "",
        bio: u.bio || "",
        customStatus: u.customStatus || "Online",
        presence: u.presence || { online: false },
        interests: u.interests || [],
        connectionState,
      };
    });

    res.json({ users: formatted });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/contacts
router.get("/contacts", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId)
      .populate("friends.userId", "username displayName email avatar bio customStatus presence interests identityPublicKey")
      .populate("friendRequests.fromUserId", "username displayName email avatar bio customStatus presence interests identityPublicKey")
      .lean();

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const friends = (user.friends || [])
      .filter((f) => f.userId)
      .map((f) => ({
        id: f.userId._id,
        username: f.userId.username,
        displayName: f.userId.displayName,
        email: f.userId.email || "",
        avatar: f.userId.avatar || "",
        bio: f.userId.bio || "",
        customStatus: f.userId.customStatus || "Online",
        presence: f.userId.presence || { online: false },
        interests: f.userId.interests || [],
        identityPublicKey: f.userId.identityPublicKey || "",
        addedAt: f.addedAt,
      }));

    const pendingRequests = (user.friendRequests || [])
      .filter((fr) => fr.status === "pending" && fr.fromUserId)
      .map((fr) => ({
        requestId: fr._id,
        fromUser: {
          id: fr.fromUserId._id,
          username: fr.fromUserId.username,
          displayName: fr.fromUserId.displayName,
          email: fr.fromUserId.email || "",
          avatar: fr.fromUserId.avatar || "",
          bio: fr.fromUserId.bio || "",
          customStatus: fr.fromUserId.customStatus || "Online",
          interests: fr.fromUserId.interests || [],
        },
        createdAt: fr.createdAt,
      }));

    res.json({ friends, pendingRequests });
  } catch (err) {
    next(err);
  }
});

// POST /api/users/friend-request
router.post("/friend-request", requireAuth, async (req, res, next) => {
  try {
    const { targetUserId } = req.body;
    if (!targetUserId) {
      return res.status(400).json({ error: "targetUserId is required" });
    }

    if (targetUserId === req.userId) {
      return res.status(400).json({ error: "Cannot send friend request to yourself" });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: "Target user not found" });
    }

    const alreadyFriends = targetUser.friends.some(
      (f) => f.userId?.toString() === req.userId
    );
    if (alreadyFriends) {
      return res.status(400).json({ error: "Already friends" });
    }

    const existingReq = targetUser.friendRequests.find(
      (fr) => fr.fromUserId?.toString() === req.userId && fr.status === "pending"
    );

    if (existingReq) {
      return res.status(400).json({ error: "Friend request already sent" });
    }

    targetUser.friendRequests.push({
      fromUserId: req.userId,
      status: "pending",
    });
    await targetUser.save();

    res.json({ ok: true, message: "Friend request sent!" });
  } catch (err) {
    next(err);
  }
});

// POST /api/users/friend-response
router.post("/friend-response", requireAuth, async (req, res, next) => {
  try {
    const { fromUserId, action } = req.body; // action: 'accept' | 'decline'
    if (!fromUserId || !action) {
      return res.status(400).json({ error: "fromUserId and action are required" });
    }

    const currentUser = await User.findById(req.userId);
    const fromUser = await User.findById(fromUserId);

    if (!currentUser || !fromUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const requestIndex = currentUser.friendRequests.findIndex(
      (fr) => fr.fromUserId?.toString() === fromUserId && fr.status === "pending"
    );

    if (requestIndex === -1) {
      return res.status(400).json({ error: "No pending friend request found from this user" });
    }

    if (action === "accept") {
      currentUser.friendRequests[requestIndex].status = "accepted";
      
      if (!currentUser.friends.some((f) => f.userId?.toString() === fromUserId)) {
        currentUser.friends.push({ userId: fromUserId });
      }

      if (!fromUser.friends.some((f) => f.userId?.toString() === req.userId)) {
        fromUser.friends.push({ userId: req.userId });
        await fromUser.save();
      }

      await currentUser.save();
      return res.json({ ok: true, status: "accepted" });
    } else {
      currentUser.friendRequests[requestIndex].status = "declined";
      await currentUser.save();
      return res.json({ ok: true, status: "declined" });
    }
  } catch (err) {
    next(err);
  }
});

// POST /api/users/direct-chat
router.post("/direct-chat", requireAuth, async (req, res, next) => {
  try {
    const { targetUserId } = req.body;
    if (!targetUserId) {
      return res.status(400).json({ error: "targetUserId is required" });
    }

    let conversation = await Conversation.findOne({
      type: "direct",
      participantIds: { $all: [req.userId, targetUserId], $size: 2 },
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participantIds: [req.userId, targetUserId],
        type: "direct",
      });
    }

    const targetUser = await User.findById(targetUserId).select(
      "username displayName email avatar bio customStatus identityPublicKey"
    );

    res.json({
      conversationId: conversation._id,
      peer: targetUser,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/profile
router.put("/profile", requireAuth, async (req, res, next) => {
  try {
    const { displayName, bio, customStatus, avatar, interests } = req.body;
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (displayName !== undefined) user.displayName = displayName;
    if (bio !== undefined) user.bio = bio;
    if (customStatus !== undefined) user.customStatus = customStatus;
    if (avatar !== undefined) user.avatar = avatar;
    if (Array.isArray(interests)) user.interests = interests;

    await user.save();

    res.json({
      ok: true,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        avatar: user.avatar,
        bio: user.bio,
        customStatus: user.customStatus,
        interests: user.interests,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
