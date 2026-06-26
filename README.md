# StudyFlow + Gemini Homework Assistant

## Frontend setup

```bash
npm install
npm run dev
```

Set frontend env in `.env.local`:

```bash
NEXT_PUBLIC_API_URL=https://kanban-worker.sealseapep.workers.dev
```

## Worker setup

```bash
cd worker
npm install
```

Create local worker secrets in `worker/.dev.vars`:

```bash
SPREADSHEET_ID=...
GOOGLE_CLIENT_EMAIL=...
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
DISCORD_WEBHOOK_URL=...
SUMMARY_WEBHOOK_URL=...
GEMINI_API_KEY=...
GOOGLE_CLIENT_ID=787988651964-gf258mnif89bu6g0jao2mpdsm72j96da.apps.googleusercontent.com
```

Run local worker:

```bash
npm run dev
```

## Production secrets (Cloudflare)

Set Gemini key as Cloudflare Worker secret:

```bash
cd worker
npx wrangler secret put GEMINI_API_KEY
```

The key is read only in Worker runtime (`c.env.GEMINI_API_KEY`) and is never exposed to `NEXT_PUBLIC_*`.

## Gemini chat endpoint

- Route: `POST /api/gemini-chat`
- Request body includes:
  - `message`
  - `history` (user/assistant turns)
  - `user.email`
  - optional `attachment` (image or PDF, base64)
- Response includes:
  - `answer`
  - `contextRows` from Google Sheet filtering
