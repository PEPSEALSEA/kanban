# Deploy Guide — StudyFlow / Kanban

> **For AI agents:** Read this file before changing deployment, hosting, or CI.
> Related: [`next.config.ts`](../next.config.ts), [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml), [`worker/`](../worker/), [`lib/chatApi.ts`](../lib/chatApi.ts), [`lib/config.ts`](../lib/config.ts)

## Architecture (split hosting)

| Layer | Host | URL | What runs there |
|-------|------|-----|-----------------|
| **Frontend (static)** | GitHub Pages | https://pepsealsea.github.io/kanban/ | Next.js `output: 'export'` — UI only |
| **Backend (API)** | Cloudflare Worker | https://kanban-worker.sealseapep.workers.dev | Sheets, auth, `/api/chat`, `/api/gemini-chat` |

The AI chat UI is on Pages; streaming goes to the Worker (`POST /api/chat`).  
**Pages cannot run Next.js API routes** — do not add `app/api/*` without also changing hosting.

---

## Method A — Deploy from your computer (recommended when Actions is stuck)

Use this when GitHub Actions shows **"Waiting for a runner"** for many minutes.

### One-time GitHub setup

1. Repo **Settings → Pages**
2. **Source:** Deploy from a branch
3. **Branch:** `gh-pages` / **folder:** `/ (root)`
4. Save

### Every deploy (Windows PowerShell)

```powershell
cd e:\Github2\kanban
npm run deploy:pages
```

Or run the script directly:

```powershell
.\scripts\deploy-pages.ps1
```

This will:

1. `npm run build` → static files in `./out`
2. Push `out/` to the `gh-pages` branch (via `gh-pages` package)
3. GitHub Pages updates in ~1–2 minutes

### Requirements

- Node.js 22+ (same as CI)
- `git` configured with push access to `PEPSEALSEA/kanban`
- First run: `npm install` (installs `gh-pages` devDependency)

### Cancel a stuck Actions run

Actions → open the run → **Cancel workflow** → use Method A instead.

---

## Method B — GitHub Actions (automatic on push to `main`)

Workflow: [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)

- Triggers on push to `main` and **workflow_dispatch** (manual)
- Builds on `ubuntu-latest`, uploads `./out`, deploys to Pages **only if** Pages source is **GitHub Actions**

If you switched Pages to **gh-pages branch** (Method A), this workflow still builds but **will not update the live site** unless you change Pages source back to Actions.

---

## Cloudflare Worker deploy (API / chat)

Chat and data APIs live on the Worker — deploy separately after worker code changes:

```powershell
cd e:\Github2\kanban\worker
npx wrangler deploy
```

Secrets (Cloudflare dashboard → Worker → Settings → Variables):

- `GEMINI_API_KEY` — required for `/api/chat` and `/api/gemini-chat`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, etc.

Local dev secrets: `worker/.dev.vars` (gitignored)

---

## Key files (quick map)

| File | Purpose |
|------|---------|
| [`next.config.ts`](../next.config.ts) | `output: 'export'`, `basePath: '/kanban'` |
| [`lib/config.ts`](../lib/config.ts) | `API_URL` → Worker default |
| [`lib/chatApi.ts`](../lib/chatApi.ts) | `CHAT_API_PATH` = `${API_URL}/api/chat` |
| [`worker/src/aiChat.ts`](../worker/src/aiChat.ts) | Streaming AI chat + tools |
| [`worker/src/index.ts`](../worker/src/index.ts) | Hono routes, CORS, auth |
| [`components/ai-chat/AiChatPage.tsx`](../components/ai-chat/AiChatPage.tsx) | `useChat` → Worker |
| [`.gitignore`](../.gitignore) | Ignores `/out/`, `.env*`, `worker/wrangler.toml` |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Actions stuck on runner queue | Cancel run → `npm run deploy:pages` |
| Chat 401 | User must sign in with Google; token sent as `Authorization: Bearer` |
| Chat 500 `GEMINI_API_KEY` | Set secret on Cloudflare Worker |
| Site 404 on refresh | Ensure deploy uses `--nojekyll` — already in `deploy:pages` script |
| Old UI after deploy | Hard refresh / clear cache; check correct branch in Pages settings |

---

## Do not

- Remove `output: 'export'` unless moving frontend to Vercel/Node host
- Commit `out/`, `.env.local`, `worker/.dev.vars`, or `worker/wrangler.toml`
- Force-push `main` or `gh-pages` without user request
