import "dotenv/config";
import http from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { connectDB } from "./config/db.js";
import { initWebSocketServer } from "./ws/wsServer.js";
import { createRateLimiter } from "./middleware/rateLimiter.js";

import authRoutes from "./routes/auth.js";
import pairingRoutes from "./routes/pairing.js";
import messageRoutes from "./routes/messages.js";
import mediaRoutes from "./routes/media.js";
import userRoutes from "./routes/users.js";
import channelRoutes from "./routes/channels.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

const ALLOWED_ORIGIN = process.env.CLIENT_ORIGIN || "*";
app.use(cors({ origin: ALLOWED_ORIGIN, credentials: true }));
app.use(express.json({ limit: "4mb" }));

// Rate Limiters
const apiLimiter = createRateLimiter({ windowMs: 60000, maxRequests: 120, message: "Too many API requests." });
const authLimiter = createRateLimiter({ windowMs: 60000, maxRequests: 20, message: "Too many auth attempts. Please wait 1 minute." });

app.use("/api/", apiLimiter);
app.use("/api/auth", authLimiter);

// Enhanced Health Check & Operational Metrics Endpoint
app.get("/api/health", (_req, res) => {
  const memoryUsage = process.memoryUsage();
  res.json({
    status: "online",
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    memoryUsageMB: {
      rss: Math.round(memoryUsage.rss / 1024 / 1024),
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
    },
    version: "1.0.0",
    e2eeProtocol: "Curve25519 + TweetNaCl XSalsa20-Poly1305",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/pairing", pairingRoutes);
app.use("/api/conversations", messageRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/users", userRoutes);
app.use("/api/channels", channelRoutes);

// Dynamic Frontend Static Asset Serving (No manual copy-pasting required!)
const frontendDistPath = path.resolve(__dirname, "../../frontend/dist");
if (fs.existsSync(frontendDistPath)) {
  console.log(`[aethersync] Serving frontend static assets dynamically from ${frontendDistPath}`);
  app.use(express.static(frontendDistPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/ws")) {
      return next();
    }
    res.sendFile(path.join(frontendDistPath, "index.html"));
  });
}

app.use((err, _req, res, _next) => {
  console.error("[server] error handler:", err);
  res.status(500).json({ error: err.message || "internal server error" });
});

const server = http.createServer(app);
initWebSocketServer(server);

const PORT = process.env.PORT || 4000;

connectDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`[aethersync] Production backend active on port :${PORT} (WS at /ws)`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err.message);
    process.exit(1);
  });

// Graceful shutdown handling
process.on("SIGTERM", () => {
  console.log("[server] SIGTERM received, shutting down gracefully...");
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log("[server] DB connection closed.");
      process.exit(0);
    });
  });
});
