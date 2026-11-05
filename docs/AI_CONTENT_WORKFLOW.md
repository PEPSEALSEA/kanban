# AI content workflow (ไฟล์เสียง + ไฟล์ข้อความ → Learning Content)

Standing procedure for the AI agent. When the user sends audio and/or a transcript and wants it on Learning Content ("อัปเดตขึ้น learning content", or simply drops both files), run **A → F** below without being told each step. `AGENTS.md` points here, so every session picks it up.

The user may send the audio and the text in **separate messages and in any order**, and may send a whole batch.

## A. Collect and pair

- A lesson needs **both** an audio file and its transcript. If only one has arrived, say what is missing and wait. Do not invent a transcript from audio.
- Pair them by shared file name or date (`05-11-26-physic.m4a` + `05-11-26-physic.txt`); with equal-length lists and no names, pair in the order given. Ask once only if the pairing is genuinely ambiguous.
- The transcript may be a `.txt` / `.md` file or pasted text. It should carry `[mm:ss]` timestamps; warn if it does not.

## B. Prepare the audio

- Archive limit is **19 MiB** per file. Check sizes first.
- If any file is over the limit, convert **all of the batch in one run** (it converts in parallel, picks the bitrate per file, copies files that already fit, splits very long ones):

  ```powershell
  node scripts/audio-compress.mjs <audio files or folder> --plan     # preview
  node scripts/audio-compress.mjs <audio files or folder>            # output goes to <folder>\compressed
  ```

  Details: [AUDIO_COMPRESS.md](AUDIO_COMPRESS.md). Use the files from `compressed\` in step E.
- If a recording was split into parts, make **one card per part**: cut the transcript at the split time, re-base the timestamps to `[00:00]`, and title them `… (ตอนที่ 1/2)`.

## C. Write the lesson from the transcript

Follow the teaching template exactly. It is the same text as `TEACHING_PROMPT` in `shared/audioTranscript.ts` (the in-app AI transcription uses it too), so there is one source of truth:

- first line `# <title>`, no preamble or closing line, no emoji
- every section carries `[mm:ss]`, in the teacher's real order, nothing skipped
- main content, every problem with its working, the teacher's own summaries
- `> [เพิ่มเติม]` blocks only where the teacher mentions a term / formula / concept / name / open question without explaining it
- drop jokes and off-topic banter

Save the Markdown as `content-drafts/<name>.md` (that folder is git-ignored).

## D. Decide the metadata

- **Subject**: one of the current term's subjects (`CURRENT_TERM` in `lib/config.ts`) or `Other`. Infer it from the lesson and file name; ask only if it is really unclear. The script lists valid names when it is wrong.
- **Date**: from the file name (`DD-MM-YY`, `DD-MM-YYYY`, `YYYY-MM-DD`), otherwise today (Asia/Bangkok).
- **Private**: no, unless the user said so.
- **Tags** `<term>,<course code>` are added automatically.

## E. Queue, then upload in a separate process

Summarising (C) is fast; archiving the audio on Telegram and writing the Sheet row is slow and can fail or be rate limited. They run as **two independent processes** joined by a local SQLite queue (`content-queue/queue.db`, git-ignored), so the AI never waits on an upload.

**1. Start the uploader once, at the beginning of the batch, in the background** (use the Bash/PowerShell tool's `run_in_background`). It uploads whatever is in the queue, one job at a time, retries network / 429 / 5xx errors with backoff, and exits by itself after 5 minutes with nothing left to do:

```powershell
node worker/scripts/content-queue.mjs drain --watch
```

**2. After each lesson is written (step C), enqueue it.** This is local only and returns at once, so move straight on to the next lesson:

```powershell
node worker/scripts/content-queue.mjs add --file content-drafts/x.md --audio compressed/x.m4a --subject Physic --date 2026-11-05
```

`add` checks everything that can be checked offline: first line `# title`, length, `[mm:ss]`, date, audio exists and is within 19 MiB, subject is a current-term subject (cached 12 h, so it is not a network wait). A bad lesson is rejected here, while the AI still has the context to fix it. The job stores a copy of the text; the audio is referenced by path, so do not delete or move the audio until the job is `done`.

**3. When the last lesson is enqueued**, check with `status` (or wait for the uploader to finish). If it exited, `status` shows what is left; start `drain` again (without `--watch` it just drains and exits).

```powershell
node worker/scripts/content-queue.mjs status            # pending / uploading / failed jobs
node worker/scripts/content-queue.mjs status --all      # also the finished ones with their card ids
node worker/scripts/content-queue.mjs drain --dry-run   # list what would upload, writes nothing
node worker/scripts/content-queue.mjs retry --all       # failed -> pending, after fixing the cause
node worker/scripts/content-queue.mjs remove <id>       # drop a pending/failed job
```

- Uploads go through the Worker (`POST /api/cli/content`, key `CLI_ADMIN_KEY` in `worker/.dev.vars`). The card id is derived from audio file name + date + subject + title, so re-running, a crash mid-upload, or a second `add` of the same lesson never makes a duplicate card. A 401/503 (wrong key / Worker not configured) stops the drain with the jobs left pending.
- Only one `drain` runs at a time. If a `--watch` drain is already running, just `add`; it picks the new jobs up.
- **Careful:** the card id changes if the audio name, date, subject or title change (even adding or dropping `--audio`), and that makes a **new** card on upload. Never "test" a queue or import against production with different arguments than the real ones; use `--db <temp file>` and `drain --dry-run`.
- The user's request to update Learning Content is the authorization to enqueue and drain. Stop and ask only when something is ambiguous (unknown subject, unclear pairing, content over 50,000 characters, a job that keeps failing).
- Without `--audio` the card is text-only; the audio can be attached later in Admin → Content Archive.
- One-off single card, no queue: `node worker/scripts/add-content.mjs --file … --audio … --subject … [--apply]` (dry-run by default; `--replace-audio` swaps the audio of an already imported card).
- Never print or paste `CLI_ADMIN_KEY` or other secrets.

### Speeding up C for large batches

The queue removes the upload wait. To also cut the summarising time, lessons are independent, so several can be written in parallel (one subagent per lesson or small group, each ending with its own `add`). Keep the transcript → lesson rules above identical for every subagent.

## F. Report

Use `status --all` for the real state, not memory. For each lesson give: title, subject, date, tags, audio attached (yes/no), card id. For a batch, a short table; one failure must not stop the rest, list failures (with `last_error`) at the end. Remind that the card appears in the app within 10 minutes (the Worker syncs on a cron tick) or at once via Admin → Dashboard → Sync Fast Cache.

---

The in-app route (Admin → Content Archive → "AI ถอดเสียง & สร้าง Content") does C–E in one go with Gemini from the audio alone; see [AUDIO_TRANSCRIPTION.md](AUDIO_TRANSCRIPTION.md). Use this workflow when the user already has a transcript.
