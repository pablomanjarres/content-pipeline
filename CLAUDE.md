# Content Pipeline

Local-first dashboard for managing short-form video content pipeline.

## Quick Start

```bash
npm run dev          # Start both frontend (5173) and API server (3001)
npm run dev:client   # Frontend only
npm run dev:server   # API only
```

## Architecture

- **Frontend**: Vite + React + TypeScript + Tailwind CSS v4
- **Backend**: Express.js REST API on port 3001
- **Storage**: JSON files in `data/` (videos.json, ideas.json, clips.json)
- **Media**: Raw clips stored in `/Users/pablo/Projects/nella-videos/` (outside repo)

## Data Flow

The Claude skill (`/content-pipeline`) and the web dashboard both read/write the same JSON files in `data/`.

## Pipeline Statuses

idea → scripted → filming → editing → ready → scheduled → posted

## Categories

- building (startup content)
- studying (learning content)
- workout (fitness/discipline content)
