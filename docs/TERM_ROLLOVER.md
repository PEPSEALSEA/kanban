# Term rollover (ขึ้นเทอมใหม่)

StudyFlow tags every homework / content row with its term and course code, and every subject belongs to a term.

| Where | Field | Example |
|---|---|---|
| `Homework` sheet, col J | `tags` | `1/2569,ว30205` |
| `LearningContent` sheet, col L (+ D1 `learning_content.tags`) | `tags` | `1/2569,ว30205` |
| `Subjects` sheet, cols E–F | `term`, `code` | `2/2569`, `ว30206` |

- Tag 1 = term (`N/YYYY`), tag 2 = course code. Rows without a code (meetings, one-off topics) get the term tag only.
- **Main filters show only the current term's subjects.** Earlier terms stay searchable under "เทอมก่อนหน้า …" (Search page), the term picker (Content page) and an option group (Admin → Content archive).
- New homework / content get `CURRENT_TERM` + the code of the matching current-term subject automatically (done in the Worker, `resolveNewRowTags`). Editing keeps the stored tags.
- A subject with an empty `term`, or a row with no term tag, is treated as current-term so nothing disappears before the data is backfilled.

## Starting a new term

1. **Subjects** – Admin → Subject Manager → add each subject of the new term with its term (e.g. `3/2569`) and course code. (Or add them to `worker/scripts/term-*.json` and run the script below.)
2. **Switch the current term** – change `CURRENT_TERM` in both:
   - `lib/config.ts`
   - `worker/src/index.ts`
3. **Deploy** – `git push origin main` (Pages) and `cd worker; npx wrangler deploy`.
4. Old subjects stay in the sheet with their old term, so they drop out of the main filter automatically.

### Bulk script

`worker/scripts/term-rollover.mjs` backfills tags, sets term/code on existing subjects and appends the next term's subjects, driven by a JSON config (see `term-2569.json`). It needs `worker/.dev.vars`.

```powershell
node worker/scripts/term-rollover.mjs            # dry-run: writes a JSON backup + prints the plan, changes nothing
node worker/scripts/term-rollover.mjs --apply    # writes to the Google Sheet
```

- Rows that already have tags are skipped, so re-running is safe.
- Writes use `RAW` so `1/2569` stays text (Sheets would turn it into a date with `USER_ENTERED`). The Worker prefixes tag/term cells with `'` for the same reason.
- Backups go to `worker/scripts/backups/` (git-ignored).
- After a bulk write, the D1 fast-read copy refreshes on the next sync (hourly cron, or when any content is added/edited).

## One-time setup done for 1/2569 → 2/2569

- D1 migration `worker/migrations/0003_learning_content_tags.sql` must be applied **before** deploying a Worker that reads `tags`. The remote DB was not created through `wrangler d1 migrations` (0001/0002 show as pending although their columns exist), so do not run `migrations apply`; run only the new file:

  ```powershell
  cd worker; npx wrangler d1 execute kanban-studyflow --remote --file migrations/0003_learning_content_tags.sql
  ```
- Spelling variants merged: `Physics→Physic`, `ภาษาไทย→ไทย`, `คณิตพื้นฐาน→คณิตพื้น`, `สัมมนา→สัมนา`, `ประชุมระดับ→ประชุม`.
