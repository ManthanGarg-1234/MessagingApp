import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";

// userId -> Set<WebSocket>  (a user may have multiple devices/tabs connected)
const userSockets = new Map();

export function broadcastToUser(userId, payload) {
  const sockets = userSockets.get(userId.toString());
  if (!sockets) return;
  const data = JSON.stringify(payload);
  for (const socket of sockets) {
    if (socket.readyState === socket.OPEN) socket.send(data);
  }
}

export function initWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (socket) => {
    let userId = null;

    socket.on("error", (err) => {
      if (err?.code !== "WS_ERR_INVALID_CLOSE_CODE") {
        console.error("[ws] socket error:", err.message);
      }
    });

    socket.on("message", async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return socket.send(
          JSON.stringify({ type: "error", error: "invalid JSON" }),
        );
      }

      switch (msg.type) {
        case "auth": {
          try {
            const secret = process.env.JWT_SECRET || "baatein_secure_jwt_secret_key_2026";
            const payload = jwt.verify(msg.token, secret);
            userId = payload.sub;
            if (!userSockets.has(userId)) userSockets.set(userId, new Set());
            userSockets.get(userId).add(socket);
            socket.send(JSON.stringify({ type: "auth:ok", userId }));

            // Broadcast online status to all connected users
            const presencePayload = { type: "presence:update", userId, online: true };
            for (const [id, sockets] of userSockets.entries()) {
              if (id !== userId) {
                for (const s of sockets) {
                  if (s.readyState === s.OPEN) s.send(JSON.stringify(presencePayload));
                }
              }
            }
          } catch {
            socket.send(JSON.stringify({ type: "auth:error" }));
            socket.close();
          }
          break;
        }

        case "message:send": {
          if (!userId)
            return socket.send(
              JSON.stringify({ type: "error", error: "not authenticated" }),
            );
          const {
            conversationId,
            ciphertext,
            nonce,
            clientMsgId,
            contentType = "text",
            replyToSnippet = "",
          } = msg;

          let message;
          try {
            message = await Message.create({
              conversationId,
              senderId: userId,
              ciphertext,
              nonce,
              contentType,
              clientMsgId,
              replyToSnippet,
            });
          } catch (err) {
            if (err.code === 11000) {
              message = await Message.findOne({ conversationId, clientMsgId });
            } else {
              return socket.send(
                JSON.stringify({ type: "error", error: "send failed" }),
              );
            }
          }

          await Conversation.findByIdAndUpdate(conversationId, {
            lastMessageAt: message.createdAt,
            lastMessagePreviewCiphertext: ciphertext,
          });

          // Ack the sender (so it can clear its offline outbox)
          socket.send(
            JSON.stringify({
              type: "message:ack",
              clientMsgId,
              status: "sent",
              messageId: message._id,
            }),
          );

          // Fan out to the other participant(s)
          const convo = await Conversation.findById(conversationId).lean();
          for (const participantId of convo.participantIds) {
            if (participantId.toString() !== userId) {
              broadcastToUser(participantId.toString(), {
                type: "message:new",
                message,
              });
            }
          }
          break;
        }

        case "receipt:update": {
          if (!userId) return;
          const { messageId, status } = msg;
          const message = await Message.findById(messageId);
          if (!message) break;

          const hierarchy = { sent: 1, delivered: 2, read: 3 };
          const currentLevel = hierarchy[message.status] || 0;
          const newLevel = hierarchy[status] || 0;

          if (newLevel > currentLevel) {
            message.status = status;
            await message.save();

            broadcastToUser(message.senderId.toString(), {
              type: "receipt:update",
              messageId,
              status,
            });
          }
          break;
        }

        case "message:reaction": {
          if (!userId) return;
          const { messageId, emoji, conversationId } = msg;
          const message = await Message.findById(messageId);
          if (!message) break;

          const existingIdx = (message.reactions || []).findIndex(
            (r) => r.userId?.toString() === userId && r.emoji === emoji
          );

          if (existingIdx >= 0) {
            message.reactions.splice(existingIdx, 1);
          } else {
            if (!message.reactions) message.reactions = [];
            message.reactions.push({ userId, emoji });
          }
          await message.save();

          const convo = await Conversation.findById(conversationId || message.conversationId).lean();
          if (convo) {
            for (const participantId of convo.participantIds) {
              broadcastToUser(participantId.toString(), {
                type: "message:reaction",
                messageId,
                conversationId: convo._id,
                reactions: message.reactions,
              });
            }
          }
          break;
        }

        case "message:delete": {
          if (!userId) return;
          const { messageId, conversationId, mode } = msg;
          const message = await Message.findById(messageId);
          if (!message) break;

          if (mode === "everyone") {
            if (message.senderId.toString() === userId) {
              message.deletedForEveryone = true;
              await message.save();

              const convo = await Conversation.findById(conversationId || message.conversationId).lean();
              if (convo) {
                for (const participantId of convo.participantIds) {
                  broadcastToUser(participantId.toString(), {
                    type: "message:delete",
                    messageId,
                    conversationId: convo._id,
                    mode: "everyone",
                  });
                }
              }
            }
          } else if (mode === "me") {
            if (!message.deletedForUsers) message.deletedForUsers = [];
            if (!message.deletedForUsers.includes(userId)) {
              message.deletedForUsers.push(userId);
              await message.save();
            }
            socket.send(
              JSON.stringify({
                type: "message:delete",
                messageId,
                conversationId: message.conversationId,
                mode: "me",
              })
            );
          }
          break;
        }

        case "presence:query": {
          if (!userId) return;
          const { targetUserId } = msg;
          const isOnline = userSockets.has(targetUserId?.toString()) && userSockets.get(targetUserId.toString()).size > 0;
          socket.send(
            JSON.stringify({
              type: "presence:update",
              userId: targetUserId,
              online: isOnline,
              lastSeenAt: isOnline ? new Date() : new Date(),
            })
          );
          break;
        }

        case "typing:start":
        case "typing:stop": {
          if (!userId) return;
          const { conversationId } = msg;
          const convo = await Conversation.findById(conversationId).lean();
          if (!convo) return;
          for (const participantId of convo.participantIds) {
            if (participantId.toString() !== userId) {
              broadcastToUser(participantId.toString(), {
                type: msg.type,
                conversationId,
                userId,
              });
            }
          }
          break;
        }

        case "call:invite":
        case "call:accept":
        case "call:reject":
        case "call:end": {
          if (!userId) return;
          const { targetUserId, isVideo, peerName, signalData, callId } = msg;
          if (targetUserId) {
            broadcastToUser(targetUserId.toString(), {
              type: msg.type,
              fromUserId: userId,
              isVideo,
              peerName,
              signalData,
              callId,
            });
          }
          break;
        }

        case "friend:request":
        case "friend:response": {
          if (!userId) return;
          const { targetUserId } = msg;
          if (targetUserId) {
            broadcastToUser(targetUserId.toString(), {
              type: msg.type,
              fromUserId: userId,
            });
          }
          break;
        }

        case "status:update": {
          if (!userId) return;
          const { customStatus } = msg;
          for (const [id, sockets] of userSockets.entries()) {
            if (id !== userId) {
              for (const s of sockets) {
                if (s.readyState === s.OPEN) {
                  s.send(JSON.stringify({ type: "status:update", userId, customStatus }));
                }
              }
            }
          }
          break;
        }

        default:
          socket.send(
            JSON.stringify({
              type: "error",
              error: `unknown message type: ${msg.type}`,
            }),
          );
      }
    });

    socket.on("close", () => {
      if (userId && userSockets.has(userId)) {
        userSockets.get(userId).delete(socket);
        if (userSockets.get(userId).size === 0) {
          userSockets.delete(userId);
          // Broadcast offline status
          const offlinePayload = { type: "presence:update", userId, online: false, lastSeenAt: new Date() };
          for (const [, sockets] of userSockets.entries()) {
            for (const s of sockets) {
              if (s.readyState === s.OPEN) s.send(JSON.stringify(offlinePayload));
            }
          }
        }
      }
    });
  });

  return wss;
}

// NOTE on scaling: to run multiple WS server instances behind a load balancer,
// swap the in-memory `userSockets` map for a Redis-backed registry + pub/sub so
// broadcastToUser() can reach a socket held on a different instance.
