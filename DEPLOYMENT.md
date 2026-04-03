# Deploying PathForge (Render and Vercel)

This app has:
- `backend/` (Flask API, Python)
- `frontend/` (Vite + React)

You can deploy it in two common ways:
- **Option A (recommended):** Backend on Render + Frontend on Vercel
- **Option B:** Both frontend and backend on Render

---

## 0) Pre-deploy checklist

1. Commit and push your latest code to GitHub.
2. Make sure OAuth callback URLs are configured in Google/GitHub consoles for your production domains.
3. Generate a strong `FLASK_SECRET_KEY` (do not reuse local dev keys).
4. Rotate any secrets that were ever committed to source control.

---

## Frontend API URL (`VITE_API_BASE_URL`)

The frontend reads **`import.meta.env.VITE_API_BASE_URL`** at build time (see `frontend/src/utils/apiConfig.js`). All API calls (`api.js`, `sessionApi.js`) and OAuth login links (`AuthModal.jsx` via `getBackendOrigin()`) derive from this value.

- **Vercel / Render static:** set `VITE_API_BASE_URL` to your backend URL **including** `/api`, for example `https://your-service.onrender.com/api`.
- If you omit it, the app falls back to `http://localhost:5000/api` (local dev only).
- Copy `frontend/.env.example` to `frontend/.env.local` for local overrides.

---

## SQLite on Render (ephemeral disk vs persistent data)

By default the database file is `backend/pathforge.sqlite3` next to `app.py`.

- On Render (and many PaaS hosts), the filesystem is **ephemeral**: redeploys can **wipe** the database, so saved sessions and users may disappear.
- For a first deploy this is often acceptable; for persistence, attach a **Render Disk**, mount it (for example `/var/data`), and set:

  `PATHFORGE_DB_PATH=/var/data/pathforge.sqlite3`

The app creates the parent directory if needed when `PATHFORGE_DB_PATH` points to a new path.

---

## Option A: Backend on Render + Frontend on Vercel

## 1) Deploy backend to Render

1. Go to [Render Dashboard](https://dashboard.render.com/) -> **New** -> **Web Service**.
2. Connect your GitHub repo.
3. Configure:
   - **Name:** `codewiser-backend` (or your choice)
   - **Root Directory:** `backend`
   - **Runtime:** Python
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn app:app`
4. Add environment variables in Render:
   - `FLASK_SECRET_KEY` = `<strong-random-value>`
   - `GOOGLE_CLIENT_ID` = `<your-google-client-id>`
   - `GOOGLE_CLIENT_SECRET` = `<your-google-client-secret>`
   - `GITHUB_CLIENT_ID` = `<your-github-client-id>`
   - `GITHUB_CLIENT_SECRET` = `<your-github-client-secret>`
   - `FRONTEND_BASE_URL` = `https://<your-vercel-app>.vercel.app`
   - `FRONTEND_ORIGINS` = `https://<your-vercel-app>.vercel.app`
   - `OAUTH_REDIRECT_BASE_URL` = `https://<your-render-backend>.onrender.com`
   - `FLASK_COOKIE_SECURE` = `1`
   - Optional: `PATHFORGE_DB_PATH` = `/var/data/pathforge.sqlite3` (if using a Render Disk for SQLite persistence)
5. Deploy and note backend URL:
   - `https://<your-render-backend>.onrender.com`

## 2) Deploy frontend to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard) -> **Add New...** -> **Project**.
2. Import the same GitHub repo.
3. Configure:
   - **Framework Preset:** Vite
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. Add environment variable:
   - `VITE_API_BASE_URL` = `https://<your-render-backend>.onrender.com/api`
5. Deploy and note frontend URL:
   - `https://<your-vercel-app>.vercel.app`

## 3) Configure OAuth providers (production URLs)

### Google OAuth
- In Google Cloud Console -> OAuth Client:
  - **Authorized redirect URI:**
    - `https://<your-render-backend>.onrender.com/api/auth/callback/google`

### GitHub OAuth App
- In GitHub Developer Settings -> OAuth App:
  - **Authorization callback URL:**
    - `https://<your-render-backend>.onrender.com/api/auth/callback/github`

## 4) Final verify

1. Open frontend on Vercel.
2. Click Google/GitHub login.
3. Confirm callback returns to frontend and user is signed in.
4. Confirm saving/loading sessions works (cookie + CORS path).

---

## Option B: Both frontend and backend on Render

Use two services in Render:
- Web Service 1: Flask backend (`backend/`)
- Static Site (or Web Service) 2: Vite frontend (`frontend/`)

## 1) Backend service (same as Option A)

Use the exact backend steps/env vars from Option A, except:
- `FRONTEND_BASE_URL` and `FRONTEND_ORIGINS` should point to your Render frontend URL.

## 2) Frontend static site on Render

1. In Render -> **New** -> **Static Site**.
2. Connect repo and configure:
   - **Root Directory:** `frontend`
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`
3. Add env var:
   - `VITE_API_BASE_URL` = `https://<your-render-backend>.onrender.com/api`

## 3) OAuth callback URLs

Keep callbacks on backend domain:
- `https://<your-render-backend>.onrender.com/api/auth/callback/google`
- `https://<your-render-backend>.onrender.com/api/auth/callback/github`

---

## Optional: `render.yaml` starter (Blueprint)

Create `render.yaml` at repo root if you want infra-as-code:

```yaml
services:
  - type: web
    name: codewiser-backend
    runtime: python
    rootDir: backend
    buildCommand: pip install -r requirements.txt
    startCommand: gunicorn app:app
    envVars:
      - key: FLASK_COOKIE_SECURE
        value: "1"
      # Add secrets in Render dashboard for sensitive values.

  - type: static
    name: codewiser-frontend
    rootDir: frontend
    buildCommand: npm install && npm run build
    staticPublishPath: dist
    envVars:
      - key: VITE_API_BASE_URL
        value: https://codewiser-backend.onrender.com/api
```

---

## Common production issues

- **OAuth error after provider login**
  - Callback URI mismatch in Google/GitHub settings.
- **Frontend cannot call backend**
  - `VITE_API_BASE_URL` is wrong or missing `/api`.
- **Login seems successful but user is not persisted**
  - `FLASK_COOKIE_SECURE` or `FRONTEND_ORIGINS`/`FRONTEND_BASE_URL` is misconfigured.
- **CORS failure**
  - `FRONTEND_ORIGINS` must exactly match deployed frontend origin (including `https`).
- **Saved sessions disappear after redeploy**
  - Expected without a persistent disk; set `PATHFORGE_DB_PATH` on a mounted volume or use an external database later.

