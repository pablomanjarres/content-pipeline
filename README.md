# Content Pipeline

> Every platform, every draft, every lead — one local-first desktop app that never phones home.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React_19-149ECA?style=flat&logo=react&logoColor=white)
![Electron](https://img.shields.io/badge/Electron_41-2C2E3B?style=flat&logo=electron&logoColor=white)
![Express](https://img.shields.io/badge/Express_5-000000?style=flat&logo=express&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?style=flat&logo=tailwindcss&logoColor=white)
![Vite](https://img.shields.io/badge/Vite_8-646CFF?style=flat&logo=vite&logoColor=white)
![status](https://img.shields.io/badge/status-shipped-22c55e?style=flat)
[![Portfolio](https://img.shields.io/badge/portfolio-pablomanjarres.com-c8542a?style=flat)](https://pablomanjarres.com/portfolio/projects/content-pipeline)

The private command center I run my entire content operation from. It tracks short-form video and text posts through their full lifecycle across seven platforms, runs my outbound on X, and stages a shipped feature as platform-native posts plus a video. The drafting is done by my own agents — Claude Code skills and a worker VM — that read this app's memory and write candidates back into it; Content Pipeline is the system of record around them: memory, grading, per-platform rate caps, approval, and two-way vault sync. It ships as a macOS menu-bar app with an Express server running in-process, and every byte of pipeline data is JSON on my disk.

## Highlights

- **Outbound pipeline for X.** Reply, DM, and repost candidates arrive in three angles (empathetic, technical, contrarian), ranked by quality score and tier (T1–T3), with a per-platform active-queue cap that returns `429` and fires a Pushover alert when a bucket fills.
- **Per-lead memory store.** A markdown CRM vault (leads, entities, insights, self-context) that round-trips my manual edits and serves `/api/memory/context` to the drafter, so every reply remembers who I've already talked to.
- **Voice-post fan-out.** A feature description resolves to voice anchors from my Obsidian vault, then a run captures platform-native posts, a Forge video task, and a short-video script.
- **Two-way Obsidian sync.** Writes posts, videos, and runs back to the Mars vault and captures my manual edits into `voice-anchors/edits.md`, so the drafter learns my corrections.
- **Viral intelligence.** Parses a tracked-creator watchlist, syncs it to Supabase, and pulls scored recent viral posts to shape script *structure* — never the wording.
- **Local-first by default.** All state is JSON on disk (atomic `.tmp` + rename); the server answers only localhost and Tailscale (`100.64.0.0/10`), 403 to everything else.

## How it works

A single React 19 SPA (hash routing, no router library) talks to one Express 5 server. The app has no database of its own: pipeline content is per-project JSON on disk, written atomically, while watchlist, viral, and search state proxy out to Supabase and Algolia. A local mars-rag recall service and the LLM drafting both live outside this repo — Claude Code skills and VM workers POST candidates in and read the memory store back out.

```
server/
  index.ts          # ~3,100-line Express API, 29 route groups
  storage.ts        # atomic JSON store (read/write/upsert/remove)
  memory.ts         # per-lead markdown CRM vault, round-trips manual edits
  obsidian-sync.ts  # two-way sync with the Mars Obsidian vault
  viral-sync.ts     # creator watchlist -> Supabase, scored viral intel
  brolls.ts         # planned-shot b-roll catalog + file tracking
  watchlist.ts      # tiered radar handles (Supabase-backed)
  openclaw-admin.ts # remote start/stop of VM worker pools
electron/
  main.ts           # menu-bar tray w/ live stats, single-instance lock
```

In Electron production the server runs **in-process**, not as a child: `electron-entry.cjs` boots the compiled Electron main, which imports the bundled server (`server.mjs`) and starts Express inside the app. The tray refreshes live pipeline stats every 30s. Video files are served with HTTP range support for streaming.

## Tech stack

React 19 · Framer Motion · Tailwind CSS 4 · Express 5 · Electron 41 · TypeScript 5.9 · Vite 8 / esbuild. Integrations: Supabase, Algolia, Postiz (scheduling), Tailscale (network), Pushover (alerts).

## Getting started

```bash
git clone https://github.com/pablomanjarres/content-pipeline.git
cd content-pipeline
npm install
```

The `data/` directory is local-only (gitignored). Create a project on first run:

```bash
mkdir -p data/projects/default
```

`data/config.json`:

```json
{
  "activeProject": "default",
  "projects": [
    { "id": "default", "name": "My Project", "color": "#f97316", "mediaDir": "/absolute/path/to/media" }
  ]
}
```

Run it:

```bash
npm run dev            # Vite on :5173 + Express on :3010 (proxied)
npm run dev:electron   # same, plus the desktop app
npm run install:app    # build + install "Content Pipeline.app" to /Applications
```

The outbound, viral, and search subsystems are optional and need credentials. The core pipeline runs fully offline without them:

```bash
# .env (optional — only for outbound / viral intelligence)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

---

Part of my portfolio → [pablomanjarres.com/portfolio/projects/content-pipeline](https://pablomanjarres.com/portfolio/projects/content-pipeline)