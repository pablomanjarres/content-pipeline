import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import multer from 'multer'
import { read, write, findById, upsert, remove } from './storage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = 3001
const MEDIA_DIR = path.join(__dirname, '..', '..', 'nella-videos')

app.use(cors())
app.use(express.json())

const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'linkedin', 'x', 'reddit'] as const
function defaultPlatforms() {
  return Object.fromEntries(PLATFORMS.map(p => [p, { caption: '', hashtags: [], posted: false, url: null, postedAt: null }]))
}

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
    platforms: req.body.platforms || defaultPlatforms(),
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

// --- Posts ---
app.get('/api/posts', (_req, res) => {
  res.json(read('posts'))
})

app.get('/api/posts/:id', (req, res) => {
  const post = findById('posts', req.params.id)
  if (!post) return res.status(404).json({ error: 'Not found' })
  res.json(post)
})

app.post('/api/posts', (req, res) => {
  const now = new Date().toISOString()
  const post = {
    id: uuid(),
    title: req.body.title || 'Untitled',
    platform: req.body.platform || 'linkedin',
    status: req.body.status || 'draft',
    category: req.body.category || 'building',
    content: req.body.content || '',
    hook: req.body.hook || '',
    cta: req.body.cta || '',
    linkedVideoId: req.body.linkedVideoId || null,
    url: req.body.url || null,
    tags: req.body.tags || [],
    notes: req.body.notes || '',
    createdAt: now,
    updatedAt: now,
    postedAt: null,
  }
  upsert('posts', post)
  res.status(201).json(post)
})

