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

## E. Publish

For each lesson, dry-run first, check the printed row, then apply:

```powershell
node worker/scripts/add-content.mjs --file content-drafts/x.md --audio compressed/x.m4a --subject Physic            # dry-run
node worker/scripts/add-content.mjs --file content-drafts/x.md --audio compressed/x.m4a --subject Physic --apply    # writes
```

- `--audio` archives the audio and creates the card in one step through the Worker (`POST /api/cli/content`, key `CLI_ADMIN_KEY` in `worker/.dev.vars`). It is idempotent: re-running the same audio/date/subject/title is skipped, so an interrupted batch can simply be run again.
- The user's request to update Learning Content is the authorization to `--apply`. Stop and ask only when something is ambiguous (unknown subject, unclear pairing, a duplicate was skipped, content over 50,000 characters, an error).
- Without `--audio` the card is text-only; the audio can be attached later in Admin → Content Archive.
- Never print or paste `CLI_ADMIN_KEY` or other secrets.

## F. Report

For each lesson give: title, subject, date, tags, audio attached (yes/no), card id. For a batch, a short table; one failure must not stop the rest, list failures at the end. Remind that the card appears in the app within 10 minutes (the Worker syncs on a cron tick) or at once via Admin → Dashboard → Sync Fast Cache.

---

The in-app route (Admin → Content Archive → "AI ถอดเสียง & สร้าง Content") does C–E in one go with Gemini from the audio alone; see [AUDIO_TRANSCRIPTION.md](AUDIO_TRANSCRIPTION.md). Use this workflow when the user already has a transcript.
