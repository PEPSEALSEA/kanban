# Admin batch audio transcription

Open **Admin → Content Archive → AI ถอดเสียง & สร้าง Content**. Select a Gemini model, optional subject/date overrides and privacy, add files, then start. Each file gets its own progress and retry controls. The generated Markdown becomes the content description; the generated topic becomes the card title. A brief AI description also appears in the completed job preview.

The default is two concurrent AI pipelines (select 1–3). Audio preparation and uploads are serialized to limit memory use. Thai and English are transcribed in their original language with timestamps. The teaching prompt supplied for this feature is retained in `shared/audioTranscript.ts` and visible in the dialog. Formatting uses Google Search for supplementary explanations; metadata is a separate JSON-only generation call.

## Dates, subjects, and long lessons

- Dates are validated from `DD-MM-YY`, `DD-MM-YYYY`, or `YYYY-MM-DD` filenames, including Buddhist years. Otherwise use the upload date in Asia/Bangkok. Every row identifies its date source and allows an override before saving.
- The AI selects an existing subject or `Other`; it cannot create arbitrary subjects. Admins can override the choice.
- Files: MP3, M4A, WAV, AAC, OGG, FLAC, AIFF, WebM; up to 90 MiB input and 30 retained jobs. Browser audio decoding must support the format if compression is needed. Large files are compressed to an 18 MiB target; uploads above 19 MiB are rejected with a split-file instruction.
- Transcription is one complete Gemini request. Truncated, empty, and blocked responses are rejected instead of published. Very long recordings may need to be split manually if they exceed model output limits or cannot compress below the upload limit.
- Formatting runs on consecutive transcript segments with the whole transcript as context. Text exceeding one Sheets cell is preserved across numbered content cards in order. Ordinary lessons create one card per file.

## Persistence and safety

Jobs, files, transcript, formatted segments, metadata, and card IDs are checkpointed in the browser's IndexedDB, scoped to the signed-in account. Keep the tab open while processing. After pause/reload, reopen the dialog and press start to resume. This is not a background service. Storage failure is surfaced; the current in-memory job can still continue. Clearing a queue entry removes its local checkpoint, not published content or the archived audio.

Every `/api/admin/audio/*` operation requires the existing Google admin authentication. API keys stay in Worker secrets. Uploaded audio is archived server-side in Telegram; the temporary Gemini Files copy is deleted after completion (otherwise Gemini expires it after 48 hours). The archive URL contains no bot token. Retrying an expired/failed Gemini file replaces only its temporary copy and retains the archived audio.

New content creation uses UUIDs and atomic Sheets append anchored to column A with RAW values. AI saves additionally use deterministic request IDs and an `audio_content_saves` D1 journal with a lease and payload hash. After an ambiguous save, the next attempt checks Sheets directly before appending. The journal is created on demand in the existing D1 binding; no Sheet columns change and Fix Sheets is unnecessary.

## Verification and deployment

Run frontend `npm run build`; under `worker/`, run `npx tsc --noEmit`, `npx vitest run --config vitest.audio.config.mts` (Node 22.13+), and `npx wrangler deploy --dry-run`. The focused tests cover date validation, lossless splitting, truncated generations, auth, model validation, search/metadata separation, concurrent saves, and reconciliation after a lost Sheets response using real SQLite and mocked providers.

Deploy the Worker, then push the frontend branch for Pages deployment as described in [DEPLOY.md](DEPLOY.md). Existing `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and `DB` are required. The dialog checks configuration before enabling start. Rollback is the normal Git revert and Worker redeploy; existing manual content creation remains available.

Browser verification used simulated provider responses to exercise two concurrent files, one failed formatting step followed by retry without repeated upload/transcription, automatic cards, checkpoint restore, and desktop/mobile layouts. It does not establish real-recording accuracy. A production admin session is needed to verify an actual lecture against the configured remote Gemini secret.

References checked September 5, 2026: [Gemini audio](https://ai.google.dev/gemini-api/docs/audio), [Files API](https://ai.google.dev/gemini-api/docs/files), [Google Search grounding](https://ai.google.dev/gemini-api/docs/google-search), [Sheets append](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append), [Cloudflare Workers practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).
