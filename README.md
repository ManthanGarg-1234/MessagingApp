# Baatein — E2E-Encrypted Messaging App

A WhatsApp-inspired messaging app with QR/link-based device pairing (no chat rooms),
end-to-end encryption, offline-first PWA client, and resumable large-file transfer.

Stack: React + TypeScript + Webpack (frontend) · Node.js + Express + `ws` (backend) · MongoDB.

---

## 1. Phased Plan

### Phase 0 — MVP (weeks 1–3)
- Auth (signup/login, JWT sessions, bcrypt password hashing).
- QR/link-based device pairing (replaces "rooms" — see §4).
- 1:1 conversations, plaintext-over-TLS messages (encryption stubbed but wired in) stored in MongoDB.
- WebSocket real-time delivery + REST fallback (long-poll) for send/history.
- Basic read receipts (delivered/read flags).
- Minimal React shell (Webpack, TS, no PWA yet).

### Phase 1 — Encryption (weeks 3–5)
- Replace plaintext pipe with E2EE: X25519 key exchange + XSalsa20-Poly1305 (libsodium/tweetnacl),
  keys generated and stored client-side only.
- Server stores ciphertext + metadata only ("blind relay").
- Session key caching per-conversation; rotate on re-pairing or periodically (forward-secrecy groundwork).

### Phase 2 — Media & Large Files (weeks 5–7)
- Chunked, resumable upload (tus-like protocol) to object storage (S3-compatible) via signed URLs.
- Chunk-level encryption; media metadata (thumbnails, mime, size) in Mongo, blobs in object storage.
- Resumable download using HTTP Range requests + client-side reassembly.

### Phase 3 — PWA & Offline (weeks 7–8)
- Service worker: cache-first for app shell, network-first for API, background sync for outbox.
- Web App Manifest, install prompts, offline message queue (IndexedDB outbox), conflict-free resend.

### Phase 4 — Enhancements (weeks 8+)
- Typing indicators, presence (online/last-seen) via WS heartbeats.
- Message threading (parent/child reference), search (Mongo text index or external search),
  chat backups (encrypted export), optional TOTP-based 2FA.
- Sharding/scaling: partition messages by conversationId hash, read replicas, WS fan-out via Redis pub/sub.

---

## 2. High-Level Architecture

```
┌─────────────┐        HTTPS/WSS         ┌───────────────────┐
│  React PWA  │ ───────────────────────▶ │   API Gateway /    │
│  (Webpack)  │ ◀─────────────────────── │   Node.js server   │
│  IndexedDB  │        WebSocket         │  (Express + ws)    │
│  SW cache   │                          └─────────┬──────────┘
└─────────────┘                                    │
      │ E2EE keys stay on device only               │
      ▼                                             ▼
 libsodium/tweetnacl                     ┌────────────────────┐
 (encrypt/decrypt locally)               │   MongoDB (Atlas)   │
                                          │ Users/Conversations │
                                          │ Messages/Pairing    │
                                          │ Media metadata      │
                                          └─────────┬──────────┘
                                                     │
                                          ┌────────────────────┐
                                          │ Object Storage (S3) │
                                          │ chunked media blobs │
                                          └────────────────────┘
              Real-time fan-out: Redis pub/sub (multi-instance WS scaling)
```

Server never sees plaintext message content once Phase 1 lands — it only routes
ciphertext + envelope metadata (sender, recipient, conversationId, timestamps).

---

## 3. Data Models (MongoDB)

### User
```js
{
  _id, username, displayName, passwordHash,
  identityPublicKey,      // long-term X25519 public key (E2EE identity)
  devices: [{ deviceId, publicKey, lastSeen, pushToken }],
  twoFA: { enabled, secretEncrypted },
  presence: { online, lastSeenAt },
  createdAt, updatedAt
}
```

### Conversation (1:1 or "linked" pair — no rooms)
```js
{
  _id, participantIds: [userIdA, userIdB],
  type: "direct",                 // future: "linked-device"
  lastMessageAt, lastMessagePreviewCiphertext,
  sessionKeyFingerprint,          // for key-rotation auditing, not the key itself
  createdAt
}
```

### Message
```js
{
  _id, conversationId, senderId,
  ciphertext,             // base64, encrypted payload (text or media pointer)
  nonce,                  // per-message nonce for XSalsa20-Poly1305
  contentType: "text" | "media" | "system",
  threadParentId: null,   // message threading
  status: "sent" | "delivered" | "read",
  clientMsgId,            // idempotency key for offline resend
  createdAt
}
```
Index: `{ conversationId: 1, createdAt: -1 }`, sharded by `conversationId` hash at scale.

### Media
```js
{
  _id, conversationId, ownerId,
  storageKey,             // S3 object key
  chunks: [{ index, size, etag }],
  totalSize, mimeType, encrypted: true,
  thumbnailCiphertext,
  status: "uploading" | "complete",
  createdAt
}
```

### PairingSession (QR / link-based device linking — replaces "rooms")
```js
{
  _id, code,               // short-lived random token embedded in QR
  initiatorUserId,
  initiatorPublicKey,      // ephemeral pairing key
  status: "pending" | "confirmed" | "expired",
  expiresAt,               // TTL index, e.g. 2 minutes
  confirmedDeviceId,
  createdAt
}
```
TTL index on `expiresAt` so Mongo auto-expires stale pairing codes.

---

## 4. Pairing Mechanism (replaces chat rooms)

Instead of joining a "room", two devices establish a **direct conversation** by pairing:

