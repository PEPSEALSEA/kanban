# Local audio converter (`scripts/audio-compress.mjs`)

Converts many recordings in parallel on your own machine and picks the bitrate **per file**, so each recording fits the archive limit without being squeezed more than necessary.

## Why

The app archives audio in Telegram and the Worker rejects files above **19 MiB** (`ARCHIVE_MAX_BYTES` in `shared/audioTranscript.ts`; Telegram bots can only download files up to 20 MB). A fixed preset such as 16 kbps HE-AAC makes every file small, but also muddy. A 20-minute lesson can sit at 80 kbps and stay clear, while only a 90-minute one has to drop to ~50 kbps.

## What it does

For every file it reads the duration with `ffprobe`, then:

| Situation | Action |
|---|---|
| File is already ≤ 19 MiB | copied as-is, no re-encoding, no quality loss |
| Needs ≥ the minimum bitrate (aac 40 / opus 20 / mp3 40 kbps) to fit 18 MiB | one file at the **highest bitrate that fits** (capped at 80 kbps) |
| Too long to stay clear in one file | split into equal parts, each at ≥ the minimum bitrate (`name_part1of2.m4a` …) |

- Mono by default (speech gains nothing from stereo; the saved bits go to clarity). `--stereo` keeps it.
- Sample rate follows the bitrate (24 kHz at low bitrates, higher when there is room).
- If an output still lands above 19 MiB it is re-encoded 10 % lower (up to 4 tries).
- Many files run at once: `--jobs` defaults to 75 % of your CPU cores, one single-thread ffmpeg each.
- Output goes to `<input folder>/compressed` and the original file name is kept, so the date in the name (`05-11-26`) still works for the app's date detection.

## Usage

Needs `ffmpeg` and `ffprobe` on PATH (`ffmpeg -version`). No npm install.

```powershell
node scripts/audio-compress.mjs "D:\recordings" --plan     # show what would happen, convert nothing
node scripts/audio-compress.mjs "D:\recordings"            # convert (existing outputs are skipped)
node scripts/audio-compress.mjs a.m4a b.m4a --out D:\ready
```

| Option | Default | Meaning |
|---|---|---|
| `--codec aac\|opus\|mp3` | `aac` | `aac` = `.m4a`, plays everywhere. `opus` = `.ogg`, noticeably clearer below ~40 kbps; plays in current Chrome / Firefox / Edge / Android, older iOS/Safari may not, so try one file on your phone first. |
| `--target-mb` | 18 | size budget per output file |
| `--hard-mb` | 19 | copy as-is at or below this; re-encode outputs above it |
| `--max-kbps` / `--min-kbps` | 80 / codec-specific | bitrate range |
| `--jobs` | 75 % of cores | parallel ffmpeg processes |
| `--normalize` | off | even out loudness before encoding |
| `--recursive` | off | include sub-folders |
| `--overwrite` | off | replace existing outputs |

## Notes

- HE-AAC needs the non-free `libfdk_aac` encoder, which common ffmpeg builds do not include; the built-in AAC encoder is used instead. At the bitrates this script picks, plain AAC-LC mono is clear for speech.
- If a very long recording is split, upload the parts as separate audio files on the same content card (a card can hold several audio files).
- Quality was checked for size and duration only (synthetic audio); judge the sound on one real recording before converting a whole folder.

## Next step

Upload the converted files in the app, or attach one with the content script: `node worker/scripts/add-content.mjs --file lesson.md --audio compressed\lesson.m4a --subject Physic` (see [AI_CONTENT_WORKFLOW.md](AI_CONTENT_WORKFLOW.md)).
