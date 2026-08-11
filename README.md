# ⚡ AetherSync — Encrypted Communications & Social Nexus

[![Tech Stack](https://img.shields.io/badge/Stack-React%2018%20%7C%20TypeScript%205%20%7C%20Node.js%20%7C%20MongoDB%20%7C%20WebSockets-blue.svg)](file:///c:/Users/hp/Downloads/baatein/baatein)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](file:///c:/Users/hp/Downloads/baatein/baatein)
[![Security](https://img.shields.io/badge/Security-Curve25519%20%2B%20TweetNaCl-purple.svg)](file:///c:/Users/hp/Downloads/baatein/baatein)
[![Zero Copy Workflow](https://img.shields.io/badge/Monorepo-Single%20Command%20Execution-brightgreen.svg)](file:///c:/Users/hp/Downloads/baatein/baatein)

**AetherSync** is an enterprise-grade communications platform combining **zero-knowledge End-to-End Encryption (E2EE)**, a **5-mode device connection suite** (Ultrasonic Sound-Wave Chirp, Wi-Fi Subnet Discovery, QR Code, 6-Digit Link Code, NFC Tap), WebRTC calling, and Google Mail OAuth.

---

## ⚡ Zero-Copy Single-Command Execution

No manual build steps or file copy-pasting required! Simply run a single command at the project root:

```bash
npm start
```

This concurrently launches the backend API, WebSocket server, and frontend development server with live hot reloading.

---

## 🌟 Key Highlights & Feature Suite

### 1. 🔗 5-Mode Connection Suite
- 🔊 **Sound-Wave / Ultrasonic Chirp Pairing**: Transmits and decodes high-frequency audio tones (17kHz–20kHz) using Web Audio API frequency analysis.
- 📡 **Local Wi-Fi Subnet Peer Discovery**: Auto-scans local IP addresses (`192.168.1.x`) on your Wi-Fi network.
- 📱 **QR Code Camera Scanner & Host Display**.
- 🔑 **6-Digit Secure Code & Link Sharing**.
- 📲 **NFC Proximity Tap-to-Connect**.

### 2. 🔐 Zero-Knowledge End-to-End Encryption (E2EE)
- **Curve25519 & XSalsa20-Poly1305**: Private keys generated client-side using `TweetNaCl`.
- **E2EE Safety Inspector**: Built-in safety number auditor and key fingerprint inspector.

### 3. 🔑 Google Mail OAuth Authentication
- Authenticate with any Google Email ID (`friend@gmail.com`) with automated profile picture and identity key generation.

### 4. 📞 WebRTC Audio & Video Calling
- Interactive call screen with Web Audio ringtone synthesizer, call timer, mic/video mute toggles, and end call controls.

---

## 🚀 Commands Summary

```bash
# Run entire application with 1 command (root)
npm start

# Run tests & typechecks
npm test
```

---

## 📄 License
This project is open-source under the [MIT License](LICENSE).
