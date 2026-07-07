---
name: script-pack
description: Generate 1-7 short-form video scripts for the upcoming days, in Pablo's actual voice, anchored on the Mars vault and shaped by viral patterns scraped from the OpenClaw VM. Outputs land in Content Pipeline as scripted-status videos. Trigger when the user says "draft today's scripts", "script pack for tomorrow", "weekly script batch", or invokes `/script-pack`. The viral intelligence layer gives the SHAPE; Pablo's voice gives the SUBSTANCE — never copy competitor wording into a script body.
allowed-tools:
  - "Read"
  - "Write"
  - "Edit"
  - "Bash"
  - "Glob"
  - "Grep"
---

# Script Pack — daily/weekly short-form video scripts in Pablo's voice

You generate 1-7 short-form video scripts that Pablo will record from. The video is **never** AI-generated. Your job is to produce scripts sharp enough that he reads them once and films.

The substrate is Pablo's voice (Mars vault) + Nella business facts. The shape comes from viral intelligence scraped by the OpenClaw VM (a separate, autonomous pipeline). The skill bridges the two — at generation time, never at storage time.

## Hard rules

1. **No competitor text in script bodies.** You may inspect `viral_intelligence.transcript` and `viral_intelligence.hook_text` to understand SHAPE (hook type, format, pacing, proof mechanism), but never paraphrase or echo a competitor's wording. If a phrase reads like another creator wrote it, rewrite.
2. **Voice anchors are the highest-weight context.** When voice anchors and viral patterns conflict, voice wins.
3. **Each script tags its `pattern_source`.** Show your work. The CP video record carries a `pattern_source` JSON field listing the viral row(s) the SHAPE was drawn from. Transparency, not citation. This lets Pablo see which patterns are actually shaping his output and prune what isn't his voice.
4. **Human in the loop.** Always print a dry-run JSON of the full packet first and wait for `approve` before writing to CP. Pablo can edit, reject specific scripts, or ask for variations.
5. **No em dashes. No en dashes. No ellipsis character.** Per `writing-rules.md` section 3 (hard ban). Use only ASCII punctuation: periods, commas, colons, semicolons, parentheses. This applies to **every field in the dry-run and the CP write payload**, not just the script body. Pre-publish scrub (mandatory): run the deterministic commands in the Voice-leak guard section on the entire dry-run JSON (lint-text.mjs plus the perl character sweep). If either flags anything, rewrite before printing. The scrub runs on `script`, `hook`, `cta`, `title`, `visual_notes`, `filming_location`, `broll_shotlist`, `edit_ideas`, `filming_notes`, and any prose Pablo will read.
6. **Person-led content rules** (apply to Mon/Fri/Sat/Sun and any intro/journey/honesty/reflection content):
   - Don't name specific products (Nella, Cortex, etc.). The journey is about Pablo as a founder/person, not building a specific product.
   - Don't anchor with location ("from Medellín / Colombia"). Internal context, not content positioning.
   - Don't mention language ("In English") or format meta ("on Reels"). The audience is on the platform.
   - If the post would still work without a product mention, leave it out.
   - Tech-lesson and proof-of-work slots (Tue/Wed) are different — those can be product/feature-led.

## Invocation

- `/script-pack run "<theme or context>" [--days 3]` — generate scripts. Default 1 script (today). `--days N` produces a packet for the next N days (1-7).
- `/script-pack run --weekly` — full Monday-through-Sunday packet using the day-role distribution from `Mars/Mars/03-content-system/short-form-video/batched-posting-structure.md`.
- `/script-pack run --pattern <pattern_tag>` — force the skill to draw from a specific viral pattern family (e.g. `numbered_list`, `bold_claim`).

## Load order

Read in this exact order. Stop loading once you have enough — don't slurp everything.

1. **Voice anchors (PRIMARY signal):**
   - `/Users/pablo/Library/Mobile Documents/com~apple~CloudDocs/Mars/Mars/content/voice-anchors/writing-rules.md`
   - `/Users/pablo/Library/Mobile Documents/com~apple~CloudDocs/Mars/Mars/content/voice-anchors/short-video.md`
   - `/Users/pablo/Library/Mobile Documents/com~apple~CloudDocs/Mars/Mars/content/voice-anchors/cadence.md` (load when register is casual)
   - `/Users/pablo/Library/Mobile Documents/com~apple~CloudDocs/Mars/Mars/content/voice-anchors/nella.md` (load when topic is Nella-related)

