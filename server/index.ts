import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import multer from 'multer'
import { execSync, spawn } from 'child_process'
import { read, write, findById, upsert, remove } from './storage.js'
import * as obsidian from './obsidian-sync.js'
import * as memory from './memory.js'
import { sendPushover, shouldAlert, markAlerted } from './notifications.js'
import {
  searchIndex as algoliaSearch,
  indexDms, indexVoiceAnchors, indexLeads,
  ALGOLIA_INDICES,
  type AlgoliaIndex,
} from './algolia.js'
import { loadWatchlistFromVault, syncWatchlistToSupabase, fetchRecentIntel } from './viral-sync.js'
import {
  listHandles as listWatchlistHandles,
  createHandle as createWatchlistHandle,
  patchHandle as patchWatchlistHandle,
  deleteHandle as deleteWatchlistHandle,
  statsHandles as statsWatchlistHandles,
} from './watchlist.js'
import {
  getStatus as getOpenclawAdminStatus,
  controlPool as controlOpenclawPool,
  controlService as controlOpenclawService,
} from './openclaw-admin.js'
import { registerPaperclipRoutes } from './paperclip.js'

// Load ~/.openclaw/.env so triggers proxy (and any future feature) sees Supabase creds.
// We use `bash -lc` so $(security find-generic-password ...) substitutions evaluate.
try {
  const envPath = path.join(os.homedir(), '.openclaw', '.env')
  if (fs.existsSync(envPath)) {
    const out = execSync(`bash -lc 'set -a; . "${envPath}"; set +a; env'`, { encoding: 'utf-8' })
    for (const line of out.split('\n')) {
      const i = line.indexOf('=')
      if (i <= 0) continue
      const k = line.slice(0, i)
      if (process.env[k] !== undefined) continue
      process.env[k] = line.slice(i + 1)
    }
  }
} catch (e) {
  console.warn('[env] failed to load ~/.openclaw/.env:', (e as Error).message)
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const upload = multer({ dest: path.join(os.tmpdir(), 'content-pipeline-uploads') })
const PORT = parseInt(process.env.PORT || '3001', 10)
const PROJECT_ROOT = process.env.CONTENT_PIPELINE_ROOT || path.join(__dirname, '..')
const APP_ROOT = process.env.CONTENT_PIPELINE_APP_ROOT || path.join(__dirname, '..')
const DATA_ROOT = path.join(PROJECT_ROOT, 'data')
const CONFIG_PATH = path.join(DATA_ROOT, 'config.json')
const DATA_FILES = ['videos', 'ideas', 'clips', 'posts', 'actions', 'templates', 'sent-dms', 'generator-runs']
const ICLOUD_CP_ROOT = path.join(os.homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'Content Pipeline')
const ICLOUD_DATA_ROOT = path.join(ICLOUD_CP_ROOT, 'data')

// Only allow localhost and Tailscale CGNAT (100.64.0.0/10)
app.use((req, res, next) => {
  const raw = req.socket.remoteAddress ?? ''
  const ip = raw.replace(/^::ffff:/, '')
  if (ip === '127.0.0.1' || ip === '::1') { next(); return }
  const parts = ip.split('.')
  if (parts.length === 4) {
    const first = parseInt(parts[0], 10)
    const second = parseInt(parts[1], 10)
    if (first === 100 && second >= 64 && second <= 127) { next(); return }
  }
  res.status(403).json({ error: 'Access restricted to Tailscale network' })
})

app.use(cors())
app.use(express.json())

// --- Project management ---
function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
}

function writeConfig(config: any) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
  mirrorDataFile(CONFIG_PATH)
}

function mirrorDataFile(fp: string): void {
  try {
    if (!fs.existsSync(path.dirname(ICLOUD_CP_ROOT))) return
    const rel = path.relative(DATA_ROOT, fp)
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return
    const target = path.join(ICLOUD_DATA_ROOT, rel)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(fp, target)
  } catch {
    // The local write is the source of truth; iCloud mirroring is best-effort.
  }
}

function getActiveProject() {
  const config = readConfig()
  return config.projects.find((p: any) => p.id === config.activeProject) || config.projects[0]
}

function getMediaDir(): string {
  return getActiveProject().mediaDir
}

function getImagesDir(): string {
  return getActiveProject().imagesDir || ''
}

function getProjectDataDir(): string {
  const project = getActiveProject()
  const dir = path.join(DATA_ROOT, 'projects', project.id)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    // Initialize empty data files
    for (const file of DATA_FILES) {
      const fp = path.join(dir, `${file}.json`)
      if (!fs.existsSync(fp)) fs.writeFileSync(fp, '[]')
    }
    fs.writeFileSync(path.join(dir, 'weekly.json'), '{}')
  }
  return dir
}

function unlinkVideoReferences(videoId: string): void {
  const weeklyFile = path.join(getProjectDataDir(), 'weekly.json')
  if (fs.existsSync(weeklyFile)) {
    const weekly = JSON.parse(fs.readFileSync(weeklyFile, 'utf-8'))
    let weeklyChanged = false

    for (const weekData of Object.values(weekly) as Record<string, Record<string, unknown>>[]) {
      if (!weekData || typeof weekData !== 'object') continue

      for (const [dateKey, dayData] of Object.entries(weekData)) {
        if (!dayData || typeof dayData !== 'object') continue

        for (const [taskKey, value] of Object.entries(dayData)) {
          if (value === videoId) {
            delete dayData[taskKey]
            weeklyChanged = true
          }
        }

        if (Object.keys(dayData).length === 0) delete weekData[dateKey]
      }
    }

    if (weeklyChanged) {
      fs.writeFileSync(weeklyFile, JSON.stringify(weekly, null, 2))
      mirrorDataFile(weeklyFile)
    }
  }

  const runs = read<any>('generator-runs')
  let runsChanged = false
  const changedRuns: any[] = []
  const updatedRuns = runs.map((run: any) => {
    const updates: any = {}
    if (run.videoId === videoId) updates.videoId = null
    if (run.shortVideoId === videoId) updates.shortVideoId = null
    if (Object.keys(updates).length === 0) return run

    runsChanged = true
    const updated = { ...run, ...updates, updatedAt: new Date().toISOString() }
    changedRuns.push(updated)
    return updated
  })

  if (runsChanged) {
    write('generator-runs', updatedRuns)
    changedRuns.forEach((run: any) => obsidian.syncRun(run))
  }
}

// Project CRUD
app.get('/api/config', (_req, res) => res.json(readConfig()))

app.get('/api/config/active', (_req, res) => res.json(getActiveProject()))

app.get('/api/storage', (_req, res) => {
  res.json({
    projectRoot: PROJECT_ROOT,
    dataRoot: DATA_ROOT,
    configPath: CONFIG_PATH,
    iCloudMirrorRoot: ICLOUD_CP_ROOT,
    iCloudDataRoot: ICLOUD_DATA_ROOT,
    activeProject: getActiveProject(),
    localFirst: !PROJECT_ROOT.includes('Mobile Documents/com~apple~CloudDocs'),
    iCloudBacked: fs.existsSync(path.dirname(ICLOUD_CP_ROOT)),
  })
})

app.put('/api/config/active', (req, res) => {
  const config = readConfig()
  config.activeProject = req.body.projectId
  writeConfig(config)
  res.json(getActiveProject())
})

app.post('/api/config/projects', (req, res) => {
  const config = readConfig()
  const { name, color } = req.body
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const mediaParent = path.dirname(getMediaDir())
  const mediaDir = path.join(mediaParent, `${id}-videos`)
  const imagesDir = path.join(mediaParent, `${id}-images`)

  if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true })
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true })

  const DEFAULT_FROZEN = ['ig-short', 'tiktok-short', 'yt-short', 'reddit-post', 'yt-video']
  const project = { id, name, color: color || '#8b5cf6', mediaDir, imagesDir, frozenTasks: DEFAULT_FROZEN, createdAt: new Date().toISOString() }
  config.projects.push(project)
  config.activeProject = id
  writeConfig(config)

  // Initialize data dir
  getProjectDataDir()

  res.status(201).json(project)
})

const VIDEO_PLATFORMS = ['linkedin', 'instagram', 'threads', 'tiktok', 'youtube'] as const
function defaultVideoPlatforms(seed?: Record<string, any>) {
  return Object.fromEntries(VIDEO_PLATFORMS.map(p => [p, {
    caption: seed?.[p]?.caption || '',
    hashtags: Array.isArray(seed?.[p]?.hashtags) ? seed[p].hashtags : [],
    posted: Boolean(seed?.[p]?.posted),
    url: seed?.[p]?.url || null,
    postedAt: seed?.[p]?.postedAt || null,
  }]))
}

function contentSlug(s: string): string {
  return (s || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'untitled'
}

function weekKeyForDate(iso?: string): string {
  const date = iso ? new Date(iso) : new Date()
  const day = date.getDay()
  const monday = new Date(date)
  monday.setDate(date.getDate() - ((day + 6) % 7))
  const jan1 = new Date(monday.getFullYear(), 0, 1)
  const weekNum = Math.ceil(((monday.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
  return `${monday.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

function syncPostProjectFile(post: any): void {
  try {
    const weekKey = weekKeyForDate(post.createdAt)
    const slug = contentSlug(post.title || post.id)
    const dir = projectDir(weekKey, slug)
    const metaPath = path.join(dir, 'project.json')
    const meta = {
      title: post.title || 'Untitled',
      type: 'post',
      slug,
      weekKey,
      postId: post.id,
      platform: post.platform,
      updatedAt: post.updatedAt,
    }
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))
    const sections = [
      `# ${post.title || 'Untitled'}`,
      '',
      '## Hook',
      '',
      post.hook || '',
      '',
      '## Content',
      '',
      post.content || '',
      '',
      '## CTA',
      '',
      post.cta || '',
      '',
      '## Notes',
      '',
      post.notes || '',
      '',
    ]
    fs.writeFileSync(path.join(dir, 'script.md'), sections.join('\n'))
  } catch (e) {
    console.error('[post-project-sync] failed:', e)
  }
}

type PostMediaUpdate = {
  mediaPath?: string | null
  mediaKind?: string | null
  mediaStatus?: string
}

type ServerPost = {
  id: string
  platform?: string
  generatorRunId?: string | null
  mediaPath?: string | null
  mediaKind?: string | null
  mediaStatus?: string
  updatedAt?: string
  [key: string]: unknown
}

type ServerRun = {
  id: string
  postIds?: string[]
  mediaPath?: string | null
  mediaKind?: string | null
  updatedAt?: string
  [key: string]: unknown
}

function applyMediaFields(post: ServerPost, update: PostMediaUpdate): ServerPost {
  const next = { ...post }
  if (update.mediaPath !== undefined) next.mediaPath = update.mediaPath
  if (update.mediaKind !== undefined) next.mediaKind = update.mediaKind
  if (update.mediaStatus !== undefined) next.mediaStatus = update.mediaStatus
  return next
}

function updatePostMediaAcrossPlatform(postId: string, update: PostMediaUpdate): ServerPost | null {
  const posts = read<ServerPost>('posts')
  const existing = posts.find((p) => p.id === postId)
  if (!existing) return null

  const runId = existing.generatorRunId
  const run = runId ? findById<ServerRun>('generator-runs', runId) : null
  const runPostIds = new Set(Array.isArray(run?.postIds) ? run.postIds : [])
  const runPosts = runId
    ? posts.filter((p) => p.generatorRunId === runId || runPostIds.has(p.id))
    : [existing]
  const hasAnyExistingMedia = Boolean(run?.mediaPath) || runPosts.some((p) => Boolean(p.mediaPath))
  const allPostsShareThisMedia = runPosts.every((p) =>
    (p.mediaPath || null) === (existing.mediaPath || null) &&
    (p.mediaKind || null) === (existing.mediaKind || null) &&
    (p.mediaStatus || 'none') === (existing.mediaStatus || 'none')
  )
  const addingFirstMedia = update.mediaPath !== undefined && Boolean(update.mediaPath) && !hasAnyExistingMedia
  const removingSharedMedia = update.mediaPath === null && allPostsShareThisMedia
  const shareAcrossRun = Boolean(runId) && (addingFirstMedia || removingSharedMedia)
  const now = new Date().toISOString()

  const targetIds = new Set(
    runPosts
      .filter((p) => shareAcrossRun || p.platform === existing.platform || p.id === existing.id)
    .map((p) => p.id)
  )
  const changedPosts: ServerPost[] = []
  const updatedPosts = posts.map((p) => {
    if (!targetIds.has(p.id)) return p
    const updated = { ...applyMediaFields(p, update), updatedAt: now }
    changedPosts.push(updated)
    return updated
  })

  write('posts', updatedPosts)
  changedPosts.forEach((p) => obsidian.syncPost(p))

  if (run && shareAcrossRun) {
    const updatedRun = {
      ...run,
      mediaPath: update.mediaPath !== undefined ? update.mediaPath : run.mediaPath,
      mediaKind: update.mediaKind !== undefined ? update.mediaKind : run.mediaKind,
      updatedAt: now,
    }
    upsert('generator-runs', updatedRun)
    obsidian.syncRun(updatedRun)
  }

  return updatedPosts.find((p) => p.id === postId) || null
}

// Ensure media dir exists on startup
const _initMediaDir = getMediaDir()
if (!fs.existsSync(_initMediaDir)) {
  fs.mkdirSync(_initMediaDir, { recursive: true })
}

// One-time migration: set default frozen tasks if not present
{
  const config = readConfig()
  let changed = false
  for (const p of config.projects) {
    if (!p.frozenTasks) {
      p.frozenTasks = ['ig-short', 'tiktok-short', 'yt-short', 'reddit-post', 'yt-video']
      changed = true
    }
    if (!p.imagesDir) {
      p.imagesDir = path.join(path.dirname(p.mediaDir || getMediaDir()), 'images')
      changed = true
    }
    if (p.mediaDir && !fs.existsSync(p.mediaDir)) fs.mkdirSync(p.mediaDir, { recursive: true })
    if (p.imagesDir && !fs.existsSync(p.imagesDir)) fs.mkdirSync(p.imagesDir, { recursive: true })
  }
  if (changed) writeConfig(config)
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
    platforms: defaultVideoPlatforms(req.body.platforms),
    clipPaths: req.body.clipPaths || [],
    tags: req.body.tags || [],
    notes: req.body.notes || '',
    createdAt: now,
    updatedAt: now,
  }
  upsert('videos', video)
  obsidian.syncVideo(video)
  res.status(201).json(video)
})