1. Device A (already logged in) requests a `PairingSession`: server generates a short-lived
   `code` + returns it; client renders it as a QR code (and as a shareable deep link
   `baatein://pair/<code>` for non-camera flows).
2. Device B scans the QR (or opens the link), calls `POST /pairing/:code/confirm` with its
   own identity public key while authenticated.
3. Server validates the code hasn't expired/been used, links the two `userIds` into a new
   `Conversation`, and notifies Device A over WebSocket that pairing succeeded.
4. Both devices now exchange public keys (already exchanged via the pairing payload) and
   derive a shared session key locally — server never sees the shared secret.

This is the "device-to-device pairing" substitute for room-based connection.

---

## 5. API Surface

### REST
```
POST   /api/auth/signup                 { username, password }
POST   /api/auth/login                  { username, password } -> { token }
POST   /api/auth/2fa/verify             { userId, totpCode }
GET    /api/users/me
POST   /api/pairing/init                -> { code, expiresAt }        (Device A)
POST   /api/pairing/:code/confirm       { publicKey }                 (Device B)
GET    /api/pairing/:code/status
GET    /api/conversations
GET    /api/conversations/:id/messages?before=<cursor>&limit=50
POST   /api/conversations/:id/messages  { ciphertext, nonce, clientMsgId }  (long-poll/offline fallback)
POST   /api/media/init                  { conversationId, totalSize, mimeType } -> { uploadId, chunkUrls }
PUT    /api/media/:uploadId/chunk/:idx  (binary chunk, signed URL preferred)
POST   /api/media/:uploadId/complete
GET    /api/media/:id/download          (supports Range requests)
```

### WebSocket channels (single connection, message-type routed)
```
auth            { token }                       client -> server (on connect)
message:send    { conversationId, ciphertext, nonce, clientMsgId }
message:new     { message }                      server -> client (fan-out)
message:ack     { clientMsgId, status: "sent" }
receipt:update  { messageId, status: "delivered"|"read" }
typing:start / typing:stop  { conversationId }
presence:update { userId, online, lastSeenAt }
pairing:confirmed { conversationId, peerUserId }
```
Scaling: each WS server instance subscribes to Redis pub/sub channels keyed by `userId`
so a message sent on instance A reaches a recipient socket held on instance B.

---

## 6. Encryption Approach

- **Primitive**: X25519 (key agreement) + XSalsa20-Poly1305 (authenticated encryption),
  via `libsodium-wrappers` or `tweetnacl` — same family used by Signal-derived protocols.
- **Identity keys**: generated on first login, private key never leaves device
  (stored in IndexedDB, optionally wrapped with a device passphrase/WebAuthn).
- **Key exchange**: during pairing, both devices exchange public keys; each derives a
  shared secret via `nacl.box.before(theirPublicKey, myPrivateKey)`.
- **Per-message nonce**: random 24-byte nonce per message, sent alongside ciphertext.
- **Forward secrecy (Phase 2+ target)**: rotate a per-conversation symmetric "chain key"
  periodically (simplified ratchet) — full Double Ratchet is a stretch goal, documented
  as a follow-up rather than MVP scope.
- **Server role**: blind relay + metadata store only; cannot decrypt message bodies.

Text-form data flow:
```
[Device A: plaintext] --nacl.box(nonce, sharedKey)--> [ciphertext+nonce]
   --HTTPS/WSS--> [Server: stores ciphertext, routes to Device B]
   --HTTPS/WSS--> [Device B: ciphertext+nonce] --nacl.box.open(sharedKey)--> [plaintext]
```

---

## 7. Frontend Skeleton (Webpack + React + TS)

```
frontend/
  webpack.config.js
  tsconfig.json
  public/
    index.html
    manifest.json
    service-worker.js
  src/
    index.tsx
    App.tsx
    crypto/e2ee.ts          <- key gen, encrypt/decrypt helpers
    pairing/QRPairing.tsx   <- QR generation + scan-confirm UI
    ws/wsClient.ts          <- WebSocket client wrapper w/ reconnect
    components/ChatWindow.tsx
    components/MessageList.tsx
    pages/Login.tsx
```

## 8. Security & Compliance Notes
- Store only password **hashes** (bcrypt/argon2), never plaintext.
- Private keys never transmitted; if backed up, encrypt with a user passphrase (PBKDF2/Argon2-derived key) before leaving device.
- Rotate pairing codes (TTL ~2 min) and session tokens (short-lived JWT + refresh token).
- Rate-limit auth and pairing endpoints; log pairing confirmations for audit (who paired with whom, when) without logging key material.
- 2FA: TOTP (RFC 6238) as an additive login step; store TOTP secret encrypted at rest.
- Transport: TLS everywhere (HTTPS/WSS); HSTS; secure cookie flags if cookies are used for refresh tokens.

## 9. Testing & CI
- Unit: Jest for crypto helpers (encrypt/decrypt round-trip, tamper detection), model validation.
- Integration: supertest against Express routes; ws integration tests for message fan-out.
- E2E: Playwright — signup, pairing via two browser contexts, send/receive, offline resend.
- CI (GitHub Actions): lint → typecheck → unit → integration → build → (optional) Playwright on PR.

## 10. Run Locally

Backend:
```
cd backend
cp .env.example .env      # set MONGO_URI, JWT_SECRET
npm install
npm run dev                # nodemon, http://localhost:4000
```

Frontend:
```
cd frontend
npm install
npm run start               # webpack-dev-server, http://localhost:3000
npm run build                # production bundle -> dist/
```

PWA: service worker + manifest are only activated in the production build
(`npm run build` then serve `dist/` over HTTPS or localhost). See `public/service-worker.js`
and `public/manifest.json`.
