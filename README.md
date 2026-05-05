# Content Pipeline

A local-first desktop app and web server for managing short-form video and text post pipelines across LinkedIn videos, Instagram Reels, Threads, TikTok, YouTube Shorts, X, LinkedIn, and Reddit.

Built with React, Express, Electron, and Tailwind CSS. All data stored locally as JSON files — no database, no cloud dependencies.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Framer Motion, Tailwind CSS 4 |
| Backend | Express 5, Multer (uploads), UUID |
| Desktop | Electron 41, electron-builder |
| Build | Vite 8, esbuild, TypeScript 5.9 |
| Dev tools | tsx (TS runner), concurrently, ESLint |

## Project Structure

```
content-pipeline/
├── src/                    # React frontend
│   ├── pages/              # Route pages (Dashboard, Pipeline, Videos, etc.)
│   ├── components/         # Reusable components (WeeklyTracker, DailyMedia, etc.)
│   ├── lib/
│   │   ├── api.ts          # Fetch wrapper for all API calls
│   │   └── types.ts        # TypeScript interfaces and constants
│   ├── App.tsx             # Hash router, nav, layout
│   └── index.css           # Tailwind config, custom properties, glass styles
├── server/
│   ├── index.ts            # Express API server (~1070 lines, all routes)
│   └── storage.ts          # JSON file read/write helpers
├── electron/
│   ├── main.ts             # Electron main process (window, tray, IPC, menus)
│   └── preload.ts          # Context bridge (exposes pickMedia IPC)
├── scripts/
│   └── build-app.js        # Orchestrates vite build + esbuild for Electron
├── public/                 # Static assets (copied to dist/ by Vite)
│   ├── favicon.svg
│   ├── icons.svg           # SVG sprite sheet (social icons)
│   ├── manifest.webmanifest
│   └── icons/              # PWA icons (180, 192, 512px)
├── assets/                 # Electron app icons
│   ├── icon.svg            # Source icon (1024x1024)
│   ├── icon-512.png / icon-1024.png
│   ├── app-icon.icns       # macOS app icon
│   └── tray-icon.png       # Menu bar icon (22x22, template image)
├── data/                   # Local JSON storage (gitignored)
│   ├── config.json         # Project config (activeProject, projects[])
│   └── projects/{id}/      # Per-project data
│       ├── videos.json
│       ├── posts.json
│       ├── ideas.json
│       ├── clips.json
│       ├── actions.json
│       ├── weekly.json
│       ├── repos.json
│       ├── generations.json
│       ├── replies.json
│       └── templates.json
├── dist/                   # Vite build output (gitignored)
├── dist-electron/          # esbuild output (gitignored)
├── dist-app/               # electron-builder output (gitignored)
├── index.html              # HTML template (PWA meta tags, React root)
├── vite.config.ts          # Vite config (proxy, Tailwind, watch ignore)
├── electron-entry.cjs      # Electron entry (loads compiled or tsx-registered)
└── package.json            # Scripts, deps, electron-builder config
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Install

```bash
git clone <repo-url>
cd content-pipeline
npm install
```

### Initialize Data

The `data/` directory is gitignored. Create it on first run:

```bash
mkdir -p data/projects/default
```

Create `data/config.json`:

```json
{
  "activeProject": "default",
  "projects": [
    {
      "id": "default",
      "name": "My Project",
      "color": "#8b5cf6",
      "mediaDir": "/absolute/path/to/your/videos",
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

- `mediaDir` — absolute path to a directory where raw media files are stored, organized by week (`2026-W14/uploads-2026-04-03/`)

Empty data files will be auto-created by the server when it starts.

## Development

### Run in dev mode (web only)

```bash
npm run dev
```

Starts two processes concurrently:
- **Vite** on `http://localhost:5173` — frontend with HMR
- **Express** on `http://localhost:3001` — API server with `tsx watch` (auto-restart on changes)

Vite proxies `/api/*` requests to the Express server.

### Run with Electron

```bash
npm run dev:electron
```

Same as above, plus launches Electron after a 3-second delay. The Electron window loads the Vite dev URL.

### Individual processes

```bash
npm run dev:client   # Vite only
npm run dev:server   # Express only
```

## Production

### Build frontend + check types

```bash
npm run build
```

Runs `tsc -b` (incremental TypeScript build) then `vite build`. Output goes to `dist/`.

### Run production server (no Electron)

```bash
npm start
```

Runs `NODE_ENV=production tsx server/index.ts`. Serves the API and the built frontend from `dist/` on port 3001.

### Build macOS Electron app

```bash
npm run build:app
```

This does three things:
1. Runs `vite build` (frontend to `dist/`)
2. Compiles with esbuild:
   - `electron/main.ts` → `dist-electron/main.mjs`
   - `electron/preload.ts` → `dist-electron/preload.js`
   - `server/index.ts` → `dist-electron/server.mjs`
3. Packages with `electron-builder --mac --dir` to `dist-app/mac-arm64/Content Pipeline.app`

### Install to /Applications

```bash
npm run install:app
```

Builds, copies to `/Applications/Content Pipeline.app`, and code-signs with ad-hoc signature.

**Important:** After rebuilding, you must **quit the running app first**, then run `install:app`. The app bundles `data/` inside the `.app` package — if you update `data/config.json` in the source, you also need to update it inside the installed app at:

```
/Applications/Content Pipeline.app/Contents/Resources/app/data/config.json
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | — | Set to `production` to serve frontend from `dist/` |
| `CONTENT_PIPELINE_ROOT` | project root | Base path for `data/` and `dist/` directories |
| `CONTENT_PIPELINE_PORT` | `3001` | Express server port |
| `PORT` | `3001` | Fallback server port |
| `VITE_PORT` | `5173` | Vite dev server port (used by Electron in dev) |

## Architecture

### Frontend

Hash-based routing in `src/App.tsx` — no React Router. Pages are swapped with `AnimatePresence` for transitions.

Pages:
- **Overview** (`#dashboard`) — stats, weekly tracker, recent activity, daily media
- **Media** (`#videos`) — raw media file browser from `mediaDir`, grouped by day
- **Pipeline** (`#pipeline`) — video pipeline with status columns
- **Posts** (`#posts`) — text post pipeline (LinkedIn, X, Reddit)
- **Ideas** (`#ideas`) — idea backlog, convert to video
- **Engine** (`#engine`) — content generation from git repos
- **Templates** (`#templates`) — outreach message templates
- **Video Detail** (`#video/{id}`) — full video editor
- **Post Detail** (`#post/{id}`) — full post editor

State is managed with React hooks (`useState`, `useEffect`, `useCallback`). No external state library. Each page fetches its own data from the API.

### Backend

Single Express server in `server/index.ts`. All data stored as JSON files via `server/storage.ts`:

- `read<T>(file)` — reads `data/projects/{activeProject}/{file}.json`, creates `[]` if missing
- `write<T>(file, data)` — atomic write via `.tmp` + rename
- `findById(file, id)` — linear search
- `upsert(file, item)` — insert or update by `id`
- `remove(file, id)` — filter and rewrite

Security: only allows connections from `127.0.0.1`, `::1`, and Tailscale CGNAT range (`100.64.0.0/10`).

Media files are served with range request support for video streaming (`/api/media/serve`).

### Electron

The Electron app runs the Express server **in-process** (not as a child process) in production:

```
electron-entry.cjs → dist-electron/main.mjs → imports dist-electron/server.mjs
```

Key details:
- `CONTENT_PIPELINE_ROOT` is set to the app bundle's resource directory
- Window loads `http://localhost:3001` (waits for server with retry loop)
- Tray menu shows live stats, quick navigation, and folder shortcuts (refreshes every 30s)
- IPC handler `pick-media` exports selected items from macOS Photos via AppleScript
- Single-instance lock prevents duplicate app windows
- Custom app menu with keyboard shortcuts (Cmd+1-4 for page navigation)

### Data Model

**Video** — pipeline item for short-form video content:
```
id, title, status (idea → scripted → filming → editing → ready → scheduled → posted),
category (building | studying | workout | gtm), hook, script, cta,
platforms { linkedin, instagram, threads, tiktok, youtube } — video upload targets for LinkedIn, Instagram Reels, Threads, TikTok, and YouTube Shorts, each with caption, hashtags, posted, url,
clipPaths, tags, notes, createdAt, updatedAt
```

**Post** — text post for LinkedIn, X, or Reddit:
```
id, title, platform, status (draft → written → scheduled → posted),
category, content, hook, cta, linkedVideoId, url, tags, notes,
createdAt, updatedAt, postedAt
```

**Idea** — backlog item, convertible to Video:
```
id, title, description, category, hook, tags, convertedToVideoId, createdAt
```

**Weekly Tracker** — keyed by ISO week (`2026-W14`):
```
{ "2026-W14": { tasks data per day } }
```

**Config** — project configuration:
```json
{
  "activeProject": "default",
  "projects": [{
    "id": "default",
    "name": "My Project",
    "color": "#8b5cf6",
    "mediaDir": "/absolute/path/to/videos"
  }]
}
```

### Media Directory Structure

The `mediaDir` is organized by ISO week and upload date:

```
media-root/
├── 2026-W13/
│   └── content/
│       └── {slug}/           # Project folders
│           ├── project.json
│           ├── script.md
│           ├── sources/      # Source clips
│           └── exports/      # Final exports (auto-versioned v1.mp4, v2.mp4)
└── 2026-W14/
    └── uploads-2026-04-03/   # Daily uploads from Photos or file upload
        ├── IMG_3307.mov
        └── IMG_3308.mp4
```

## API Reference

### Config
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config` | Full config |
| GET | `/api/config/active` | Active project |
| PUT | `/api/config/active` | Set active project `{ projectId }` |
| POST | `/api/config/projects` | Create project `{ name, color }` |

### Videos (Pipeline)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/videos` | List all videos |
| POST | `/api/videos` | Create video `{ title, category }` |
| GET | `/api/videos/:id` | Get video |
| PUT | `/api/videos/:id` | Update video |
| DELETE | `/api/videos/:id` | Delete video |
| PATCH | `/api/videos/:id/status` | Update status only `{ status }` |

### Posts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/posts` | List all posts |
| POST | `/api/posts` | Create post `{ title, platform, category }` |
| GET/PUT/DELETE | `/api/posts/:id` | CRUD |
| PATCH | `/api/posts/:id/status` | Update status (auto-sets `postedAt` when posted) |

### Ideas
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/ideas` | List / create |
| POST | `/api/ideas/:id/convert` | Convert idea to video |
| DELETE | `/api/ideas/:id` | Delete |

### Media (Raw Files)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/media` | List week folders |
| GET | `/api/media/all` | All media files with metadata |
| GET | `/api/media/serve?path=` | Stream file (supports range requests) |
| GET | `/api/media/week/:weekKey` | Day folders for a week |
| GET | `/api/media/day/:weekKey/:date` | Files for a specific day |
| POST | `/api/media/upload/:weekKey/:date` | Upload files (max 20) |
| DELETE | `/api/media/file` | Delete file `{ path }` |
| POST | `/api/media/rename` | Rename file `{ path, newName }` |

### Project Folders
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/projects/init` | Create project folder `{ weekKey, slug, title, type }` |
| GET | `/api/projects/browse-sources/:weekKey` | List source clips (current + 2 prev weeks) |
| GET | `/api/projects/:weekKey/:slug` | Get project metadata + files |
| PUT | `/api/projects/:weekKey/:slug/script` | Save script.md |
| POST | `/api/projects/:weekKey/:slug/sources` | Copy source clips into project |
| POST | `/api/projects/:weekKey/:slug/upload` | Upload to sources |
| POST | `/api/projects/:weekKey/:slug/exports` | Upload export (auto-versioned) |

### Content Engine
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/repos` | Manage registered git repos |
| GET | `/api/repos/:id/activity?from=&to=` | Git log between dates |
| GET/POST | `/api/generations` | Content generations |
| PUT | `/api/generations/:id` | Update generation |
| POST | `/api/generations/:id/apply/:index` | Apply generated content as video/post |
| GET/POST | `/api/replies` | Reply requests |
| PUT | `/api/replies/:id` | Update reply |

### Other
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stats` | Aggregate counts by status/category |
| GET/PUT | `/api/weekly/:weekKey` | Weekly tracker data |
| GET/PUT | `/api/frozen` | Frozen pipeline tasks |
| CRUD | `/api/templates` | Outreach templates |
| GET/POST | `/api/actions` | Action queue |
| GET | `/api/actions/pending` | Pending actions only |
| PATCH | `/api/actions/:id` | Update action status |

## Common Modifications

### Adding a new page

1. Create `src/pages/MyPage.tsx`
2. Add route case in `src/App.tsx` — update the `page` variable switch and the render section
3. Add nav link to the `NAV` array in `App.tsx`

### Adding a new API route

1. Add the route handler in `server/index.ts`
2. If it needs its own data file, use `read('myfile')` — auto-creates `data/projects/{id}/myfile.json`
3. Add the fetch function in `src/lib/api.ts`
4. Add TypeScript types in `src/lib/types.ts`

### Adding a new pipeline status

1. Update `Status` type in `src/lib/types.ts`
2. Add to `STATUS_ORDER`, `STATUS_LABELS`, `STATUS_COLORS`
3. The pipeline page reads these arrays dynamically — no page changes needed

### Adding a new platform

1. Add to `Platform` type in `src/lib/types.ts`
2. Add to `VIDEO_PLATFORMS` or `POST_PLATFORMS` array
3. Add label in `PLATFORM_LABELS`
4. Add to the video or post platform defaults in `server/index.ts`
5. The `defaultVideoPlatforms()` function auto-generates entries for video upload platforms

### Adding a new content category

1. Add to `Category` type in `src/lib/types.ts`
2. Add color in `CATEGORY_COLORS`

### Modifying the Electron tray menu

Edit `buildTrayMenu()` in `electron/main.ts`. The menu refreshes every 30 seconds with live stats from the API.

### Modifying the app icon

1. Replace `assets/icon.svg` (1024x1024 source)
2. Generate PNGs: `icon-512.png`, `icon-1024.png`
3. Generate `assets/app-icon.icns` for macOS (use `iconutil` or an icon converter)
4. For PWA home screen: replace files in `public/icons/` — must be edge-to-edge with no padding or rounded corners (iOS/Android apply their own mask)
   - `apple-touch-icon.png` — 180x180
   - `icon-192.png` — 192x192
   - `icon-512.png` — 512x512
5. Rebuild: `npm run install:app`

### Changing the server port

Set `CONTENT_PIPELINE_PORT=4000` in your environment, or edit the default in `server/index.ts`.

## Styling

- Dark mode only — black background (`#000`), white text
- Glass-morphism: `.glass` class with `backdrop-filter: blur(12px)` and inset borders
- Tailwind CSS 4 with custom properties defined in `src/index.css`
- Safe area insets for notched devices (`viewport-fit=cover`)
- Fonts: Inter (body text), Instrument Serif (accent headings)

## PWA Support

The app can be added to an iPhone/iPad home screen via Safari's "Add to Home Screen":

- `public/manifest.webmanifest` — app name, icons, standalone display mode
- `public/icons/apple-touch-icon.png` — 180x180 home screen icon
- Meta tags in `index.html`: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`
- No service worker — requires active network connection

## Network Access

The server binds to `0.0.0.0:3001` and restricts access to:
- Localhost (`127.0.0.1`, `::1`)
- Tailscale CGNAT range (`100.64.0.0/10`)

All other IPs receive a `403 Forbidden` response.

Access from your phone/tablet over Tailscale: `http://<tailscale-ip>:3001`

## Troubleshooting

### Server won't start: `Cannot read properties of undefined (reading 'mediaDir')`

`data/config.json` is missing or has no projects. See [Initialize Data](#initialize-data).

### Electron app shows blank black screen

The bundled server is crashing. Check the config inside the app bundle:
```
/Applications/Content Pipeline.app/Contents/Resources/app/data/config.json
```
Ensure it has a valid project with an absolute `mediaDir` path.

### Media page shows no files or fewer files than expected

The Media page only shows files from the `mediaDir` specified in `config.json`. Verify:
1. The path is correct and exists
2. Files are organized in `{weekKey}/uploads-{date}/` subdirectories
3. The `mediaDir` is an absolute path (required when running as an Electron app)

### Changes not reflected after rebuild

The Electron app bundles its own copies of `dist/`, `data/`, and the compiled server inside the `.app` package. After any code or config change:

1. Quit the running Electron app (Cmd+Q)
2. Run `npm run install:app`
3. If you only changed data/config, you can directly edit the bundled copy instead of rebuilding

### TypeScript build errors

Run `npm run build` to see all errors. Common issues:
- Unused imports — remove them
- Framer Motion `ease` arrays — add `as const` suffix
- Implicit `any` on mapped items — add type assertions

## npm Scripts Reference

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `concurrently "vite" "tsx watch server/index.ts"` | Dev mode (web) |
| `dev:client` | `vite` | Frontend only |
| `dev:server` | `tsx watch server/index.ts` | Backend only |
| `dev:electron` | `concurrently "vite" "tsx watch server/index.ts" "sleep 3 && electron ."` | Dev mode with Electron |
| `build` | `tsc -b && vite build` | Type-check + build frontend |
| `build:app` | `node scripts/build-app.js && electron-builder --mac --dir` | Full Electron app build |
| `install:app` | Builds + copies to /Applications + code-signs | Install macOS app |
| `start` | `NODE_ENV=production tsx server/index.ts` | Production server |
| `lint` | `eslint .` | Lint check |
| `preview` | `vite preview` | Preview production build |