app.put('/api/posts/:id', (req, res) => {
  const existing = findById('posts', req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const updated = { ...existing, ...req.body, id: req.params.id, updatedAt: new Date().toISOString() }
  upsert('posts', updated)
  res.json(updated)
})

app.patch('/api/posts/:id/status', (req, res) => {
  const existing = findById<any>('posts', req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  existing.status = req.body.status
  existing.updatedAt = new Date().toISOString()
  if (req.body.status === 'posted') existing.postedAt = new Date().toISOString()
  upsert('posts', existing)
  res.json(existing)
})

app.delete('/api/posts/:id', (req, res) => {
  if (remove('posts', req.params.id)) {
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
    platforms: defaultPlatforms(),
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

app.delete('/api/actions/:id', (req, res) => {
  if (remove('actions', req.params.id)) {
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
  const posts = read<any>('posts')

  const byStatus: Record<string, number> = {}
  const byCategory: Record<string, number> = {}
  for (const v of videos) {
    byStatus[v.status] = (byStatus[v.status] || 0) + 1
    byCategory[v.category] = (byCategory[v.category] || 0) + 1
  }

  const postsByStatus: Record<string, number> = {}
  for (const p of posts) {
    postsByStatus[p.status] = (postsByStatus[p.status] || 0) + 1
  }

  res.json({
    totalVideos: videos.length,
    totalClips: clips.length,
    totalIdeas: ideas.length,
    totalPosts: posts.length,
    byStatus,
    byCategory,
    postsByStatus,
  })
})

// --- Weekly Tracker ---
const weeklyPath = () => path.join(__dirname, '..', 'data', 'weekly.json')
const readWeekly = () => JSON.parse(fs.readFileSync(weeklyPath(), 'utf-8'))
const writeWeekly = (data: any) => fs.writeFileSync(weeklyPath(), JSON.stringify(data, null, 2))

app.get('/api/weekly/:weekKey', (req, res) => {
  const raw = readWeekly()
  res.json(raw[req.params.weekKey] || {})
})

app.put('/api/weekly/:weekKey', (req, res) => {
  const raw = readWeekly()
  raw[req.params.weekKey] = req.body
  writeWeekly(raw)
  res.json(raw[req.params.weekKey])
})

// --- Media Upload & Management ---
function weekFolder(weekKey: string): string {
  const dir = path.join(MEDIA_DIR, weekKey)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function dayFolder(weekKey: string, date: string): string {
  const dir = path.join(weekFolder(weekKey), date)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

// Upload files for a specific day
const upload = multer({ dest: '/tmp/content-pipeline-uploads' })
app.post('/api/media/upload/:weekKey/:date', upload.array('files', 20), (req, res) => {
  const dest = dayFolder(req.params.weekKey, req.params.date)
  const files = (req.files as Express.Multer.File[]) || []
  const results = files.map(f => {
    const target = path.join(dest, f.originalname)
    fs.renameSync(f.path, target)
    return { filename: f.originalname, path: target, size: f.size }
  })
  res.json(results)
})

// List files for a day
app.get('/api/media/day/:weekKey/:date', (req, res) => {
  const dir = path.join(MEDIA_DIR, req.params.weekKey, req.params.date)
  if (!fs.existsSync(dir)) return res.json([])
  const files = fs.readdirSync(dir).filter(f => !f.startsWith('.')).map(f => {
    const stat = fs.statSync(path.join(dir, f))
    return { filename: f, path: path.join(dir, f), size: stat.size, modified: stat.mtime }
  })
  res.json(files)
})

// List all files for a week
app.get('/api/media/week/:weekKey', (req, res) => {
  const dir = path.join(MEDIA_DIR, req.params.weekKey)
  if (!fs.existsSync(dir)) return res.json({})
  const result: Record<string, any[]> = {}
  for (const sub of fs.readdirSync(dir)) {
    const subPath = path.join(dir, sub)
    if (fs.statSync(subPath).isDirectory()) {
      result[sub] = fs.readdirSync(subPath).filter(f => !f.startsWith('.')).map(f => {
        const stat = fs.statSync(path.join(subPath, f))
        return { filename: f, path: path.join(subPath, f), size: stat.size }
      })
    }
  }
  res.json(result)
})

// Rename a file
app.post('/api/media/rename', (req, res) => {
  const { oldPath, newName } = req.body
  if (!oldPath || !newName) return res.status(400).json({ error: 'oldPath and newName required' })
  const dir = path.dirname(oldPath)
  const newPath = path.join(dir, newName)
  if (!fs.existsSync(oldPath)) return res.status(404).json({ error: 'File not found' })
  fs.renameSync(oldPath, newPath)
  res.json({ path: newPath, filename: newName })
})

// --- Project Folders ---
// Each content piece (reel, post) gets its own project folder
// nella-videos/{weekKey}/projects/{slug}/
//   project.json, script.md, sources/, exports/

function projectDir(weekKey: string, slug: string): string {
  const dir = path.join(MEDIA_DIR, weekKey, 'projects', slug)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    fs.mkdirSync(path.join(dir, 'sources'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'exports'), { recursive: true })
  }
  return dir
}

// Create/get project folder for a content piece
app.post('/api/projects/init', (req, res) => {
  const { weekKey, slug, title, type } = req.body
  const dir = projectDir(weekKey, slug)
  const metaPath = path.join(dir, 'project.json')

  if (fs.existsSync(metaPath)) {
    return res.json(JSON.parse(fs.readFileSync(metaPath, 'utf-8')))
  }

  const meta = { title, type, slug, weekKey, createdAt: new Date().toISOString() }
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))

  // Create empty script.md
  const scriptContent = type === 'post'
    ? `# ${title}\n\n## Content\n\n\n\n## CTA\n\n`
    : `# ${title}\n\n## Hook\n\n\n\n## Script\n\n\n\n## CTA\n\n`
  fs.writeFileSync(path.join(dir, 'script.md'), scriptContent)

  res.status(201).json(meta)
})

// Browse available source clips (week raw uploads + past weeks)
// MUST be before :weekKey/:slug to avoid route conflict
app.get('/api/projects/browse-sources/:weekKey', (req, res) => {
  const result: Record<string, any[]> = {}

  const weekDir = path.join(MEDIA_DIR, req.params.weekKey)
  if (fs.existsSync(weekDir)) {
    for (const sub of fs.readdirSync(weekDir)) {
      if (sub === 'projects') continue
      const subPath = path.join(weekDir, sub)
      if (fs.statSync(subPath).isDirectory()) {
        const files = fs.readdirSync(subPath).filter(f => !f.startsWith('.')).map(f => ({
          filename: f,
          path: path.join(subPath, f),
          size: fs.statSync(path.join(subPath, f)).size,
          week: req.params.weekKey,
          date: sub,
        }))
        if (files.length > 0) result[`${req.params.weekKey}/${sub}`] = files
      }
    }
  }

  const [yearStr, wStr] = req.params.weekKey.split('-W')
  for (let w = parseInt(wStr) - 1; w >= Math.max(1, parseInt(wStr) - 2); w--) {
    const prevKey = `${yearStr}-W${String(w).padStart(2, '0')}`
    const prevDir = path.join(MEDIA_DIR, prevKey)
    if (!fs.existsSync(prevDir)) continue
    for (const sub of fs.readdirSync(prevDir)) {
      if (sub === 'projects') continue
      const subPath = path.join(prevDir, sub)
      if (fs.statSync(subPath).isDirectory()) {
        const files = fs.readdirSync(subPath).filter(f => !f.startsWith('.')).map(f => ({
          filename: f,
          path: path.join(subPath, f),
          size: fs.statSync(path.join(subPath, f)).size,
          week: prevKey,
          date: sub,
        }))
        if (files.length > 0) result[`${prevKey}/${sub}`] = files
      }
    }
  }

  res.json(result)
})

// Get project info including files
app.get('/api/projects/:weekKey/:slug', (req, res) => {
  const dir = path.join(MEDIA_DIR, req.params.weekKey, 'projects', req.params.slug)
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'Not found' })

  const metaPath = path.join(dir, 'project.json')
  const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf-8')) : {}

  const scriptPath = path.join(dir, 'script.md')
  const script = fs.existsSync(scriptPath) ? fs.readFileSync(scriptPath, 'utf-8') : ''

  const listDir = (sub: string) => {
    const p = path.join(dir, sub)
    if (!fs.existsSync(p)) return []
    return fs.readdirSync(p).filter(f => !f.startsWith('.')).map(f => {
      const stat = fs.statSync(path.join(p, f))
      return { filename: f, path: path.join(p, f), size: stat.size }
    })
  }

  res.json({
    ...meta,
    folderPath: dir,
    script,
    sources: listDir('sources'),
    exports: listDir('exports'),
  })
})

// Save script.md
app.put('/api/projects/:weekKey/:slug/script', (req, res) => {
  const dir = path.join(MEDIA_DIR, req.params.weekKey, 'projects', req.params.slug)
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'Not found' })
  fs.writeFileSync(path.join(dir, 'script.md'), req.body.content)
  res.json({ success: true })
})

// Copy source clips into project (from existing files)
app.post('/api/projects/:weekKey/:slug/sources', (req, res) => {
  const dir = projectDir(req.params.weekKey, req.params.slug)
  const sourcesDir = path.join(dir, 'sources')
  const { files } = req.body // array of { path, filename }
  const results: any[] = []

  for (const f of files) {
    if (!fs.existsSync(f.path)) continue
    const target = path.join(sourcesDir, f.filename)
    fs.copyFileSync(f.path, target)
    results.push({ filename: f.filename, path: target })
  }
  res.json(results)
})

// Upload files into project sources AND week's daily folder
app.post('/api/projects/:weekKey/:slug/upload', upload.array('files', 20), (req, res) => {
  const dir = projectDir(req.params.weekKey, req.params.slug)
  const sourcesDir = path.join(dir, 'sources')
  // Also save to the week's daily folder (today's date)
  const today = new Date().toISOString().split('T')[0]
  const dailyDir = dayFolder(req.params.weekKey, today)

  const files = (req.files as Express.Multer.File[]) || []
  const results = files.map(f => {
    const projectTarget = path.join(sourcesDir, f.originalname)
    const dailyTarget = path.join(dailyDir, f.originalname)

    // Copy to project sources
    fs.copyFileSync(f.path, projectTarget)
    // Move to weekly daily folder (the "global" weekly copy)
    fs.renameSync(f.path, dailyTarget)

    return { filename: f.originalname, projectPath: projectTarget, weeklyPath: dailyTarget, size: f.size }
  })
  res.json(results)
})

// Upload export version
app.post('/api/projects/:weekKey/:slug/exports', upload.single('file'), (req, res) => {
  const dir = projectDir(req.params.weekKey, req.params.slug)
  const exportsDir = path.join(dir, 'exports')
  const f = req.file as Express.Multer.File
  if (!f) return res.status(400).json({ error: 'No file' })

  // Auto-version: v1, v2, v3...
  const existing = fs.readdirSync(exportsDir).filter(n => n.startsWith('v'))
  const nextVersion = existing.length + 1
  const ext = path.extname(f.originalname) || '.mp4'
  const versionName = `v${nextVersion}${ext}`
  const target = path.join(exportsDir, versionName)
  fs.renameSync(f.path, target)

  res.json({ filename: versionName, path: target, version: nextVersion })
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
