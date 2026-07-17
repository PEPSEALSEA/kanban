# AI Agent Notes — kanban / StudyFlow

Read **`docs/DEPLOY.md`** before any deploy, hosting, or CI change.

## Stack

- **Frontend:** Next.js 16, static export (`output: 'export'`), `basePath: '/kanban'`, Tailwind, sky-blue theme in `app/globals.css`
- **Pages host:** GitHub Pages → https://pepsealsea.github.io/kanban/
- **API host:** Cloudflare Worker `kanban-worker` → `lib/config.ts` `API_URL`
- **AI chat:** UI in `components/ai-chat/`, streaming API in `worker/src/aiChat.ts` (`POST /api/chat`)

## Deploy commands

```powershell
# Frontend (default): push to main → GitHub Actions deploys Pages
git push origin main

# Frontend fallback if Actions runner queue is stuck
npm run deploy:pages

# Backend
cd worker; npx wrangler deploy
```

## Common mistakes

- Adding `app/api/*` breaks static Pages deploy (no server on GitHub Pages)
- Pointing chat to `/kanban/api/chat` on Pages — must use Worker URL via `lib/chatApi.ts`
- Forgetting `wrangler deploy` after worker changes while only pushing frontend

## NotebookLM import (when user asks to create a new LM notebook)

**Do not** paste Worker `.txt` URLs into NotebookLM one-by-one in chat and wait. That often creates red `web_page` sources that fail to load.

**Preferred flow**
1. User selects content on Content page → **Copy Batch AI Link** → **Download ZIP TXT**
2. User extracts the zip and gives you the folder path (and optional exam-outline text / title)
3. Agent runs (after `nlm login` if needed):

```powershell
.\scripts\nlm-import.ps1 -Title "ชื่อวิชา ติวสอบกลางภาค" -Dir "<extracted-folder>"
# optional notes:
.\scripts\nlm-import.ps1 -Title "..." -Dir "..." -ExtraTextFile ".\outline.txt"
```

4. Return the notebook URL. Script uploads as **files** (not URLs), names sources from `manifest.json` / `#` headers.

**If user only pastes Worker URLs:** download each `.txt` locally first, then upload with `nlm source add … --file` (or ask them to use Download ZIP TXT). Never rely on `--url` for `kanban-worker…/content/*.txt`.

**UI / script locations:** batch ZIP in `components/ui/classic/ContentPage.tsx`; import CLI in `scripts/nlm-import.ps1`; zip helper in `lib/zipStore.ts`.
