# AI Agent Notes — kanban / StudyFlow

Read **`docs/DEPLOY.md`** before any deploy, hosting, or CI change.

## Stack

- **Frontend:** Next.js 16, static export (`output: 'export'`), `basePath: '/kanban'`, Tailwind, sky-blue theme in `app/globals.css`
- **Pages host:** GitHub Pages → https://pepsealsea.github.io/kanban/
- **API host:** Cloudflare Worker `kanban-worker` → `lib/config.ts` `API_URL`
- **AI chat:** UI in `components/ai-chat/`, streaming API in `worker/src/aiChat.ts` (`POST /api/chat`)

## Deploy commands

```powershell
# Frontend (when GitHub Actions is slow/stuck)
npm run deploy:pages

# Backend
cd worker; npx wrangler deploy
```

## Common mistakes

- Adding `app/api/*` breaks static Pages deploy (no server on GitHub Pages)
- Pointing chat to `/kanban/api/chat` on Pages — must use Worker URL via `lib/chatApi.ts`
- Forgetting `wrangler deploy` after worker changes while only pushing frontend
