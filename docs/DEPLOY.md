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

## Method A — GitHub Actions (default)

Workflow: [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)

- Triggers on **push to `main`** and **workflow_dispatch** (manual)
- Builds on `ubuntu-latest`, uploads `./out`, deploys to Pages

### One-time GitHub setup

Repo **Settings → Pages** → **Source:** **GitHub Actions**

### Normal flow

```powershell
git push origin main
```

Actions builds and deploys automatically.

---

## Method B — Deploy from your computer (fallback)

Use only when GitHub Actions is stuck on **"Waiting for a runner"** (known GitHub queue bug).

```powershell
npm run deploy:pages
```

Requires Pages source: **Deploy from a branch** → `gh-pages` / `/ (root)`.  
After Actions works again, switch Pages source back to **GitHub Actions** (Method A).

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
| Actions stuck on runner queue | Cancel run → use Method B (`npm run deploy:pages`), or retry later |
| Chat 401 | User must sign in with Google; token sent as `Authorization: Bearer` |
| Chat 500 `GEMINI_API_KEY` | Set secret on Cloudflare Worker |
| Site 404 on refresh | Ensure deploy uses `--nojekyll` — already in `deploy:pages` script |
| Old UI after deploy | Hard refresh / clear cache; check correct branch in Pages settings |

---

## Do not

- Remove `output: 'export'` unless moving frontend to Vercel/Node host
- Commit `out/`, `.env.local`, `worker/.dev.vars`, or `worker/wrangler.toml`
- Force-push `main` or `gh-pages` without user request
