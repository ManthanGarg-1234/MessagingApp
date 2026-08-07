import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
import { initWebSocketServer } from "./ws/wsServer.js";

import authRoutes from "./routes/auth.js";
import pairingRoutes from "./routes/pairing.js";
import messageRoutes from "./routes/messages.js";
import mediaRoutes from "./routes/media.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/pairing", pairingRoutes);
app.use("/api/conversations", messageRoutes);
app.use("/api/media", mediaRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "internal server error" });
});

const server = http.createServer(app);
initWebSocketServer(server);

const PORT = process.env.PORT || 4000;

connectDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`[baatein] backend listening on :${PORT} (WS at /ws)`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err.message);
    process.exit(1);
  });