2. **Brand:**
   - `/Users/pablo/Library/Mobile Documents/com~apple~CloudDocs/Mars/Mars/02-brand/pablo-personal-brand.md`
   - `/Users/pablo/Library/Mobile Documents/com~apple~CloudDocs/Mars/Mars/02-brand/voice-and-style.md`

3. **Content system playbooks (the format / structural context):**
   - `/Users/pablo/Library/Mobile Documents/com~apple~CloudDocs/Mars/Mars/03-content-system/short-form-video/instagram-tiktok-playbook.md`
   - `/Users/pablo/Library/Mobile Documents/com~apple~CloudDocs/Mars/Mars/03-content-system/short-form-video/script-patterns.md`
   - `/Users/pablo/Library/Mobile Documents/com~apple~CloudDocs/Mars/Mars/03-content-system/short-form-video/11-second-hook-framework.md`
   - `/Users/pablo/Library/Mobile Documents/com~apple~CloudDocs/Mars/Mars/03-content-system/short-form-video/batched-posting-structure.md` (always when `--days > 1` or `--weekly`)
   - `/Users/pablo/Library/Mobile Documents/com~apple~CloudDocs/Mars/Mars/03-content-system/short-form-video/weekly-filming-batch-system.md` (always when `--weekly`)

4. **Business / product context (load only when topic touches Nella):**
   - `/Users/pablo/Library/Mobile Documents/com~apple~CloudDocs/Mars/Mars/01-business/nella/business-snapshot.md`
   - `/Users/pablo/Library/Mobile Documents/com~apple~CloudDocs/Mars/Mars/01-business/nella/product-facts.md`

5. **Viral intelligence (SHAPE only):** call the CP API, do not read raw vault files.
   - `GET http://localhost:3010/api/viral/intelligence?limit=30&days=14` — returns recent high-scoring intel rows. **Use only the `pattern_tags`, `hook_type`, `format`, `why_it_worked`, `adapted_angle` fields. Read `hook_text` for inspiration only — do not copy.**
   - When `--pattern <tag>` is used: `GET http://localhost:3010/api/viral/intelligence?limit=30&days=14&tags=<tag>`

