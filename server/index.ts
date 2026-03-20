import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import { read, write, findById, upsert, remove } from './storage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = 3001
const MEDIA_DIR = path.join(__dirname, '..', '..', 'nella-videos')

app.use(cors())
app.use(express.json())

// Ensure media dir exists
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true })
}

// --- Videos ---
app.get('/api/videos', (_req, res) => {
  res.json(read('videos'))
})

app.get('/api/videos/:id', (req, res) => {
  const video = findById('videos', req.params.id)
  if (!video) return res.status(404).json({ error: 'Not found' })
  res.json(video)
})

app.post('/api/videos', (req, res) => {
  const now = new Date().toISOString()
  const video = {
    id: uuid(),
    title: req.body.title || 'Untitled',
    status: req.body.status || 'idea',
    category: req.body.category || 'building',
    hook: req.body.hook || '',
    script: req.body.script || '',
    cta: req.body.cta || '',
    platforms: req.body.platforms || {
      instagram: { caption: '', hashtags: [], posted: false, url: null, postedAt: null },
      tiktok: { caption: '', hashtags: [], posted: false, url: null, postedAt: null },
      youtube: { caption: '', hashtags: [], posted: false, url: null, postedAt: null },
    },
    clipPaths: req.body.clipPaths || [],
    tags: req.body.tags || [],
    notes: req.body.notes || '',
    createdAt: now,
    updatedAt: now,
  }
  upsert('videos', video)
  res.status(201).json(video)
})

app.put('/api/videos/:id', (req, res) => {
  const existing = findById('videos', req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const updated = { ...existing, ...req.body, id: req.params.id, updatedAt: new Date().toISOString() }
  upsert('videos', updated)
  res.json(updated)
})

app.patch('/api/videos/:id/status', (req, res) => {
  const existing = findById<any>('videos', req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  existing.status = req.body.status
  existing.updatedAt = new Date().toISOString()
  upsert('videos', existing)
  res.json(existing)
})

app.delete('/api/videos/:id', (req, res) => {
  if (remove('videos', req.params.id)) {
    res.json({ success: true })
  } else {
    res.status(404).json({ error: 'Not found' })
  }
})

// --- Clips ---
app.get('/api/clips', (_req, res) => {
  res.json(read('clips'))
})

app.post('/api/clips', (req, res) => {
  const clip = {
    id: uuid(),
    filename: req.body.filename || '',
    path: req.body.path || '',
    duration: req.body.duration || '',
    category: req.body.category || null,
    tags: req.body.tags || [],
    notes: req.body.notes || '',
    linkedVideoIds: req.body.linkedVideoIds || [],
    createdAt: new Date().toISOString(),
  }
  upsert('clips', clip)
  res.status(201).json(clip)
})

app.delete('/api/clips/:id', (req, res) => {
  if (remove('clips', req.params.id)) {
    res.json({ success: true })
  } else {
    res.status(404).json({ error: 'Not found' })
  }
})

// --- Ideas ---
app.get('/api/ideas', (_req, res) => {
  res.json(read('ideas'))
})

app.post('/api/ideas', (req, res) => {
  const idea = {
    id: uuid(),
    title: req.body.title || '',
    description: req.body.description || '',
    category: req.body.category || null,
    hook: req.body.hook || '',
    tags: req.body.tags || [],
    convertedToVideoId: null,
    createdAt: new Date().toISOString(),
  }
  upsert('ideas', idea)
  res.status(201).json(idea)
})

app.post('/api/ideas/:id/convert', (req, res) => {
  const idea = findById<any>('ideas', req.params.id)
  if (!idea) return res.status(404).json({ error: 'Not found' })

  const now = new Date().toISOString()
  const video = {
    id: uuid(),
    title: idea.title,
    status: 'idea' as const,
    category: idea.category || 'building',
    hook: idea.hook || '',
    script: '',
    cta: '',
    platforms: {
      instagram: { caption: '', hashtags: [], posted: false, url: null, postedAt: null },
      tiktok: { caption: '', hashtags: [], posted: false, url: null, postedAt: null },
      youtube: { caption: '', hashtags: [], posted: false, url: null, postedAt: null },
    },
    clipPaths: [],
    tags: idea.tags || [],
    notes: idea.description || '',
    createdAt: now,
    updatedAt: now,
  }
  upsert('videos', video)

  idea.convertedToVideoId = video.id
  upsert('ideas', idea)

  res.status(201).json(video)
})

app.delete('/api/ideas/:id', (req, res) => {
  if (remove('ideas', req.params.id)) {
    res.json({ success: true })
  } else {
    res.status(404).json({ error: 'Not found' })
  }
})

// --- Stats ---
app.get('/api/stats', (_req, res) => {
  const videos = read<any>('videos')
  const clips = read<any>('clips')
  const ideas = read<any>('ideas')

  const byStatus: Record<string, number> = {}
  const byCategory: Record<string, number> = {}
  for (const v of videos) {
    byStatus[v.status] = (byStatus[v.status] || 0) + 1
    byCategory[v.category] = (byCategory[v.category] || 0) + 1
  }

  res.json({
    totalVideos: videos.length,
    totalClips: clips.length,
    totalIdeas: ideas.length,
    byStatus,
    byCategory,
  })
})

// --- Actions (Claude Code queue) ---
app.get('/api/actions', (_req, res) => {
  res.json(read('actions'))
})

app.get('/api/actions/pending', (_req, res) => {
  const actions = read<any>('actions').filter((a: any) => a.status === 'pending')
  res.json(actions)
})

app.post('/api/actions', (req, res) => {
  const action = {
    id: uuid(),
    type: req.body.type,
    videoId: req.body.videoId || null,
    videoTitle: req.body.videoTitle || null,
    params: req.body.params || {},
    status: 'pending',
    result: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
  }
  upsert('actions', action)
  res.status(201).json(action)
})

app.patch('/api/actions/:id', (req, res) => {
  const existing = findById<any>('actions', req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const updated = { ...existing, ...req.body, id: req.params.id }
  upsert('actions', updated)
  res.json(updated)
})

// --- Media directory listing ---
app.get('/api/media', (_req, res) => {
  try {
    const files = fs.readdirSync(MEDIA_DIR).filter(f => !f.startsWith('.'))
    res.json(files)
  } catch {
    res.json([])
  }
})

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'dist')
  app.use(express.static(distPath))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`Content Pipeline API running on http://localhost:${PORT}`)
  console.log(`Media directory: ${MEDIA_DIR}`)
})