app.put('/api/videos/:id', (req, res) => {
  const existing = findById('videos', req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const updated = { ...existing, ...req.body, id: req.params.id, updatedAt: new Date().toISOString() }
  updated.platforms = defaultVideoPlatforms(updated.platforms)
  upsert('videos', updated)
  obsidian.syncVideo(updated)
  res.json(updated)
})

app.patch('/api/videos/:id/status', (req, res) => {
  const existing = findById<any>('videos', req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  existing.status = req.body.status
  existing.updatedAt = new Date().toISOString()
  upsert('videos', existing)
  obsidian.syncVideo(existing)
  res.json(existing)
})

app.delete('/api/videos/:id', (req, res) => {
  if (remove('videos', req.params.id)) {
    unlinkVideoReferences(req.params.id)
    obsidian.deleteVideo(req.params.id)
    res.json({ success: true })
  } else {
    res.status(404).json({ error: 'Not found' })
  }
})

// Upload a clip for a short-video draft. The first uploaded clip becomes the thumbnail/preview on the dashboard card.
app.post('/api/videos/:id/upload-clip', upload.single('file'), (req, res) => {
  const existing = findById<any>('videos', req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const file = req.file as Express.Multer.File | undefined
  if (!file) return res.status(400).json({ error: 'file required (multipart field "file")' })

  const dir = path.join(getMediaDir(), 'short-videos', req.params.id)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const target = path.join(dir, file.originalname)
  fs.renameSync(file.path, target)

  existing.clipPaths = [target, ...((existing.clipPaths || []).filter((p: string) => p !== target))]
  existing.updatedAt = new Date().toISOString()
  upsert('videos', existing)
  obsidian.syncVideo(existing)
  res.json(existing)
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
    mediaPath: req.body.mediaPath || null,
    mediaKind: req.body.mediaKind || null,
    mediaStatus: req.body.mediaStatus || 'none',
    generatorRunId: req.body.generatorRunId || null,
  }
  upsert('posts', post)
  syncPostProjectFile(post)
  obsidian.syncPost(post)
  res.status(201).json(post)
})

app.put('/api/posts/:id', (req, res) => {
  const existing = findById('posts', req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const updated = { ...existing, ...req.body, id: req.params.id, updatedAt: new Date().toISOString() }
  upsert('posts', updated)
  syncPostProjectFile(updated)
  obsidian.syncPost(updated)
  res.json(updated)
})

app.patch('/api/posts/:id/status', (req, res) => {
  const existing = findById<any>('posts', req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  existing.status = req.body.status
  existing.updatedAt = new Date().toISOString()
  if (req.body.status === 'posted') existing.postedAt = new Date().toISOString()
  upsert('posts', existing)
  obsidian.syncPost(existing)
  res.json(existing)
})

app.patch('/api/posts/:id/media', (req, res) => {
  const existing = findById<ServerPost>('posts', req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const updated = updatePostMediaAcrossPlatform(req.params.id, {
    mediaPath: req.body.mediaPath,
    mediaKind: req.body.mediaKind,
    mediaStatus: req.body.mediaStatus,
  })
  res.json(updated)
})

app.post('/api/posts/:id/upload-media', upload.single('file'), (req, res) => {
  const existing = findById<ServerPost>('posts', req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const file = req.file as Express.Multer.File | undefined
  if (!file) return res.status(400).json({ error: 'file required (multipart field "file")' })

  const mime = file.mimetype || ''
  const ext = path.extname(file.originalname).toLowerCase()
  const isImage = mime.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|heic|heif|bmp|tiff)$/i.test(ext)
  const isVideo = mime.startsWith('video/') || /\.(mp4|mov|webm|m4v|avi|mkv)$/i.test(ext)
  if (!isImage && !isVideo) {
    fs.unlinkSync(file.path)
    return res.status(400).json({ error: 'unsupported file type' })
  }

  const dir = path.join(getMediaDir(), 'posts', req.params.id)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const safeName = file.originalname.replace(/[^A-Za-z0-9._-]/g, '_')
  const target = path.join(dir, `${Date.now()}-${safeName}`)
  fs.renameSync(file.path, target)

  const mediaKind = isImage ? 'image' : 'video'
  const updated = updatePostMediaAcrossPlatform(req.params.id, {
    mediaPath: target,
    mediaKind,
    mediaStatus: 'ready',
  })

  res.json(updated)
})

app.delete('/api/posts/:id', (req, res) => {
  const existing = findById<any>('posts', req.params.id)
  if (remove('posts', req.params.id)) {
    const runs = read<any>('generator-runs')
    let changedRuns = false
    const updatedRuns = runs.map((run) => {
      if (!Array.isArray(run.postIds) || !run.postIds.includes(req.params.id)) return run
      changedRuns = true
      const updated = {
        ...run,
        postIds: run.postIds.filter((id: string) => id !== req.params.id),
        updatedAt: new Date().toISOString(),
      }
      obsidian.syncRun(updated)
      return updated
    })
    if (changedRuns) write('generator-runs', updatedRuns)
    if (existing?.generatorRunId && !changedRuns) {
      const run = findById<any>('generator-runs', existing.generatorRunId)
      if (run) obsidian.syncRun(run)
    }
    obsidian.deletePost(req.params.id)
    res.json({ success: true })
  } else {
    res.status(404).json({ error: 'Not found' })
  }
})

// --- Generator Runs ---
app.get('/api/generator-runs', (_req, res) => {
  const runs = read<any>('generator-runs')
  runs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  res.json(runs)
})

app.get('/api/generator-runs/latest', (_req, res) => {
  const runs = read<any>('generator-runs')
  if (!runs.length) return res.status(404).json({ error: 'No runs yet' })
  runs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  res.json(runs[0])
})

app.get('/api/generator-runs/:id', (req, res) => {
  const run = findById('generator-runs', req.params.id)
  if (!run) return res.status(404).json({ error: 'Not found' })
  res.json(run)
})

app.post('/api/generator-runs', (req, res) => {
  const now = new Date().toISOString()
  const run = {
    id: req.body.id || uuid(),
    featureDescription: req.body.featureDescription || '',
    voiceAnchors: Array.isArray(req.body.voiceAnchors) ? req.body.voiceAnchors : [],
    templateChoice: req.body.templateChoice || null,
    forgeTaskId: req.body.forgeTaskId || null,
    mediaPath: req.body.mediaPath || null,
    mediaKind: req.body.mediaKind || null,
    postIds: Array.isArray(req.body.postIds) ? req.body.postIds : [],
    videoId: req.body.videoId || null,
    shortVideoId: req.body.shortVideoId || null,
    status: req.body.status || 'drafting',
    error: req.body.error || null,
    createdAt: now,
    updatedAt: now,
    scheduledFor: req.body.scheduledFor || null,
  }
  upsert('generator-runs', run)
  obsidian.syncRun(run)
  res.status(201).json(run)
})

app.put('/api/generator-runs/:id', (req, res) => {
  const existing = findById<any>('generator-runs', req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const updated = { ...existing, ...req.body, id: req.params.id, updatedAt: new Date().toISOString() }
  upsert('generator-runs', updated)
  obsidian.syncRun(updated)
  res.json(updated)
})

app.patch('/api/generator-runs/:id', (req, res) => {
  const existing = findById<any>('generator-runs', req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const updated = { ...existing, ...req.body, id: req.params.id, updatedAt: new Date().toISOString() }
  upsert('generator-runs', updated)
  obsidian.syncRun(updated)
  res.json(updated)
})

app.delete('/api/generator-runs/:id', (req, res) => {
  const run = findById<any>('generator-runs', req.params.id)
  if (!run) return res.status(404).json({ error: 'Not found' })

  const cascade = req.query.cascade === 'content' || req.query.cascade === 'true'
  let deletedPosts = 0
  let deletedVideo = false

  if (cascade) {
    const ids = new Set(Array.isArray(run.postIds) ? run.postIds : [])
    const posts = read<any>('posts')
    const keptPosts = posts.filter((post) => {
      const belongsToRun = post.generatorRunId === run.id || ids.has(post.id)
      if (belongsToRun) {
        deletedPosts += 1
        obsidian.deletePost(post.id)
      }
      return !belongsToRun
    })
    if (deletedPosts > 0) write('posts', keptPosts)

    if (run.videoId && remove('videos', run.videoId)) {
      deletedVideo = true
      obsidian.deleteVideo(run.videoId)
    }
  } else {
    const posts = read<any>('posts')
    const updatedPosts = posts.map((post) => (
      post.generatorRunId === run.id
        ? { ...post, generatorRunId: null, updatedAt: new Date().toISOString() }
        : post
    ))
    if (JSON.stringify(posts) !== JSON.stringify(updatedPosts)) write('posts', updatedPosts)
  }

  remove('generator-runs', req.params.id)
  obsidian.deleteRun(req.params.id)
  res.json({ success: true, deletedPosts, deletedVideo })
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
    mediaPaths: req.body.mediaPaths || [],
    convertedToVideoId: null,
    createdAt: new Date().toISOString(),
  }
  upsert('ideas', idea)
  res.status(201).json(idea)
})

app.put('/api/ideas/:id', (req, res) => {
  const existing = findById<any>('ideas', req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const updated = { ...existing, ...req.body, id: req.params.id }
  upsert('ideas', updated)
  res.json(updated)
})

app.post('/api/ideas/:id/upload-photo', upload.single('file'), (req, res) => {
  const existing = findById<any>('ideas', req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const file = req.file as Express.Multer.File | undefined
  if (!file) return res.status(400).json({ error: 'file required (multipart field "file")' })

  const mime = file.mimetype || ''
  const ext = path.extname(file.originalname).toLowerCase()
  if (!mime.startsWith('image/') && !/\.(png|jpg|jpeg|gif|webp|heic|heif|bmp|tiff)$/i.test(ext)) {
    fs.unlinkSync(file.path)
    return res.status(400).json({ error: 'image required' })
  }

  const dir = path.join(getMediaDir(), 'ideas', req.params.id)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const safeName = file.originalname.replace(/[^A-Za-z0-9._-]/g, '_')
  const target = path.join(dir, `${Date.now()}-${safeName}`)
  fs.renameSync(file.path, target)

  existing.mediaPaths = [target, ...((existing.mediaPaths || []).filter((p: string) => p !== target))]
  upsert('ideas', existing)
  res.json(existing)
})

app.delete('/api/ideas/:id/photos', (req, res) => {
  const existing = findById<any>('ideas', req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const target = req.query.path as string
  if (!target) return res.status(400).json({ error: 'path query required' })
  existing.mediaPaths = (existing.mediaPaths || []).filter((p: string) => p !== target)
  upsert('ideas', existing)
  try { if (fs.existsSync(target)) fs.unlinkSync(target) } catch {}
  res.json(existing)
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
    platforms: defaultVideoPlatforms(),
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

// --- Frozen Pipelines ---
app.get('/api/frozen', (_req, res) => {
  const config = readConfig()
  const project = config.projects.find((p: any) => p.id === config.activeProject) || config.projects[0]
  res.json(project.frozenTasks || [])
})

app.put('/api/frozen', (req, res) => {
  const config = readConfig()
  const project = config.projects.find((p: any) => p.id === config.activeProject) || config.projects[0]
  project.frozenTasks = req.body
  writeConfig(config)
  res.json(project.frozenTasks)
})

// --- Weekly Tracker ---
const weeklyPath = () => path.join(getProjectDataDir(), 'weekly.json')
const readWeekly = () => {
  const p = weeklyPath()
  if (!fs.existsSync(p)) fs.writeFileSync(p, '{}')
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}
const writeWeekly = (data: any) => {
  const fp = weeklyPath()
  fs.writeFileSync(fp, JSON.stringify(data, null, 2))
  mirrorDataFile(fp)
}

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
  const dir = path.join(getMediaDir(), weekKey)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function dayFolder(weekKey: string, date: string): string {
  const dir = path.join(weekFolder(weekKey), `uploads-${date}`)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

// Upload files for a specific day
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
  const dir = path.join(getMediaDir(), req.params.weekKey, `uploads-${req.params.date}`)
  if (!fs.existsSync(dir)) return res.json([])
  const files = fs.readdirSync(dir).filter(f => !f.startsWith('.')).map(f => {
    const stat = fs.statSync(path.join(dir, f))
    return { filename: f, path: path.join(dir, f), size: stat.size, modified: stat.mtime }
  })
  res.json(files)
})

// List all files for a week
app.get('/api/media/week/:weekKey', (req, res) => {
  const dir = path.join(getMediaDir(), req.params.weekKey)
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

// Delete a media file
app.delete('/api/media/file', (req, res) => {
  const { filePath } = req.body
  if (!filePath) return res.status(400).json({ error: 'filePath required' })
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' })
  if (!isPathInsideMedia(filePath)) return res.status(403).json({ error: 'Path outside media directory' })
  fs.unlinkSync(filePath)
  res.json({ deleted: filePath })
})

// Media tags — stored as { "filepath": "category" }
function readMediaTags(): Record<string, string> {
  const fp = path.join(getProjectDataDir(), 'media-tags.json')
  if (!fs.existsSync(fp)) return {}
  return JSON.parse(fs.readFileSync(fp, 'utf-8'))
}

function writeMediaTags(tags: Record<string, string>) {
  const fp = path.join(getProjectDataDir(), 'media-tags.json')
  const tmp = fp + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(tags, null, 2))
  fs.renameSync(tmp, fp)
  mirrorDataFile(fp)
}

app.get('/api/media/tags', (_req, res) => {
  res.json(readMediaTags())
})

app.put('/api/media/tags', (req, res) => {
  const { filePath, tag } = req.body
  if (!filePath) return res.status(400).json({ error: 'filePath required' })
  const tags = readMediaTags()
  if (tag) {
    tags[filePath] = tag
  } else {
    delete tags[filePath]
  }
  writeMediaTags(tags)
  res.json(tags)
})

// Rename a file
app.post('/api/media/rename', (req, res) => {
  const { oldPath, newName } = req.body
  if (!oldPath || !newName) return res.status(400).json({ error: 'oldPath and newName required' })
  if (!isPathInsideMedia(oldPath)) return res.status(403).json({ error: 'Path outside media directory' })
  const dir = path.dirname(oldPath)
  const safeName = path.basename(newName)
  const newPath = path.join(dir, safeName)
  if (!isPathInsideMedia(newPath)) return res.status(403).json({ error: 'Path outside media directory' })
  if (!fs.existsSync(oldPath)) return res.status(404).json({ error: 'File not found' })
  fs.renameSync(oldPath, newPath)
  res.json({ path: newPath, filename: safeName })
})

// --- Project Folders ---
// Each content piece (reel, post) gets its own project folder
// videos/{weekKey}/content/{slug}/
//   project.json, script.md, sources/, exports/

function projectDir(weekKey: string, slug: string): string {
  const dir = path.join(getMediaDir(), weekKey, 'content', slug)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    fs.mkdirSync(path.join(dir, 'sources'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'exports'), { recursive: true })
  }
  return dir
}

function projectScriptContent(title: string, seed?: { hook?: string; script?: string; cta?: string }): string {
  return [
    `# ${title}`,
    '',
    '## Hook',
    '',
    seed?.hook || '',
    '',
    '## Script',
    '',
    seed?.script || '',
    '',
    '## CTA',
    '',
    seed?.cta || '',
    '',
  ].join('\n')
}

function hasScriptSeed(seed?: { hook?: string; script?: string; cta?: string }): boolean {
  return Boolean(seed?.hook?.trim() || seed?.script?.trim() || seed?.cta?.trim())
}

function isEmptyProjectScript(content: string): boolean {
  return content
    .replace(/^# .+$/gm, '')
    .replace(/^##\s*(Hook|Script|CTA|Content)$/gm, '')
    .trim().length === 0
}

// Create/get project folder for a content piece
app.post('/api/projects/init', (req, res) => {
  const { weekKey, slug, title, type, hook, script, cta } = req.body
  const dir = projectDir(weekKey, slug)
  const metaPath = path.join(dir, 'project.json')
  const scriptPath = path.join(dir, 'script.md')

  if (fs.existsSync(metaPath)) {
    if (hasScriptSeed({ hook, script, cta }) && fs.existsSync(scriptPath)) {
      const currentScript = fs.readFileSync(scriptPath, 'utf-8')
      if (isEmptyProjectScript(currentScript)) {
        fs.writeFileSync(scriptPath, projectScriptContent(title, { hook, script, cta }))
      }
    }
    return res.json(JSON.parse(fs.readFileSync(metaPath, 'utf-8')))
  }

  const meta = { title, type, slug, weekKey, createdAt: new Date().toISOString() }
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))

  // Create empty script.md
  const scriptContent = type === 'post'
    ? `# ${title}\n\n## Content\n\n\n\n## CTA\n\n`
    : projectScriptContent(title, { hook, script, cta })
  fs.writeFileSync(scriptPath, scriptContent)

  res.status(201).json(meta)
})

// Browse available source clips (week raw uploads + past weeks)
// MUST be before :weekKey/:slug to avoid route conflict
app.get('/api/projects/browse-sources/:weekKey', (req, res) => {
  const result: Record<string, any[]> = {}

  const weekDir = path.join(getMediaDir(), req.params.weekKey)
  if (fs.existsSync(weekDir)) {
    for (const sub of fs.readdirSync(weekDir)) {
      if (sub === 'content') continue
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
    const prevDir = path.join(getMediaDir(), prevKey)
    if (!fs.existsSync(prevDir)) continue
    for (const sub of fs.readdirSync(prevDir)) {
      if (sub === 'content') continue
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
  const dir = path.join(getMediaDir(), req.params.weekKey, 'content', req.params.slug)
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
  const dir = path.join(getMediaDir(), req.params.weekKey, 'content', req.params.slug)
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

// --- Repos ---
const reposPath = () => path.join(getProjectDataDir(), 'repos.json')
function readRepos() {
  const p = reposPath()
  if (!fs.existsSync(p)) fs.writeFileSync(p, '[]')
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}
function writeRepos(data: any) { fs.writeFileSync(reposPath(), JSON.stringify(data, null, 2)) }

app.get('/api/repos', (_req, res) => {
  res.json(readRepos())
})

app.post('/api/repos', (req, res) => {
  const repos = readRepos()
  const repo = {
    id: uuid(),
    name: req.body.name || path.basename(req.body.path),
    path: req.body.path,
    createdAt: new Date().toISOString(),
  }
  repos.push(repo)
  writeRepos(repos)
  res.status(201).json(repo)
})

app.get('/api/repos/:id/activity', (req, res) => {
  const repos = readRepos()
  const repo = repos.find((r: any) => r.id === req.params.id)
  if (!repo) return res.status(404).json({ error: 'Repo not found' })

  const from = req.query.from as string
  const to = req.query.to as string
  if (!from || !to) return res.status(400).json({ error: 'from and to required' })

  try {
    const gitLog = execSync(
      `git log --after="${from}" --before="${to}T23:59:59" --format="%H|||%ai|||%s|||%b|||END" --no-merges`,
      { cwd: repo.path, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    )

    const commits = gitLog.split('|||END\n').filter(Boolean).map((entry: string) => {
      const [hash, date, subject, ...bodyParts] = entry.split('|||')
      return { hash: hash.trim(), date: date.trim(), subject: subject.trim(), body: bodyParts.join('|||').trim() }
    })

    res.json(commits)
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to read git log', details: err.message })
  }
})

// --- Generations ---
const generationsPath = () => path.join(getProjectDataDir(), 'generations.json')
function readGenerations() {
  const p = generationsPath()
  if (!fs.existsSync(p)) fs.writeFileSync(p, '[]')
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}
function writeGenerations(data: any) { fs.writeFileSync(generationsPath(), JSON.stringify(data, null, 2)) }

app.get('/api/generations', (_req, res) => {
  res.json(readGenerations())
})

app.post('/api/generations', (req, res) => {
  const repos = readRepos()
  const repo = repos.find((r: any) => r.id === req.body.repoId)
  if (!repo) return res.status(404).json({ error: 'Repo not found' })

  const from = req.body.dateFrom
  const to = req.body.dateTo

  // Fetch commits
  let commits: any[] = []
  try {
    const gitLog = execSync(
      `git log --after="${from}" --before="${to}T23:59:59" --format="%H|||%ai|||%s|||%b|||END" --no-merges`,
      { cwd: repo.path, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    )
    commits = gitLog.split('|||END\n').filter(Boolean).map((entry: string) => {
      const [hash, date, subject, ...bodyParts] = entry.split('|||')
      return { hash: hash.trim(), date: date.trim(), subject: subject.trim(), body: bodyParts.join('|||').trim() }
    })
  } catch { /* empty repo or no commits in range */ }

  const now = new Date().toISOString()
  const generation = {
    id: uuid(),
    repoId: req.body.repoId,
    repoName: repo.name,
    tone: req.body.tone || 'builder',
    dateFrom: from,
    dateTo: to,
    commits,
    content: [],
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  }

  const generations = readGenerations()
  generations.unshift(generation)
  writeGenerations(generations)

  // Queue action for Claude Code processing
  const action = {
    id: uuid(),
    type: 'generate-from-repo',
    videoId: null,
    videoTitle: null,
    params: { generationId: generation.id, tone: generation.tone, commits, repoName: repo.name, dateFrom: from, dateTo: to },
    status: 'pending',
    result: null,
    createdAt: now,
    completedAt: null,
  }
  upsert('actions', action)

  res.status(201).json(generation)
})

app.put('/api/generations/:id', (req, res) => {
  const generations = readGenerations()
  const idx = generations.findIndex((g: any) => g.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Not found' })
  generations[idx] = { ...generations[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() }
  writeGenerations(generations)
  res.json(generations[idx])
})

app.post('/api/generations/:id/apply/:index', (req, res) => {
  const generations = readGenerations()
  const gen = generations.find((g: any) => g.id === req.params.id)
  if (!gen) return res.status(404).json({ error: 'Generation not found' })

  const contentIdx = parseInt(req.params.index)
  const content = gen.content[contentIdx]
  if (!content) return res.status(404).json({ error: 'Content not found at index' })

  const now = new Date().toISOString()

  if (content.platform === 'script') {
    // Create a video entry
    const video = {
      id: uuid(),
      title: content.hook || `${gen.repoName} update`,
      status: 'scripted' as const,
      category: 'building' as const,
      hook: content.hook || '',
      script: content.body || '',
      cta: content.cta || '',
      platforms: defaultVideoPlatforms(Object.fromEntries(
        VIDEO_PLATFORMS.map(p => [p, { caption: '', hashtags: content.hashtags || [], posted: false, url: null, postedAt: null }])
      )),
      clipPaths: [],
      tags: ['engine-generated'],
      notes: `Generated from ${gen.repoName} commits (${gen.dateFrom} to ${gen.dateTo})`,
      createdAt: now,
      updatedAt: now,
    }
    upsert('videos', video)
    obsidian.syncVideo(video)
    res.json({ videoId: video.id })
  } else {
    // Create a post entry (linkedin or x)
    const post = {
      id: uuid(),
      title: content.hook || `${gen.repoName} update`,
      platform: content.platform === 'x' ? 'x' : 'linkedin',
      status: 'written' as const,
      category: 'building' as const,
      content: `${content.hook}\n\n${content.body}\n\n${content.cta}`.trim(),
      hook: content.hook || '',
      cta: content.cta || '',
      linkedVideoId: null,
      url: null,
      tags: ['engine-generated', ...(content.hashtags || [])],
      notes: `Generated from ${gen.repoName} commits (${gen.dateFrom} to ${gen.dateTo})`,
      createdAt: now,
      updatedAt: now,
      postedAt: null,
      mediaPath: null,
      mediaKind: null,
      mediaStatus: 'none',
      generatorRunId: null,
    }
    upsert('posts', post)
    obsidian.syncPost(post)
    res.json({ postId: post.id })
  }
})

// --- Replies ---
const repliesPath = () => path.join(getProjectDataDir(), 'replies.json')
function readReplies() {
  const p = repliesPath()
  if (!fs.existsSync(p)) fs.writeFileSync(p, '[]')
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}
function writeReplies(data: any) { fs.writeFileSync(repliesPath(), JSON.stringify(data, null, 2)) }

app.get('/api/replies', (_req, res) => {
  res.json(readReplies())
})

app.post('/api/replies', (req, res) => {
  const now = new Date().toISOString()
  const reply = {
    id: uuid(),
    originalPost: req.body.originalPost,
    platform: req.body.platform || 'x',
    tone: req.body.tone || 'builder',
    replies: [],
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  }

  const replies = readReplies()
  replies.unshift(reply)
  writeReplies(replies)

  // Queue action
  const action = {
    id: uuid(),
    type: 'generate-replies',
    videoId: null,
    videoTitle: null,
    params: { replyId: reply.id, originalPost: reply.originalPost, platform: reply.platform, tone: reply.tone },
    status: 'pending',
    result: null,
    createdAt: now,
    completedAt: null,
  }
  upsert('actions', action)

  res.status(201).json(reply)
})

app.put('/api/replies/:id', (req, res) => {
  const replies = readReplies()
  const idx = replies.findIndex((r: any) => r.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Not found' })
  replies[idx] = { ...replies[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() }
  writeReplies(replies)
  res.json(replies[idx])
})

// --- Outbound (openclaw X pipeline) ---
const outboundPath = () => path.join(getProjectDataDir(), 'outbound.json')
function readOutbound(): any[] {
  const p = outboundPath()
  if (!fs.existsSync(p)) fs.writeFileSync(p, '[]')
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}
function writeOutbound(data: any[]) { fs.writeFileSync(outboundPath(), JSON.stringify(data, null, 2)) }

// Drafter throughput: per-hour count of leads where the drafter generated drafts.
// Powered by the openclaw_drafts_per_hour() Supabase RPC.
app.get('/api/outbound/stats', async (_req, res) => {
  try {
    const r = await sb('/rpc/openclaw_drafts_per_hour', {
      method: 'POST', body: JSON.stringify({}),
    })
    if (!r.ok) return res.status(r.status).json({ error: await r.text() })
    const arr = await r.json() as Array<{ last_hour: number, last_24h: number, by_hour: Array<{ hour: string, n: number }> }>
    res.json(arr[0] || { last_hour: 0, last_24h: 0, by_hour: [] })
  } catch (e) { res.status(500).json({ error: (e as Error).message }) }
})

app.get('/api/outbound', (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : null
  const platform = typeof req.query.platform === 'string' ? req.query.platform : null

  // New pipeline-signal filters (additive, all optional). Anything missing or
  // empty is a no-op so existing callers keep their behavior unchanged.
  const qualityMinRaw = typeof req.query.qualityMin === 'string' ? req.query.qualityMin : null
  const qualityMin = qualityMinRaw != null && qualityMinRaw !== '' ? Number(qualityMinRaw) : null
  const qualityGateRaw = typeof req.query.qualityGatePassed === 'string' ? req.query.qualityGatePassed : null
  const tierRaw = typeof req.query.tier === 'string' ? req.query.tier : null
  const postKindRaw = typeof req.query.postKind === 'string' ? req.query.postKind : null
  const hasDmsRaw = typeof req.query.hasDms === 'string' ? req.query.hasDms : null
  const qRaw = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : ''
  const sortRaw = typeof req.query.sort === 'string' ? req.query.sort : 'newest'

  // Date filters: 'recent' presets (3d / 7d / 15d / 30d) or explicit ISO range.
  // Filter is applied to lead's posted_at (when the original post went live),
  // not to draft.createdAt — Pablo's policy: only reply to recent posts, never
  // to 100-day-old ones. Default to a 15-day soft window when no filter sent.
  const postedAfterRaw = typeof req.query.postedAfter === 'string' ? req.query.postedAfter : null
  const postedBeforeRaw = typeof req.query.postedBefore === 'string' ? req.query.postedBefore : null
  const recentPresetRaw = typeof req.query.recent === 'string' ? req.query.recent : null
  let postedAfter: Date | null = null
  let postedBefore: Date | null = null
  if (recentPresetRaw) {
    const m = /^(\d+)d$/i.exec(recentPresetRaw)
    if (m) {
      const days = Math.max(1, Math.min(365, parseInt(m[1], 10)))
      postedAfter = new Date(Date.now() - days * 86_400_000)
    }
  }
  if (postedAfterRaw) {
    const d = new Date(postedAfterRaw)
    if (!isNaN(d.getTime())) postedAfter = d
  }
  if (postedBeforeRaw) {
    const d = new Date(postedBeforeRaw)
    if (!isNaN(d.getTime())) postedBefore = d
  }

  const tierSet = tierRaw
    ? new Set(tierRaw.split(',').map((s) => s.trim()).filter(Boolean))
    : null
  const postKindSet = postKindRaw
    ? new Set(postKindRaw.split(',').map((s) => s.trim()).filter(Boolean))
    : null

  let list = readOutbound()
  if (status) list = list.filter((t: any) => t.status === status)
  if (platform) list = list.filter((t: any) => (t.platform || 'x') === platform)

  if (qualityMin != null && Number.isFinite(qualityMin) && qualityMin > 0) {
    list = list.filter((t: any) => (typeof t.qualityScore === 'number' ? t.qualityScore : 0) >= qualityMin)
  }
  if (qualityGateRaw === 'true' || qualityGateRaw === 'false') {
    const want = qualityGateRaw === 'true'
    list = list.filter((t: any) => (t.qualityGatePassed === true) === want)
  }
  if (tierSet && tierSet.size > 0) {
    list = list.filter((t: any) => {
      const v = t.tier
      if (v == null || v === '') return tierSet.has('none')
      return tierSet.has(String(v))
    })
  }
  if (postKindSet && postKindSet.size > 0) {
    list = list.filter((t: any) => {
      const v = t.postKind
      if (v == null || v === '') return postKindSet.has('none')
      return postKindSet.has(String(v))
    })
  }
  if (hasDmsRaw === 'true' || hasDmsRaw === 'false') {
    const want = hasDmsRaw === 'true'
    list = list.filter((t: any) => t.allowsDms === want)
  }
  if (qRaw) {
    list = list.filter((t: any) => {
      const handle = String(t.authorHandle || '').toLowerCase()
      const text = String(t.originalPostText || '').toLowerCase()
      return handle.includes(qRaw) || text.includes(qRaw)
    })
  }

  if (postedAfter || postedBefore) {
    list = list.filter((t: any) => {
      const raw = t.postedAt || t.posted_at
      if (!raw) return false   // unknown date — exclude when a date filter is active
      const d = new Date(raw)
      if (isNaN(d.getTime())) return false
      if (postedAfter && d < postedAfter) return false
      if (postedBefore && d > postedBefore) return false
      return true
    })
  }

  const tierRank: Record<string, number> = { T1: 0, T2: 1, T3: 2 }
  const sortKey = (t: any): number => tierRank[String(t.tier || '')] ?? 3
  if (sortRaw === 'oldest') {
    list = [...list].sort((a: any, b: any) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
  } else if (sortRaw === 'quality') {
    list = [...list].sort((a: any, b: any) => (Number(b.qualityScore || 0)) - (Number(a.qualityScore || 0)))
  } else if (sortRaw === 'tier') {
    list = [...list].sort((a: any, b: any) => sortKey(a) - sortKey(b))
  } else {
    // 'newest' (default)
    list = [...list].sort((a: any, b: any) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
  }

  res.json(list)
})

// Per-platform 500-active-lead cap. "Active" excludes leads we already engaged
// with (sent, partial_sent, skipped). When the cap is hit we refuse new inserts
// for that platform and Pushover-alert Pablo (debounced 24h per platform).
const PLATFORM_CAP = parseInt(process.env.CP_PLATFORM_CAP || '500', 10)
const INACTIVE_STATUSES = new Set(['sent', 'partial_sent', 'skipped'])
const KNOWN_PLATFORMS = ['x', 'linkedin', 'reddit'] as const
type CapPlatform = typeof KNOWN_PLATFORMS[number]

function activeCount(threads: any[], platform: CapPlatform): number {
  return threads.filter((t: any) =>
    (t.platform || 'x') === platform && !INACTIVE_STATUSES.has(t.status)).length
}

function capAlertsPath(): string {
  return path.join(getProjectDataDir(), 'cap-alerts.json')
}

app.get('/api/outbound/cap-status', (_req, res) => {
  const all = readOutbound()
  const out: Record<string, { active: number; cap: number; full: boolean }> = {}
  for (const p of KNOWN_PLATFORMS) {
    const active = activeCount(all, p)
    out[p] = { active, cap: PLATFORM_CAP, full: active >= PLATFORM_CAP }
  }
  res.json(out)
})

// CP-owned batch state. Replaces the panel's old query to the drafter HTTP
// server (127.0.0.1:7373/batches/current), which drifted because drafter never
// auto-closes Supabase batches (maybeCloseBatch is dead code). CP's outbound.json
// is the source of truth for what the user actually engages with.
const BATCH_FILL = 20
const BATCH_DAILY_CAP = 5
const outboundMetaPath = () => path.join(getProjectDataDir(), 'outbound-meta.json')
type OutboundMeta = { closedBatches: Record<CapPlatform, number[]> }
function readOutboundMeta(): OutboundMeta {
  const empty: OutboundMeta = { closedBatches: { x: [], linkedin: [], reddit: [] } }
  const p = outboundMetaPath()
  if (!fs.existsSync(p)) return empty
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8'))
    return {
      closedBatches: {
        x: Array.isArray(raw?.closedBatches?.x) ? raw.closedBatches.x : [],
        linkedin: Array.isArray(raw?.closedBatches?.linkedin) ? raw.closedBatches.linkedin : [],
        reddit: Array.isArray(raw?.closedBatches?.reddit) ? raw.closedBatches.reddit : [],
      },
    }
  } catch { return empty }
}
function writeOutboundMeta(meta: OutboundMeta) {
  fs.writeFileSync(outboundMetaPath(), JSON.stringify(meta, null, 2))
}
function isToday(iso: string): boolean {
  if (!iso) return false
  const d = new Date(iso)
  if (isNaN(d.getTime())) return false
  const n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
}
function pickPlatformQuery(req: express.Request): CapPlatform {
  const q = String(req.query.platform || 'x')
  return (KNOWN_PLATFORMS as readonly string[]).includes(q) ? (q as CapPlatform) : 'x'
}

app.get('/api/outbound/batch-current', (req, res) => {
  const platform = pickPlatformQuery(req)
  const all = readOutbound()
  const meta = readOutboundMeta()
  const closed = new Set<number>(meta.closedBatches[platform] || [])
  const samePlat = all.filter((t: any) => (t.platform || 'x') === platform && typeof t.batchNumber === 'number')

  const byBatch = new Map<number, any[]>()
  for (const t of samePlat) {
    const arr = byBatch.get(t.batchNumber) || []
    arr.push(t)
    byBatch.set(t.batchNumber, arr)
  }

  const candidates = [...byBatch.keys()].filter((n) => !closed.has(n)).sort((a, b) => a - b)
  const highest = candidates.length > 0 ? candidates[candidates.length - 1] : 0

  let open: { id: string, number: number, status: string, size_target: number, opened_at: string } | null = null
  let progress: { total: number, drafted: number, sent: number, skipped: number } | null = null
  if (highest > 0) {
    const threads = byBatch.get(highest) || []
    const opened = threads
      .map((t: any) => String(t.createdAt || t.postedAt || ''))
      .filter(Boolean)
      .sort()[0] || new Date().toISOString()
    open = {
      id: `cp-${platform}-${highest}`,
      number: highest,
      status: 'open',
      size_target: BATCH_FILL,
      opened_at: opened,
    }
    progress = {
      total: threads.length,
      drafted: threads.filter((t: any) => t.status === 'drafted').length,
      sent: threads.filter((t: any) => t.status === 'sent' || t.status === 'partial_sent').length,
      skipped: threads.filter((t: any) => t.status === 'skipped').length,
    }
  }

  const todayBatches = new Set<number>()
  for (const [num, threads] of byBatch.entries()) {
    const first = threads.map((t: any) => String(t.createdAt || t.postedAt || '')).filter(Boolean).sort()[0]
    if (first && isToday(first)) todayBatches.add(num)
  }

  res.json({
    open,
    progress,
    todayCount: todayBatches.size,
    dailyCap: BATCH_DAILY_CAP,
    batchSize: BATCH_FILL,
  })
})

app.post('/api/outbound/batch-close', (req, res) => {
  const platform = pickPlatformQuery(req)
  const all = readOutbound()
  const meta = readOutboundMeta()
  const closed = new Set<number>(meta.closedBatches[platform] || [])
  const nums = new Set<number>()
  for (const t of all) {
    if ((t.platform || 'x') === platform && typeof t.batchNumber === 'number' && !closed.has(t.batchNumber)) {
      nums.add(t.batchNumber)
    }
  }
  if (nums.size === 0) return res.status(404).json({ error: 'no open batch' })
  const highest = Math.max(...nums)
  closed.add(highest)
  meta.closedBatches[platform] = [...closed].sort((a, b) => a - b)
  writeOutboundMeta(meta)
  res.json({ ok: true, closedBatch: highest })
})

// Sent page: flattened list of every individual send.
// One row per sent draft inside an outbound thread (so a thread that sent
// just a DM and skipped the reply produces one row) plus one row per
// manually-logged sent-dm (the legacy /dms surface). Sorted newest first.
app.get('/api/outbound/sent', (req, res) => {
  const platform = typeof req.query.platform === 'string' ? req.query.platform : null
  const threads = readOutbound()
  const items: any[] = []

  for (const t of threads) {
    if (t.status !== 'sent' && t.status !== 'partial_sent') continue
    for (const d of t.drafts || []) {
      if (!d.sentAt) continue
      items.push({
        id: `outbound:${t.id}:${d.id}`,
        origin: 'outbound',
        platform: t.platform || 'x',
        kind: d.kind || 'reply',
        authorHandle: t.authorHandle || '',
        message: d.editedBody || d.body || '',
        contextText: t.originalPostText || null,
        contextUrl: t.originalPostUrl || null,
        sentAt: d.sentAt,
        threadStatus: t.status,
        threadId: t.id,
      })
    }
  }

  // Manually-logged sends (the old voice-samples / dms surface).
  let sentDms: any[] = []
  try {
    const p = path.join(getProjectDataDir(), 'sent-dms.json')
    if (fs.existsSync(p)) sentDms = JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch { /* ignore */ }
  for (const dm of sentDms) {
    if (dm.status !== 'sent') continue
    if (!dm.sentAt) continue
    items.push({
      id: `sent-dms:${dm.id}`,
      origin: 'sent-dms',
      platform: dm.platform || 'x',
      kind: dm.kind === 'dm' ? 'dm' : 'reply',
      authorHandle: dm.recipientHandle || dm.recipientName || '',
      message: dm.message || '',
      contextText: dm.context || null,
      contextUrl: dm.replyToUrl || dm.url || null,
      sentAt: dm.sentAt,
    })
  }

  let filtered = items
  if (platform) filtered = filtered.filter((it) => it.platform === platform)
  filtered.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
  res.json(filtered)
})

// Algolia search across leads, Mars DMs, and voice anchors. Server-side only;
// the admin key never crosses to the browser. Index names are restricted to
// the known list to prevent the client from probing arbitrary indices.
app.get('/api/algolia/search', async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    const index = typeof req.query.index === 'string' ? req.query.index : 'leads_index'
    if (!q) return res.status(400).json({ error: 'missing q' })
    if (!(ALGOLIA_INDICES as readonly string[]).includes(index)) {
      return res.status(400).json({ error: `unknown index: ${index}` })
    }
    if (!process.env.ALGOLIA_APP_ID || !process.env.ALGOLIA_API_KEY) {
      return res.status(503).json({ error: 'ALGOLIA_APP_ID or ALGOLIA_API_KEY not set in ~/.openclaw/.env' })
    }
    const out = await algoliaSearch(index as AlgoliaIndex, q, 10)
    res.json(out)
  } catch (e) {
    res.status(502).json({ error: (e as Error).message })
  }
})

// --- Viral shorts ---
// Manually triggers the viral-shorts-worker on the VM (or wherever
// VIRAL_SHORTS_WORKER_URL points). Logs every attempt to shorts.json.
const SHORTS_WORKER_URL = process.env.VIRAL_SHORTS_WORKER_URL || 'http://openclaw-vm:7474'
function shortsPath() { return path.join(getProjectDataDir(), 'shorts.json') }
function readShorts(): any[] {
  const p = shortsPath()
  if (!fs.existsSync(p)) return []
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return [] }
}
function writeShorts(rows: any[]) {
  fs.mkdirSync(path.dirname(shortsPath()), { recursive: true })
  fs.writeFileSync(shortsPath(), JSON.stringify(rows, null, 2))
}

app.get('/api/shorts', (_req, res) => {
  res.json(readShorts())
})

app.post('/api/shorts/trigger', async (req, res) => {
  const topic = String(req.body?.topic || '').trim()
  const niche = String(req.body?.niche || '').trim() || undefined
  if (!topic) return res.status(400).json({ error: 'missing topic' })

  const id = uuid()
  const startedAt = new Date().toISOString()
  const row: any = { id, topic, niche, status: 'running', startedAt, ytUrl: null, error: null, finishedAt: null }
  const all = readShorts()
  all.unshift(row)
  writeShorts(all)

  // Synchronous call to the worker. Worker takes ~30 to 90 seconds.
  try {
    const r = await fetch(`${SHORTS_WORKER_URL}/generate-and-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, niche }),
    })
    const text = await r.text()
    const body = text ? JSON.parse(text) : {}
    if (!r.ok) throw new Error(body?.error || `worker ${r.status}: ${text.slice(0, 200)}`)
    row.status = 'done'
    row.ytUrl = body.ytUrl || body.url || null
    row.finishedAt = new Date().toISOString()
    row.title = body.title || null
    row.description = body.description || null
    Object.assign(all[0], row)
    writeShorts(all)
    res.json(row)
  } catch (e) {
    row.status = 'failed'
    row.error = (e as Error).message
    row.finishedAt = new Date().toISOString()
    Object.assign(all[0], row)
    writeShorts(all)
    res.status(502).json(row)
  }
})

app.delete('/api/shorts/:id', (req, res) => {
  const all = readShorts()
  const next = all.filter((r: any) => r.id !== req.params.id)
  writeShorts(next)
  res.json({ ok: true })
})

// One-shot full reindex. Heavy: walks all Mars dms + voice-anchors and pages
// through Supabase leads. Wrap with a manual trigger button in CP UI.
app.post('/api/algolia/reindex', async (_req, res) => {
  try {
    const [dms, voice, leads] = await Promise.all([
      indexDms(),
      indexVoiceAnchors(),
      indexLeads(sb as any),
    ])
    res.json({ ok: true, indexed: { dms, voice_anchors: voice, leads } })
  } catch (e) {
    res.status(502).json({ error: (e as Error).message })
  }
})

// --- OpenClaw memory (~/Projects/openclaw-memory vault) ---
// Read-side: drafter calls /api/memory/context before generating angles.
// Write-side: /api/outbound/:id PATCH (sentDraftId branch) auto-upserts via the
// hook above; the explicit POST /api/memory/upsert-lead is for backfill / ops.

app.get('/api/memory/stats', (_req, res) => {
  try {
    res.json(memory.getMemoryStats())
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

app.get('/api/memory/lead/:handle', (req, res) => {
  try {
    const profile = memory.getLeadProfile(req.params.handle)
    if (!profile) return res.status(404).json({ error: 'Not found' })
    res.json(profile)
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

app.get('/api/memory/context', async (req, res) => {
  try {
    const handle = String(req.query.handle || '')
    const platform = String(req.query.platform || 'x')
    const originalPostText = typeof req.query.originalPostText === 'string'
      ? req.query.originalPostText
      : ''
    if (!handle) return res.status(400).json({ error: 'missing handle' })
    if (!['x', 'reddit', 'hn', 'linkedin'].includes(platform)) {
      return res.status(400).json({ error: `unknown platform ${platform}` })
    }
    const ctx = await memory.getMemoryContext({
      handle,
      platform: platform as memory.Platform,
      originalPostText,
      insightDomain: 'outreach',
    })
    const formatted = memory.formatContextForPrompt(ctx)
    res.json({ context: ctx, formatted })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

app.post('/api/memory/upsert-lead', (req, res) => {
  try {
    const thread = req.body?.thread
    const draftId = String(req.body?.draftId || '')
    if (!thread || !draftId) return res.status(400).json({ error: 'missing thread or draftId' })
    const r = memory.upsertLeadFromSend(thread, draftId)
    res.json(r)
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

app.post('/api/memory/lead-reply', (req, res) => {
  try {
    const handle = String(req.body?.handle || '')
    const platform = String(req.body?.platform || 'x')
    const text = String(req.body?.text || '')
    const sentiment = (req.body?.sentiment || 'positive') as memory.Sentiment
    if (!handle || !text) return res.status(400).json({ error: 'missing handle or text' })
    const r = memory.recordLeadReply(handle, platform as memory.Platform, text, sentiment)
    res.json(r)
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

// RAG over Pablo's Mars Obsidian vault. Proxies to mars-rag-server on 127.0.0.1:7374.
// Body: { query, k? }. Returns { results: [{path, title, snippet, score}] }.
app.post('/api/rag/search', async (req, res) => {
  try {
    const query = typeof req.body?.query === 'string' ? req.body.query : ''
    const k = typeof req.body?.k === 'number' ? req.body.k : 5
    if (!query.trim()) return res.status(400).json({ error: 'missing query' })
    const r = await fetch('http://127.0.0.1:7374/recall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, k }),
    })
    const text = await r.text()
    if (!r.ok) return res.status(r.status).json({ error: text })
    res.type('application/json').send(text)
  } catch (e) {
    res.status(502).json({ error: `mars-rag unreachable: ${(e as Error).message}` })
  }
})

app.get('/api/outbound/:id', (req, res) => {
  const all = readOutbound()
  const item = all.find((t: any) => t.id === req.params.id)
  if (!item) return res.status(404).json({ error: 'Not found' })
  res.json(item)
})

app.post('/api/outbound', async (req, res) => {
  const now = new Date().toISOString()
  const drafts = Array.isArray(req.body.drafts) ? req.body.drafts : []
  const platform = (KNOWN_PLATFORMS as readonly string[]).includes(req.body.platform)
    ? (req.body.platform as CapPlatform)
    : 'x'

  // Cap guard: if this platform's active queue is at the limit, refuse the
  // insert and Pushover-alert Pablo (debounced 24h per platform). The drafter
  // should also pre-check via /api/outbound/cap-status to avoid wasting Claude
  // calls drafting threads that can't land.
  const existing = readOutbound()
  const activeNow = activeCount(existing, platform)
  if (activeNow >= PLATFORM_CAP) {
    const alertsFile = capAlertsPath()
    if (shouldAlert(alertsFile, platform)) {
      markAlerted(alertsFile, platform)
      sendPushover({
        title: 'CP cap reached',
        message: `${platform} bucket at ${activeNow}/${PLATFORM_CAP} active leads. Drain (send or skip) before more drafts can land.`,
        priority: 1,
      }).catch((e) => console.warn('[cap] pushover failed:', e))
    }
    return res.status(429).json({
      error: 'platform_cap_reached',
      platform,
      active: activeNow,
      cap: PLATFORM_CAP,
    })
  }

  // CP owns batch numbering, not the drafter. Whatever batchNumber the drafter
  // sends is ignored; we assign based on existing CP state so batches stay
  // dense (#1..N) and capped at BATCH_FILL per batch. Without this, the drafter's
  // Supabase-derived batch counter drifts away from CP after rebatch (Pablo
  // saw weird gaps like #1..#9 then #27, #28).
  const draftedSamePlat = existing.filter((t: any) =>
    (t.platform || 'x') === platform && t.status === 'drafted')
  let assignedBatch: number
  const counts = new Map<number, number>()
  for (const t of draftedSamePlat) {
    if (typeof t.batchNumber === 'number') counts.set(t.batchNumber, (counts.get(t.batchNumber) || 0) + 1)
  }
  const closedSet = new Set<number>(readOutboundMeta().closedBatches[platform] || [])
  const sortedNums = [...counts.keys()].sort((a, b) => a - b)
  const highestOverall = sortedNums.length > 0 ? sortedNums[sortedNums.length - 1] : 0
  const fillCandidates = sortedNums.filter((n) => !closedSet.has(n))
  const highestForFill = fillCandidates.length > 0 ? fillCandidates[fillCandidates.length - 1] : 0
  if (highestForFill > 0 && (counts.get(highestForFill) || 0) < BATCH_FILL) {
    assignedBatch = highestForFill
  } else {
    assignedBatch = Math.max(highestOverall, highestForFill, ...closedSet, 0) + 1
  }

  const thread = {
    id: uuid(),
    leadId: String(req.body.leadId || ''),
    batchNumber: assignedBatch,
    platform: platform as 'x' | 'linkedin' | 'reddit',
    authorHandle: String(req.body.authorHandle || ''),
    authorId: String(req.body.authorId || ''),
    authorFollowers: typeof req.body.authorFollowers === 'number' ? req.body.authorFollowers : null,
    allowsDms: typeof req.body.allowsDms === 'boolean' ? req.body.allowsDms : null,
    originalPostId: String(req.body.originalPostId || ''),
    originalPostText: String(req.body.originalPostText || ''),
    originalPostUrl: String(req.body.originalPostUrl || ''),
    postedAt: String(req.body.postedAt || now),
    matchedTrigger: req.body.matchedTrigger || null,
    drafts: drafts.map((d: any) => ({
      id: String(d.id || uuid()),
      kind: ['reply','dm','repost'].includes(d.kind) ? d.kind : 'reply',
      angle: d.angle || 'empathetic',
      body: String(d.body || ''),
      editedBody: null,
      charCount: typeof d.charCount === 'number' ? d.charCount : String(d.body || '').length,
      sentAt: null,
    })),
    selectedDraftId: null,
    status: 'drafted',
    skipReason: null,
    // Watchlist + quality gate metadata (optional, set by x-drafter when the
    // lead came from watchlist-radar). UI surfaces tier badge + quality score;
    // notifications.ts uses qualityGatePassed to suppress weak alerts.
    qualityScore: typeof req.body.qualityScore === 'number' ? req.body.qualityScore : null,
    qualityGatePassed: typeof req.body.qualityGatePassed === 'boolean' ? req.body.qualityGatePassed : null,
    tier: ['T1','T2','T3'].includes(req.body.tier) ? req.body.tier : null,
    postKind: typeof req.body.postKind === 'string' ? req.body.postKind : null,
    createdAt: now,
    updatedAt: now,
    sentAt: null,
  }
  const all = readOutbound()
  all.unshift(thread)
  writeOutbound(all)

  // Reset the alert window if Pablo drained back below the cap (so when he
  // refills past the cap, he gets a fresh alert instead of waiting 24h).
  try {
    const after = activeCount(all, platform)
    if (after < PLATFORM_CAP) markAlerted(capAlertsPath(), `${platform}_reset`, new Date(0))
  } catch { /* non-fatal */ }

  res.status(201).json(thread)
})

app.patch('/api/outbound/:id', (req, res) => {
  const all = readOutbound()
  const idx = all.findIndex((t: any) => t.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Not found' })
  const existing = all[idx]
  const next: any = { ...existing, ...req.body, id: existing.id, updatedAt: new Date().toISOString() }

  if (req.body.drafts && Array.isArray(req.body.drafts)) next.drafts = req.body.drafts

  // Per-draft mark-sent: body is { sentDraftId: <id>, status: 'partial_sent' | 'sent' }
  if (req.body.sentDraftId) {
    const did = String(req.body.sentDraftId)
    next.drafts = (next.drafts || []).map((d: any) =>
      d.id === did ? { ...d, sentAt: new Date().toISOString() } : d)
    next.selectedDraftId = did
    const anyUnsent = (next.drafts || []).some((d: any) => !d.sentAt)
    next.status = anyUnsent ? 'partial_sent' : 'sent'
    next.sentAt = next.sentAt || new Date().toISOString()
  } else if (req.body.status === 'sent' && !existing.sentAt) {
    next.sentAt = new Date().toISOString()
  }

  all[idx] = next
  writeOutbound(all)

  if (req.body.sentDraftId) {
    const did = String(req.body.sentDraftId)
    obsidian.syncOutboundDraftSent(next, did)
    try {
      const r = memory.upsertLeadFromSend(next, did)
      if (r.created) console.log(`[memory] created lead profile ${r.filepath}`)
    } catch (e) {
      console.warn('[memory] upsertLeadFromSend failed:', (e as Error).message)
    }
  } else if (next.status === 'sent') {
    obsidian.syncOutboundSent(next)
    try {
      if (next.selectedDraftId) memory.upsertLeadFromSend(next, String(next.selectedDraftId))
    } catch (e) {
      console.warn('[memory] upsertLeadFromSend (sent) failed:', (e as Error).message)
    }
  }

  res.json(next)
})

app.delete('/api/outbound/:id', (req, res) => {
  const all = readOutbound()
  const idx = all.findIndex((t: any) => t.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Not found' })
  const removed = all[idx]
  all.splice(idx, 1)
  writeOutbound(all)
  if (removed.status === 'sent') obsidian.deleteOutbound(removed.id)
  res.json({ success: true })
})

// --- Triggers (proxy to Supabase, used by the openclaw discovery worker) ---
const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

async function sb(path: string, init?: RequestInit) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase env not set on CP server')
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  return res
}

function mapTrigger(t: any) {
  return {
    id: t.id,
    phrase: t.phrase,
    active: t.active,
    notes: t.notes,
    createdAt: t.created_at,
  }
}

app.get('/api/triggers', async (_req, res) => {
  try {
    const r = await sb('/triggers?select=id,phrase,active,notes,created_at&order=created_at.desc')
    if (!r.ok) return res.status(r.status).json({ error: await r.text() })
    const arr = await r.json() as any[]
    res.json(arr.map(mapTrigger))
  } catch (e) { res.status(500).json({ error: (e as Error).message }) }
})

// Watchlist handles — tiered list of accounts the radar polls.
app.get('/api/watchlist/handles', listWatchlistHandles)
app.post('/api/watchlist/handles', createWatchlistHandle)
app.patch('/api/watchlist/handles/:id', patchWatchlistHandle)
app.delete('/api/watchlist/handles/:id', deleteWatchlistHandle)
app.get('/api/watchlist/stats', statsWatchlistHandles)

app.post('/api/triggers', async (req, res) => {
  try {
    const body = JSON.stringify({ phrase: String(req.body.phrase || '').trim(), notes: req.body.notes || null, active: true })
    const r = await sb('/triggers', { method: 'POST', body, headers: { Prefer: 'return=representation' } })
    if (!r.ok) return res.status(r.status).json({ error: await r.text() })
    const arr = await r.json() as any[]
    res.status(201).json(mapTrigger(arr[0]))
  } catch (e) { res.status(500).json({ error: (e as Error).message }) }
})

app.patch('/api/triggers/:id', async (req, res) => {
  try {
    const patch: any = {}
    if (typeof req.body.active === 'boolean') patch.active = req.body.active
    if (typeof req.body.phrase === 'string') patch.phrase = req.body.phrase
    if (req.body.notes !== undefined) patch.notes = req.body.notes
    const r = await sb(`/triggers?id=eq.${encodeURIComponent(req.params.id)}`, {
      method: 'PATCH', body: JSON.stringify(patch), headers: { Prefer: 'return=representation' },
    })
    if (!r.ok) return res.status(r.status).json({ error: await r.text() })
    const arr = await r.json() as any[]
    res.json(mapTrigger(arr[0]))
  } catch (e) { res.status(500).json({ error: (e as Error).message }) }
})

app.delete('/api/triggers/:id', async (req, res) => {
  try {
    const r = await sb(`/triggers?id=eq.${encodeURIComponent(req.params.id)}`, { method: 'DELETE' })
    if (!r.ok) return res.status(r.status).json({ error: await r.text() })
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: (e as Error).message }) }
})

// --- Templates ---
app.get('/api/templates', (_req, res) => {
  res.json(read('templates'))
})

app.post('/api/templates', (req, res) => {
  const template = {
    id: uuid(),
    name: req.body.name || '',
    platform: req.body.platform || 'x',
    template: req.body.template || '',
    tone: req.body.tone || 'builder',
    notes: req.body.notes || '',
    createdAt: new Date().toISOString(),
  }
  upsert('templates', template)
  res.status(201).json(template)
})

app.put('/api/templates/:id', (req, res) => {
  const existing = findById('templates', req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const updated = { ...existing, ...req.body, id: req.params.id }
  upsert('templates', updated)
  res.json(updated)
})

app.delete('/api/templates/:id', (req, res) => {
  if (remove('templates', req.params.id)) {
    res.json({ success: true })
  } else {
    res.status(404).json({ error: 'Not found' })
  }
})

// --- Sent DMs ---
app.get('/api/sent-dms', (_req, res) => {
  const dms = read<any>('sent-dms')
  dms.sort((a, b) => (b.sentAt || b.createdAt || '').localeCompare(a.sentAt || a.createdAt || ''))
  res.json(dms)
})

app.post('/api/sent-dms', (req, res) => {
  const now = new Date().toISOString()
  const kind = req.body.kind === 'reply' ? 'reply' : 'dm'
  const status = req.body.status === 'sent' ? 'sent' : 'draft'
  const dm = {
    id: uuid(),
    kind,
    status,
    platform: req.body.platform || 'x',
    recipientName: req.body.recipientName || '',
    recipientHandle: req.body.recipientHandle || '',
    message: req.body.message || '',
    context: req.body.context || '',
    url: req.body.url || null,
    replyToUrl: req.body.replyToUrl || null,
    notes: req.body.notes || '',
    sentAt: req.body.sentAt || now,
    createdAt: now,
    updatedAt: now,
  }
  upsert('sent-dms', dm)
  obsidian.syncSentDm(dm)
  res.status(201).json(dm)
})

app.put('/api/sent-dms/:id', (req, res) => {
  const existing = findById('sent-dms', req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const updated = { ...existing, ...req.body, id: req.params.id, updatedAt: new Date().toISOString() }
  upsert('sent-dms', updated)
  obsidian.syncSentDm(updated)
  res.json(updated)
})

app.patch('/api/sent-dms/:id/status', (req, res) => {
  const existing = findById<any>('sent-dms', req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const status = req.body.status === 'sent' ? 'sent' : 'draft'
  const now = new Date().toISOString()
  const updated = {
    ...existing,
    status,
    sentAt: status === 'sent' ? (req.body.sentAt || now) : existing.sentAt,
    updatedAt: now,
  }
  upsert('sent-dms', updated)
  obsidian.syncSentDm(updated)
  res.json(updated)
})

app.delete('/api/sent-dms/:id', (req, res) => {
  if (remove('sent-dms', req.params.id)) {
    obsidian.deleteSentDm(req.params.id)
    res.json({ success: true })
  } else {
    res.status(404).json({ error: 'Not found' })
  }
})

// --- Media directory listing ---
app.get('/api/media', (_req, res) => {
  try {
    const files = fs.readdirSync(getMediaDir()).filter(f => !f.startsWith('.'))
    res.json(files)
  } catch {
    res.json([])
  }
})

// List ALL media files across all weeks (for the Media dashboard)
app.get('/api/media/all', (_req, res) => {
  const mediaDir = getMediaDir()
  const imagesDir = getImagesDir()

  const allFiles: { filename: string; path: string; size: number; date: string; weekKey: string; modified: string; type: string }[] = []
  const videoExts = new Set(['.mov', '.mp4', '.m4v', '.mkv', '.avi', '.webm', '.hevc'])
  const imageExts = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.gif', '.bmp', '.tiff'])

  // Scan weekly upload folders in mediaDir
  if (fs.existsSync(mediaDir)) {
    for (const weekDir of fs.readdirSync(mediaDir).filter(f => !f.startsWith('.'))) {
      const weekPath = path.join(mediaDir, weekDir)
      if (!fs.statSync(weekPath).isDirectory()) continue

      for (const sub of fs.readdirSync(weekPath).filter(f => f.startsWith('uploads-'))) {
        const subPath = path.join(weekPath, sub)
        if (!fs.statSync(subPath).isDirectory()) continue
        const date = sub.replace('uploads-', '')

        for (const f of fs.readdirSync(subPath).filter(f => !f.startsWith('.'))) {
          const fPath = path.join(subPath, f)
          const stat = fs.statSync(fPath)
          if (!stat.isFile()) continue
          const ext = path.extname(f).toLowerCase()
          const type = videoExts.has(ext) ? 'video' : imageExts.has(ext) ? 'image' : 'file'
          allFiles.push({ filename: f, path: fPath, size: stat.size, date, weekKey: weekDir, modified: stat.mtime.toISOString(), type })
        }
      }
    }
  }

  function scanFilesRecursive(root: string, bucket: string, onlyImages = false) {
    if (!fs.existsSync(root)) return
    const walk = (dir: string) => {
      for (const name of fs.readdirSync(dir).filter(f => !f.startsWith('.'))) {
        const fPath = path.join(dir, name)
        const stat = fs.statSync(fPath)
        if (stat.isDirectory()) {
          walk(fPath)
          continue
        }
        if (!stat.isFile()) continue
        const ext = path.extname(name).toLowerCase()
        const type = videoExts.has(ext) ? 'video' : imageExts.has(ext) ? 'image' : 'file'
        if (onlyImages && type !== 'image') continue
        const rel = path.relative(root, fPath)
        allFiles.push({ filename: rel, path: fPath, size: stat.size, date: '', weekKey: bucket, modified: stat.mtime.toISOString(), type })
      }
    }
    walk(root)
  }

  // Scan images directory recursively. This is the dedicated local folder for reusable post image material.
  if (imagesDir && fs.existsSync(imagesDir)) {
    scanFilesRecursive(imagesDir, 'images', true)
  }

  // Scan rendered videos — per-feature folders. Surface current.* (latest version) only.
  const renderedRoots = [
    { dir: path.join(mediaDir, 'rendered', 'features'), bucket: 'rendered-features' },
    { dir: path.join(mediaDir, 'rendered', 'demos'), bucket: 'rendered-demos' },
  ]
  for (const { dir, bucket } of renderedRoots) {
    if (!fs.existsSync(dir)) continue
    for (const featureSlug of fs.readdirSync(dir).filter(f => !f.startsWith('.') && !f.startsWith('_'))) {
      const featureDir = path.join(dir, featureSlug)
      if (!fs.statSync(featureDir).isDirectory()) continue
      const currentFiles = fs.readdirSync(featureDir).filter(f => f.startsWith('current.'))
      for (const f of currentFiles) {
        const fPath = path.join(featureDir, f)
        const stat = fs.statSync(fPath)
        if (!stat.isFile()) continue
        const ext = path.extname(f).toLowerCase()
        const type = videoExts.has(ext) ? 'video' : imageExts.has(ext) ? 'image' : 'file'
        // surface as the feature slug, not 'current.mp4'
        allFiles.push({ filename: featureSlug + ext, path: fPath, size: stat.size, date: '', weekKey: bucket, modified: stat.mtime.toISOString(), type })
      }
    }
  }

  // Scan raw OBS captures
  const rawDir = path.join(mediaDir, '..', 'raw')
  if (fs.existsSync(rawDir)) {
    for (const f of fs.readdirSync(rawDir).filter(f => !f.startsWith('.'))) {
      const fPath = path.join(rawDir, f)
      const stat = fs.statSync(fPath)
      if (!stat.isFile()) continue
      const ext = path.extname(f).toLowerCase()
      const type = videoExts.has(ext) ? 'video' : imageExts.has(ext) ? 'image' : 'file'
      allFiles.push({ filename: f, path: fPath, size: stat.size, date: '', weekKey: 'raw-obs', modified: stat.mtime.toISOString(), type })
    }
  }

  // Scan idea photos — uploaded via the Ideas page. Each idea has its own subfolder.
  scanFilesRecursive(path.join(mediaDir, 'ideas'), 'ideas')
  // Scan post media — uploaded via the post media drop zone.
  scanFilesRecursive(path.join(mediaDir, 'posts'), 'post-uploads')

  allFiles.sort((a, b) => b.modified.localeCompare(a.modified))
  res.json(allFiles)
})

// --- Premiere Integration ---
function premiereRoots(): string[] {
  const mediaDir = getMediaDir() // .../media/videos
  const mediaParent = path.dirname(mediaDir) // .../media
  return [
    path.join(mediaParent, 'premiere'),
    path.join(mediaDir, 'rendered'),
  ]
}

function findPrprojFiles(root: string, depth = 4, out: string[] = []): string[] {
  if (!fs.existsSync(root) || depth < 0) return out
  for (const f of fs.readdirSync(root).filter((n) => !n.startsWith('.') && !n.startsWith('_'))) {
    const fp = path.join(root, f)
    let stat: fs.Stats
    try { stat = fs.statSync(fp) } catch { continue }
    if (stat.isDirectory()) {
      // Skip Premiere autosave folders — they explode with stale copies
      if (f === 'Adobe Premiere Pro Auto-Save' || f === 'Adobe Premiere Pro Audio Previews') continue
      findPrprojFiles(fp, depth - 1, out)
    } else if (stat.isFile() && f.endsWith('.prproj')) {
      out.push(fp)
    }
  }
  return out
}

app.get('/api/premiere/projects', (_req, res) => {
  const mediaDir = getMediaDir()
  const mediaParent = path.dirname(mediaDir)
  const projects: any[] = []
  for (const root of premiereRoots()) {
    for (const fp of findPrprojFiles(root)) {
      const stat = fs.statSync(fp)
      const folder = path.dirname(fp)
      const rel = path.relative(mediaParent, fp)
      // detect a sibling current.* video if this .prproj sits in a feature folder
      let videoPath: string | null = null
      const siblings = fs.readdirSync(folder).filter((n) => n.startsWith('current.'))
      if (siblings.length > 0) videoPath = path.join(folder, siblings[0])
      // exports count
      const exportsDir = path.join(folder, 'exports')
      const exportsCount = fs.existsSync(exportsDir) ? fs.readdirSync(exportsDir).filter((n) => !n.startsWith('.')).length : 0
      // is this a per-feature project (under videos/rendered) or standalone (under media/premiere)?
      const kind = fp.includes(`${path.sep}rendered${path.sep}`) ? 'feature' : 'standalone'
      projects.push({
        name: path.basename(fp, '.prproj'),
        path: fp,
        folder,
        relPath: rel,
        modified: stat.mtime.toISOString(),
        size: stat.size,
        kind,
        videoPath,
        exportsCount,
      })
    }
  }
  projects.sort((a, b) => b.modified.localeCompare(a.modified))
  res.json(projects)
})

function isPathInsideMedia(p: string): boolean {
  const mediaParent = path.dirname(getMediaDir())
  const resolved = path.resolve(p)
  return resolved.startsWith(mediaParent + path.sep) || resolved === mediaParent
}

app.post('/api/premiere/open', (req, res) => {
  const fp = req.body?.path as string
  if (!fp) return res.status(400).json({ error: 'path required' })
  if (!isPathInsideMedia(fp)) return res.status(403).json({ error: 'path outside media root' })
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'not found' })
  spawn('open', ['-a', 'Adobe Premiere Pro 2026', fp], { detached: true, stdio: 'ignore' }).unref()
  res.json({ ok: true, opened: fp })
})

app.post('/api/premiere/reveal', (req, res) => {
  const fp = req.body?.path as string
  if (!fp) return res.status(400).json({ error: 'path required' })
  if (!isPathInsideMedia(fp)) return res.status(403).json({ error: 'path outside media root' })
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'not found' })
  spawn('open', ['-R', fp], { detached: true, stdio: 'ignore' }).unref()
  res.json({ ok: true, revealed: fp })
})

// Per-feature versions endpoint — list all version files for a feature
app.get('/api/media/versions', (req, res) => {
  const featurePath = req.query.feature as string
  if (!featurePath) return res.status(400).json({ error: 'feature path required' })
  if (!isPathInsideMedia(featurePath)) return res.status(403).json({ error: 'outside media directory' })
  const versionsDir = path.join(featurePath, 'versions')
  if (!fs.existsSync(versionsDir)) return res.json([])
  const files = fs.readdirSync(versionsDir).filter(f => !f.startsWith('.')).map(f => {
    const fPath = path.join(versionsDir, f)
    const stat = fs.statSync(fPath)
    return { filename: f, path: fPath, size: stat.size, modified: stat.mtime.toISOString() }
  })
  files.sort((a, b) => b.filename.localeCompare(a.filename))
  res.json(files)
})

// Serve a media file for preview (video streaming with range support)
app.get('/api/media/serve', (req, res) => {
  const filePath = req.query.path as string
  if (!filePath) return res.status(400).json({ error: 'path required' })
  if (!isPathInsideMedia(filePath)) return res.status(403).json({ error: 'Path outside media directory' })
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' })

  const stat = fs.statSync(filePath)
  const ext = path.extname(filePath).toLowerCase()
  const mimeTypes: Record<string, string> = {
    '.mov': 'video/quicktime', '.mp4': 'video/mp4', '.m4v': 'video/mp4',
    '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.webm': 'video/webm',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.heic': 'image/heic', '.heif': 'image/heif', '.webp': 'image/webp',
    '.gif': 'image/gif', '.bmp': 'image/bmp', '.tiff': 'image/tiff',
  }
  const contentType = mimeTypes[ext] || 'application/octet-stream'

  const range = req.headers.range
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-')
    const start = parseInt(parts[0], 10)
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': contentType,
    })
    fs.createReadStream(filePath, { start, end }).pipe(res)
  } else {
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': contentType,
    })
    fs.createReadStream(filePath).pipe(res)
  }
})

// --- Viral intelligence (vault watchlist + Supabase intel reads) ---
app.get('/api/viral/watchlist', (_req, res) => {
  res.json(loadWatchlistFromVault())
})

app.post('/api/viral/sync-watchlist', async (_req, res) => {
  try {
    res.json(await syncWatchlistToSupabase())
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message })
  }
})

app.get('/api/viral/intelligence', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined
    const days = req.query.days ? parseInt(String(req.query.days), 10) : undefined
    const tags = req.query.tags ? String(req.query.tags).split(',').map((t) => t.trim()).filter(Boolean) : undefined
    res.json(await fetchRecentIntel({ limit, days, tags }))
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

// --- OpenClaw VM admin (proxy to admin-control service on the VM) ---
app.get('/api/openclaw/admin/status', getOpenclawAdminStatus)
app.post('/api/openclaw/admin/pool/:name/:action', controlOpenclawPool)
app.post('/api/openclaw/admin/service/:name/:action', controlOpenclawService)

// Paperclip — Weekly Content Batch trigger (fires the routine on openclaw-vm)
registerPaperclipRoutes(app)

// Serve PWA assets (icons, manifest, favicon) in all environments
const publicPath = path.join(APP_ROOT, 'public')
app.use(express.static(publicPath))

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(APP_ROOT, 'dist')
  app.use(express.static(distPath))
  app.get('/{*path}', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Content Pipeline API running on http://0.0.0.0:${PORT}`)
  console.log(`Media directory: ${getMediaDir()}`)

  // Import Mars vault entries that were created outside the dashboard, then backfill current state.
  obsidian.importMissingFromVault(read, upsert)
  obsidian.migrateLegacyFilenames()
  obsidian.backfillAll(read)

  // --- Cortex Real-Time Sync ---
  const CORTEX_API = 'http://localhost:3456'
  const SYNC_KEY = 'cortex-content-pipeline-daily'
  const SYNC_INTERVAL = 3000
  let lastSyncHash = ''

  const SYNC_TASKS = [
    { key: 'daily-video', label: 'Daily Video', type: 'video', freq: 'daily' },
    { key: 'ig-short', label: 'IG Reel', type: 'video', platform: 'instagram', freq: 'daily' },
    { key: 'tiktok-short', label: 'TikTok', type: 'video', platform: 'tiktok', freq: 'daily' },
    { key: 'yt-short', label: 'YT Short', type: 'video', platform: 'youtube', freq: 'daily' },
    { key: 'x-post', label: 'X', type: 'post', platform: 'x', freq: 'daily' },
    { key: 'linkedin-post', label: 'LinkedIn', type: 'post', platform: 'linkedin', freq: 'daily' },
    { key: 'reddit-post', label: 'Reddit', type: 'post', platform: 'reddit', freq: 'daily' },
    { key: 'yt-video', label: 'YT Video', type: 'video', platform: 'youtube', freq: 'weekly' },
  ] as const

  function getSyncWeekInfo() {
    const now = new Date()
    const day = now.getDay()
    const monday = new Date(now)
    monday.setDate(now.getDate() - ((day + 6) % 7))
    const jan1 = new Date(monday.getFullYear(), 0, 1)
    const weekNum = Math.ceil(((monday.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
    const weekKey = `${monday.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
    const todayStr = now.toISOString().split('T')[0]
    return { weekKey, todayStr }
  }

  function buildPipelineState() {
    try {
      const { weekKey, todayStr } = getSyncWeekInfo()
      const weeklyRaw = readWeekly()
      const weekData = weeklyRaw[weekKey] || {}
      const todayData = weekData[todayStr] || {}
      const videos = read<any>('videos')
      const posts = read<any>('posts')
      const config = readConfig()
      const project = config.projects.find((p: any) => p.id === config.activeProject) || config.projects[0]
      const frozen: string[] = project.frozenTasks || []

      const tasks = SYNC_TASKS.map(task => {
        const isFrozen = frozen.includes(task.key)
        const val = todayData[task.key]
        let status = 'pending'
        let contentId: string | undefined

        if (isFrozen) {
          status = 'frozen'
        } else if (val === 'skipped') {
          status = 'skipped'
        } else if (val && typeof val === 'string') {
          contentId = val
          const video = videos.find((v: any) => v.id === val)
          const post = posts.find((p: any) => p.id === val)
          const contentStatus = video?.status || post?.status
          status = contentStatus === 'posted' ? 'posted' : 'in-progress'
        }

        return { key: task.key, label: task.label, type: task.type, freq: task.freq, status, contentId }
      })

      const active = tasks.filter(t => t.status !== 'frozen' && t.status !== 'skipped')
      const completedCount = active.filter(t => t.status === 'posted').length
      const pct = active.length > 0 ? Math.round((completedCount / active.length) * 100) : 0

      return {
        date: todayStr,
        weekKey,
        tasks,
        frozenTasks: frozen,
        pct,
        updatedAt: new Date().toISOString(),
        source: 'content-pipeline',
      }
    } catch {
      return null
    }
  }

  async function pushToCortex(state: any) {
    try {
      await fetch(`${CORTEX_API}/api/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: SYNC_KEY, data: state }),
        signal: AbortSignal.timeout(2000),
      })
    } catch {
      // Cortex not running — silent
    }
  }

  async function pullFromCortex() {
    try {
      const res = await fetch(`${CORTEX_API}/api/data?key=${encodeURIComponent(SYNC_KEY)}`, {
        signal: AbortSignal.timeout(2000),
      })
      if (!res.ok) return null
      const data = await res.json()
      if (!data || data.source === 'content-pipeline') return null
      return data
    } catch {
      return null
    }
  }

  async function syncLoop() {
    // Pull changes from cortex
    const cortexData = await pullFromCortex()
    if (cortexData && cortexData.date) {
      try {
        const { weekKey } = getSyncWeekInfo()
        const weeklyRaw = readWeekly()
        const weekData = weeklyRaw[weekKey] || {}
        const dayData = weekData[cortexData.date] || {}
        let changed = false

        for (const task of cortexData.tasks || []) {
          if (task.status === 'skipped' && dayData[task.key] !== 'skipped') {
            dayData[task.key] = 'skipped'
            changed = true
          }
          if (task.status === 'pending' && dayData[task.key] === 'skipped') {
            delete dayData[task.key]
            changed = true
          }
          // Cancel from cortex — revert a posted/in-progress task back to pending
          if (task.status === 'pending' && task.contentId && dayData[task.key] && dayData[task.key] !== 'skipped') {
            const video = findById<any>('videos', task.contentId)
            if (video && (video.status === 'posted' || video.status === 'ready' || video.status === 'scheduled')) {
              video.status = 'idea'
              video.updatedAt = new Date().toISOString()
              upsert('videos', video)
              changed = true
            }
            const post = findById<any>('posts', task.contentId)
            if (post && (post.status === 'posted' || post.status === 'scheduled')) {
              post.status = 'draft'
              post.updatedAt = new Date().toISOString()
              post.postedAt = null
              upsert('posts', post)
              changed = true
            }
          }
        }

        if (changed) {
          weekData[cortexData.date] = dayData
          weeklyRaw[weekKey] = weekData
          writeWeekly(weeklyRaw)
        }
      } catch {
        // ignore parse errors
      }
    }

    // Push current state to cortex
    const state = buildPipelineState()
    if (!state) return

    const hash = JSON.stringify(state.tasks) + state.pct
    if (hash !== lastSyncHash) {
      lastSyncHash = hash
      await pushToCortex(state)
    }
  }

  setInterval(syncLoop, SYNC_INTERVAL)
  // Initial sync after 1s
  setTimeout(syncLoop, 1000)
  console.log(`Cortex sync enabled → ${CORTEX_API} (every ${SYNC_INTERVAL / 1000}s)`)
})