6. **CP state (so we don't double-book a slot):**
   - `GET http://localhost:3010/api/videos` — filter to status=scripted in the target date range
   - `GET http://localhost:3010/api/weekly/<weekKey>` — when `--weekly`

7. **Existing automation packets (for guardrails):**
   - `/Users/pablo/Library/Mobile Documents/com~apple~CloudDocs/Mars/Mars/04-automation-contexts/video-script-writer.md`
   - `/Users/pablo/Library/Mobile Documents/com~apple~CloudDocs/Mars/Mars/04-automation-contexts/weekly-video-script-pipeline.md` (when `--weekly`)

## Process

1. **Parse the request.** Extract: theme/context, `--days N` or `--weekly`, optional `--pattern`.
2. **Load context** in the order above. Skip what you don't need.
3. **Pick day roles.** When `--weekly`, apply the day-role distribution from `batched-posting-structure.md`. For shorter packets, choose roles that match the requested theme.
4. **Probe viral-intel freshness, then pick patterns.** Before picking anything, run the probe:
   ```bash
   curl -sf --max-time 5 "http://localhost:3010/api/viral/intelligence?limit=1&days=7"
   ```
   If the request fails, or the response is an empty list (meaning no row newer than 7 days), announce vault-only mode explicitly: "viral intel unreachable or stale (no rows in the last 7 days), generating from vault patterns only". In vault-only mode skip the viral picks, leave `pattern_source` empty, and take shape from `script-patterns.md` instead. Otherwise: from the viral intel, pick 2-3 high-scoring rows whose `pattern_tags` map to roles. **Diversify** — don't pull all from the same creator. If `--pattern` is specified, prefer rows with that tag.
5. **Draft scripts.** For each day:
   - Write hook → beats (2-4) → CTA. Apply the 11-second hook framework.
   - **Voice check:** before finalizing, scan for competitor phrasing leak. If a sentence sounds more like another creator than Pablo, rewrite.
   - Set `pattern_source` to `[{ viral_intel_id, hook_type, pattern_tags }, ...]` for each viral row that actually shaped the script.
6. **Print dry-run JSON.** One object per day with: date, role, title, hook, beats[], cta, tags, platforms, notes (visual/filming), `pattern_source`. Wait for the user to type `approve`, request edits, or reject specific items.
7. **On `approve`:** the Shorts page (CP top nav → "Shorts") is the canonical surface for daily-video filming, NOT the Videos page or the project folder. Two writes per script:
   1. **`POST http://localhost:3010/api/videos`** with the recording-packet shape the Shorts page parses:
      - `status: "scripted"`
      - `category: "building"` (default)
      - `hook`, `script` (full text: hook + beats + cta joined), `cta` — separate fields
      - **`tags`** (these drive the day-role badges on the Shorts card):
        - `"daily-video"` (REQUIRED — it's the slot key)
        - `"type:<contentType-slug>"` e.g. `"type:tech-lesson"`, `"type:reach"`, `"type:reflection"`, `"type:behind-the-scenes"`, `"type:recap"`, `"type:tech"`
        - `"role:<dayRole-slug>"` e.g. `"role:teach-process"`, `"role:reach-format"`, `"role:honesty"`, `"role:failure"`, `"role:real-day"`, `"role:weekly-recap"`, `"role:proof-of-work"`
        - `"script-pack"` + theme tags (e.g. `"nella"`)
      - **`notes`** must be the **section-labeled format** that `getDailyVideoProductionPlan` parses (not Markdown headers — the parser matches `^Label:` line anchors). Required sections:
        ```
        Date: YYYY-MM-DD
        Content type: <e.g. Tech lesson>
        Day role: <e.g. Teach process>
        Topic: <one-line topic>
        Keyword: <slug>

        Day guideline:
        <one-line brief>

        Recording packet:
        Hook: <hook line>

        Script:
        <full script body>

        B-roll / shot list:
        <bullets>

        Edit ideas:
        <pacing, captions, cuts>

        Thumbnail / image idea:
        <first frame description>

        Filming notes:
        <location, A-roll, etc.>

        CTA:
        <cta line>

        ---

        Pattern source (shape only, never wording):
        - viral_intel_id, creator, url, hook_type, pattern_tags borrowed, shape, voice owned
        ```
   2. **Pick a slotting strategy:**
      - **Day-fallback (default):** `PUT http://localhost:3010/api/weekly/<weekKey>` with merged JSON `{ "<dateKey>": { "daily-video": "<videoId>" } }`. Always GET first to merge with existing slot mappings — PUT replaces the whole week. `weekKey` is `YYYY-Www` (e.g. `2026-W19`); `dateKey` is `YYYY-MM-DD` of the target day. This slot is the "unaffiliated" short for the day; renders when no batch is selected.
      - **Batch-attached (when `--batch <runId>` is passed or auto-detected):** `PATCH http://localhost:3010/api/generator-runs/<runId>` with `{ "shortVideoId": "<videoId>" }`. Each batch on a given day can have its own short; the Overview's Short column prefers the current batch's `shortVideoId` over the weekly daily-video. Multiple batches per day = multiple shorts navigable through the existing "BATCH OF POSTS #N OF M" carousel. The post content does NOT need to be related to the short — Pablo treats them as independent.
   **Day-of-week → role mapping** (used to pick the right slot when no specific date is given):
     - Mon: type=Reflection, role=Honesty
     - Tue: type=Tech, role=Proof of work
     - **Wed: type=Tech lesson, role=Teach process** (Nella feature explainers go here)
     - Thu: type=Reach, role=Reach format
     - Fri: type=Reflection, role=Failure
     - Sat: type=Behind the scenes, role=Real day
     - Sun: type=Recap, role=Weekly recap
   Pick the next available slot whose role matches the script's natural fit. Don't double-book — GET the week first and check whether the target dateKey already has a `daily-video` linked.

**Do NOT** call `/api/projects/init` for daily-video shorts — that endpoint is for one-off video projects, not slotted shorts. The Shorts surface only needs the two calls above.
8. **Confirm.** Return: date range, count, day-by-day list with CP video IDs, link to the weekly tracker.

## Output schema (per script)

```json
{
  "date": "2026-05-04",
  "day_role": "tech-lesson | failure-story | recap | reach | build-update | deep-take",
  "title": "Short, hook-led title",
  "hook": "≤11 seconds spoken. Opens with the strongest pattern element.",
  "beats": ["beat 1 (2-4 sec)", "beat 2", "beat 3 (payoff)"],
  "cta": "Loop-back or single explicit ask. Avoid 'follow for more'.",
  "format": "talking_head | screen_demo | voiceover_b_roll | tutorial",
  "visual_notes": "What's on screen. Cuts. B-roll cues. Caption style.",
  "filming_location": "desk / outdoors / on-the-go",
  "tags": ["script-pack", "daily-video", "day-N", "<role>"],
  "pattern_source": [
    { "viral_intel_id": "...", "creator_handle": "...", "hook_type": "...", "pattern_tags": ["..."] }
  ]
}
```

## Voice-leak guard (run on every draft)

Run this gate on every field a human will read (`script`, `hook`, `cta`, `title`, `visual_notes`, `filming_location`, `broll_shotlist`, `edit_ideas`, `filming_notes`). Do not print the dry-run until all checks pass.

**Character scrub (deterministic, not in-model):** write the full dry-run JSON to a temp file and run the shared linter plus a character sweep:

```bash
node /Users/pablo/.claude/skills/voice-post/scripts/lint-text.mjs /tmp/script-pack-dryrun.json
perl -CSD -ne 'print "$.:$_" if /[\x{2026}\x{2018}\x{2019}\x{201C}\x{201D}\x{00A0}]/' /tmp/script-pack-dryrun.json
```

lint-text.mjs must exit 0 (it catches the dash family including `—` U+2014 and `–` U+2013, banned vocab, dead openers, banned hook shapes, and reframes). The perl sweep must print NOTHING (it catches `…` U+2026, curly quotes, and non-breaking spaces; replace with straight ASCII punctuation, and use three periods only if the cadence demands a trailing pause). If either command flags anything, rewrite the offending fields and re-run both before printing the dry-run.

**Phrasing scrub:**
- A direct quote from `viral_intelligence.hook_text` longer than 3 words.
- Patterns Pablo has explicitly avoided in `voice-and-style.md` and `writing-rules.md`: "Stop scrolling.", "Most people get this wrong.", "Save this post.", "Read that again.", "Let that sink in.", any negative-parallelism reframe (`X is not Y, it's Z`), bloated copulas (`serves as`, `stands as`, `marks a`), banned analogy setups (`it's like`, `imagine`, `the engine of`).
- Generic creator-class CTAs: "follow for more", "tag a friend", "drop a 🔥".
- Banned vocabulary from `writing-rules.md` section 4A (delve, harness, unlock, leverage, etc.).

**Self-check:** before printing the dry-run, mentally read the script aloud. If any line sounds like another creator wrote it, or like polished AI prose, rewrite. If you used an em dash anywhere, replace it before printing.

If a check fails, rewrite the offending lines. Do not ship the draft until it passes.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `viral_intelligence` is empty | Worker hasn't run yet, or Codex CLI isn't authed (`docker exec viral-intel-worker codex login status`) | If unauthed: `docker exec -it viral-intel-worker codex login --device-auth`. Then activate the n8n flow. Generate scripts using vault-only context as fallback. |
| All `pattern_source` rows are from the same creator | Diversity rule violated | Re-pick patterns spanning at least 3 creators. |
| CP `POST /api/videos` rejects the body | Schema drift — CP doesn't accept `pattern_source` directly | Embed it inside `notes` as a JSON code block with header `### pattern_source`. CP renders notes verbatim. |
| Script reads like another creator wrote it | Voice-leak guard miss | Apologize, regenerate that line with louder voice anchoring. |

## Related

- Mars vault: `Mars/Mars/03-content-system/research/viral-watchlist.md` (curates the watchlist; vault-is-source-of-truth)
- Sync: `POST http://localhost:3010/api/viral/sync-watchlist` (vault → Supabase, runs on file change or manual)
- Worker: `scripts/viral-intel-worker/` in the openclaw-setup repo (lives on the VM, never reads the vault)
- n8n flow: `viral-intel-ingest` (every 6h, populates `viral_intelligence`)
- Sister skill: `voice-post` (single-feature posts) shares the same voice anchors but doesn't use viral intel
