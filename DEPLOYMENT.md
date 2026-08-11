# 🚀 AetherSync Production Deployment Guide

This guide details how to deploy **AetherSync** (Backend Node.js API, WebSockets Server, MongoDB database, and React Frontend) to **Render.com** using 1-Click Blueprints, Vercel, or Railway.

---

## ⚡ 1. Render.com 1-Click Blueprint Deployment (Recommended)

Render automatically detects the [`render.yaml`](file:///c:/Users/hp/Downloads/baatein/baatein/render.yaml) file in your repository and provisions both the Node.js API server and the Static SPA frontend in a single click!

### Step-by-Step Instructions:

1. **Log In to Render**:
   - Go to [https://dashboard.render.com](https://dashboard.render.com) and log in with your GitHub account.

2. **Create New Blueprint Instance**:
   - Click **New +** in the top navigation bar and select **Blueprint**.

3. **Connect Your GitHub Repository**:
   - Select your repository: `ManthanGarg-1234/MessagingApp`.
   - Render will parse `render.yaml` and display:
     - `aethersync-backend` (Node.js Web Service with WebSockets)
     - `aethersync-frontend` (Static Site with SPA routing)

4. **Click "Apply"**:
   - Click **Apply** to start building and deploying both services automatically!
   - Your backend will be live at `https://aethersync-backend.onrender.com`.
   - Your frontend will be live at `https://aethersync-frontend.onrender.com`.

---

## 2. Deploying Frontend to Vercel (Optional Alternative)

If you prefer serving the frontend from **Vercel**:

1. Log in to [https://vercel.com](https://vercel.com) and click **Add New Project**.
2. Select `ManthanGarg-1234/MessagingApp`.
3. Vercel automatically detects [`vercel.json`](file:///c:/Users/hp/Downloads/baatein/baatein/vercel.json).
4. Click **Deploy**!

---

## 3. Production Security & Health Monitoring

- [x] **Rate Limiting**: Active on `/api/auth` (20 req/min) and `/api/` (120 req/min).
- [x] **Zero-Knowledge E2EE**: Client-side Curve25519 key exchange; zero plaintext stored on server.
- [x] **Health Check Endpoint**: Query `https://aethersync-backend.onrender.com/api/health` for uptime, memory metrics, and DB connection state.
