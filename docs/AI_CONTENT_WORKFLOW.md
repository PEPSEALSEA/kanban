# AI content workflow (เสียง + transcript → content card)

Use this when you hand the AI an audio file and its transcript and want a finished content card.

## Steps

1. **Input** – audio file path + transcript with `[mm:ss]` timestamps. Optional: subject, date, private. The date is read from a `DD-MM-YY` / `DD-MM-YYYY` / `YYYY-MM-DD` file name, otherwise today (Asia/Bangkok).
2. **Write the lesson** – follow the teaching template exactly. The template is the same text as `TEACHING_PROMPT` in `shared/audioTranscript.ts` (the one the in-app AI transcription uses), so there is one source of truth:
   - first line `# <title>`, no preamble or closing line, no emoji
   - every section carries a timestamp `[mm:ss]`, in the teacher's real order, nothing skipped
   - main content, every problem with its working, the teacher's own summaries
   - `> [เพิ่มเติม]` blocks only where the teacher mentions something (term, formula, concept, name, open question) without explaining it
   - drop jokes and off-topic banter
3. **Pick subject and tags** – the subject must be a subject of the current term (`CURRENT_TERM` in `lib/config.ts`), otherwise `Other`. Tags are `<term>,<course code>` and are added automatically from the Subjects sheet.
4. **Save** – save the Markdown to a file and run:

   ```powershell
   node worker/scripts/add-content.mjs --file lesson.md --subject Physic            # dry-run: shows the row
   node worker/scripts/add-content.mjs --file lesson.md --subject Physic --apply    # appends it to the Sheet
   ```

   Add `--date YYYY-MM-DD` to override the date and `--private` for a private card. A cell holds at most 50,000 characters; longer lessons must be split into numbered cards in time order.
5. **Audio** – attach the audio in the app afterwards (Admin → Content Archive → edit the card). The audio archive uses the Worker's Telegram secrets, which the script does not have.
6. **Publish** – the card shows up in the app within 10 minutes (the Worker syncs the D1 copy on a cron tick), or at once via Admin → Dashboard → Sync Fast Cache.

The in-app route (Admin → Content Archive → "AI ถอดเสียง & สร้าง Content") does all of this in one go with Gemini, including the audio upload; see [AUDIO_TRANSCRIPTION.md](AUDIO_TRANSCRIPTION.md).
