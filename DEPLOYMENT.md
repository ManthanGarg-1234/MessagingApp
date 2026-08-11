# 🚀 Baatein Production Deployment Guide

This guide details how to deploy **Baatein** (Backend Node.js API, WebSockets Server, MongoDB database, and React Frontend) to popular cloud infrastructure providers.

---

## 1. Quick Local Docker Deployment (Recommended)

Run the entire containerized stack locally with a single command:

```bash
docker-compose up --build -d
```

- **Frontend Application**: `http://localhost` (Served via NGINX)
- **Backend API & WebSockets**: `http://localhost:4000`
- **Healthcheck Endpoint**: `http://localhost:4000/api/health`

---

## 2. Deploying to Render (Free Tier)

### Step 1: Deploy Backend & WebSockets Service
1. Create a new **Web Service** on [Render](https://render.com).
2. Connect your Git repository and select the `backend/` root directory.
3. Choose **Node** runtime.
4. Set Build Command: `npm install`
5. Set Start Command: `node src/server.js`
6. Add Environment Variables:
   - `NODE_ENV`: `production`
   - `PORT`: `4000`
   - `JWT_SECRET`: Generate a long random secret key
   - `MONGO_URI`: MongoDB Atlas connection string (or leave empty for memory-server fallback)

### Step 2: Deploy Frontend
1. Create a new **Static Site** on Render (or Vercel / Netlify).
2. Root directory: `frontend/`
3. Build Command: `npm run build`
4. Publish Directory: `dist`

---

## 3. Deploying to Vercel & Railway

### Backend (Railway)
1. Push project to GitHub.
2. Link repo to **Railway.app** and deploy `backend/`.
3. Railway automatically exposes WebSocket ports and handles zero-downtime restarts.

### Frontend (Vercel)
1. Import repository into **Vercel**.
2. Framework Preset: `Other` (or Webpack).
3. Build Command: `npm run build`
4. Output Directory: `dist`

---

## 4. Production Security & Checklist

- [x] **Rate Limiting**: Rate-limiting token bucket active on `/api/auth` (max 20 req/min) and `/api/` (max 120 req/min).
- [x] **CORS Protection**: Configure `CLIENT_ORIGIN` in `.env.production` to match production frontend URL.
- [x] **Database Fallback**: Gracefully handles MongoDB Atlas network drops with `mongodb-memory-server` fallback.
- [x] **End-to-End Encryption**: Keypairs generated client-side; zero plaintext stored on server.
- [x] **Health Check Monitoring**: Query `/api/health` for uptime, memory usage, and DB connection state.
