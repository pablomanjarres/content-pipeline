// B-roll library — planned-shot catalog plus per-shot file tracking.
//
// Catalog: data/projects/<projectId>/brolls-catalog.json (per-project, editable).
//   Seeded from DEFAULT_BROLL_CATALOG on first read.
// Files:   <media-root>/brolls/<categoryId>/<typeId>/<shotId>/<file>
//   media-root = path.dirname(activeProject.mediaDir)

import type { Express, Request, Response } from 'express'
import fs from 'fs'
import path from 'path'
import multer from 'multer'
import os from 'os'
import { spawn } from 'child_process'
import {
  DEFAULT_BROLL_CATALOG,
  countShots,
  type BrollCatalog,
  type BrollCategory,
  type BrollShot,
  type BrollType,
  type ShotSize,
} from './brolls-catalog.default.js'

const VIDEO_EXTS = new Set(['.mov', '.mp4', '.m4v', '.mkv', '.avi', '.webm', '.hevc'])
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.gif'])

interface Deps {
  getMediaDir: () => string
  getProjectDataDir: () => string
}

interface BrollFile {
  filename: string
  path: string
  size: number
  modified: string
  type: 'video' | 'image' | 'file'
  shotSize: ShotSize | null
}

interface ShotWithFiles extends BrollShot {
  folder: string
  files: BrollFile[]
  fileCount: number
  recordedSizes: ShotSize[]
  untaggedCount: number
}

interface TypeWithFiles extends Omit<BrollType, 'shots'> {
  shots: ShotWithFiles[]
}

interface CategoryWithFiles extends Omit<BrollCategory, 'types'> {
  types: TypeWithFiles[]
}

interface CatalogResponse {
  version: 1
  brollsRoot: string
  totalShots: number
  recordedShots: number
  totalFiles: number
  categories: CategoryWithFiles[]
}

function brollsRoot(deps: Deps): string {
  return path.join(path.dirname(deps.getMediaDir()), 'brolls')
}

function catalogPath(deps: Deps): string {
  return path.join(deps.getProjectDataDir(), 'brolls-catalog.json')
}

function readCatalog(deps: Deps): BrollCatalog {
  const fp = catalogPath(deps)
  if (!fs.existsSync(fp)) {
    fs.mkdirSync(path.dirname(fp), { recursive: true })
    fs.writeFileSync(fp, JSON.stringify(DEFAULT_BROLL_CATALOG, null, 2))
    return JSON.parse(JSON.stringify(DEFAULT_BROLL_CATALOG))
  }
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf-8')) as BrollCatalog
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_BROLL_CATALOG))
  }
}

function writeCatalog(deps: Deps, catalog: BrollCatalog): void {
  const fp = catalogPath(deps)
  fs.mkdirSync(path.dirname(fp), { recursive: true })
  fs.writeFileSync(fp, JSON.stringify(catalog, null, 2))
}

function shotFolder(deps: Deps, categoryId: string, typeId: string, shotId: string): string {
  return path.join(brollsRoot(deps), categoryId, typeId, shotId)
}

// Per-clip sidecar metadata. Lives next to the clip files as a hidden JSON.
// Shape: { "<filename>": { "size": "close" | "medium" | "wide" | null } }
const META_FILENAME = '.brolls-meta.json'

interface ClipMeta { size?: ShotSize | null }
type ShotMeta = Record<string, ClipMeta>

function readShotMeta(folder: string): ShotMeta {
  const fp = path.join(folder, META_FILENAME)
  if (!fs.existsSync(fp)) return {}
  try {
    const raw = JSON.parse(fs.readFileSync(fp, 'utf-8'))
    return raw && typeof raw === 'object' ? (raw as ShotMeta) : {}
  } catch {
    return {}
  }
}

function writeShotMeta(folder: string, meta: ShotMeta): void {
  const fp = path.join(folder, META_FILENAME)
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(fp, JSON.stringify(meta, null, 2))
}

function isValidSize(v: unknown): v is ShotSize {
  return v === 'close' || v === 'medium' || v === 'wide'
}

function isPathInsideBrolls(deps: Deps, p: string): boolean {
  const root = brollsRoot(deps)
  const resolved = path.resolve(p)
  return resolved === root || resolved.startsWith(root + path.sep)
}

function listShotFiles(folder: string): BrollFile[] {
  if (!fs.existsSync(folder)) return []
  const meta = readShotMeta(folder)
  const out: BrollFile[] = []
  for (const name of fs.readdirSync(folder).filter((n) => !n.startsWith('.'))) {
    const fp = path.join(folder, name)
    let stat: fs.Stats
    try { stat = fs.statSync(fp) } catch { continue }
    if (!stat.isFile()) continue
    const ext = path.extname(name).toLowerCase()
    const type = VIDEO_EXTS.has(ext) ? 'video' : IMAGE_EXTS.has(ext) ? 'image' : 'file'
    const tagged = meta[name]?.size
    const shotSize = isValidSize(tagged) ? tagged : null
    out.push({ filename: name, path: fp, size: stat.size, modified: stat.mtime.toISOString(), type, shotSize })
  }
  out.sort((a, b) => b.modified.localeCompare(a.modified))
  return out
}

function decorate(deps: Deps, catalog: BrollCatalog): CatalogResponse {
  let totalShots = 0
  let recordedShots = 0
  let totalFiles = 0
  const categories: CategoryWithFiles[] = catalog.categories.map((c) => ({
    ...c,
    types: c.types.map((t) => ({
      ...t,
      shots: t.shots.map((s) => {
        const folder = shotFolder(deps, c.id, t.id, s.id)
        const files = listShotFiles(folder)
        const recordedSet = new Set<ShotSize>()
        let untagged = 0
        for (const f of files) {
          if (f.shotSize) recordedSet.add(f.shotSize)
          else untagged += 1
        }
        const recordedSizes: ShotSize[] = (['close', 'medium', 'wide'] as ShotSize[]).filter((sz) => recordedSet.has(sz))
        totalShots += 1
        if (files.length > 0) recordedShots += 1
        totalFiles += files.length
        return { ...s, folder, files, fileCount: files.length, recordedSizes, untaggedCount: untagged }
      }),
    })),
  }))
  return {
    version: 1,
    brollsRoot: brollsRoot(deps),
    totalShots,
    recordedShots,
    totalFiles,
    categories,
  }
}

function scaffoldFolders(deps: Deps, catalog: BrollCatalog): { created: number } {
  let created = 0
  for (const c of catalog.categories) {
    for (const t of c.types) {
      for (const s of t.shots) {
        const dir = shotFolder(deps, c.id, t.id, s.id)
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
          created += 1
        }
      }
    }
  }
  return { created }
}

export function registerBrollsRoutes(app: Express, deps: Deps): void {
  const upload = multer({ dest: path.join(os.tmpdir(), 'content-pipeline-brolls') })

  // Read catalog with file metadata. Auto-scaffolds folders so Pablo can drop
  // files in via Finder right away.
  app.get('/api/brolls', (_req: Request, res: Response) => {
    try {
      const catalog = readCatalog(deps)
      scaffoldFolders(deps, catalog)
      res.json(decorate(deps, catalog))
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      res.status(500).json({ error: message })
    }
  })

  // Re-create any missing folders (idempotent).
  app.post('/api/brolls/scaffold', (_req: Request, res: Response) => {
    const catalog = readCatalog(deps)
    const result = scaffoldFolders(deps, catalog)
    res.json({ ok: true, ...result })
  })

  // Reset catalog to defaults (kept manual — destructive).
  app.post('/api/brolls/reset-catalog', (_req: Request, res: Response) => {
    writeCatalog(deps, JSON.parse(JSON.stringify(DEFAULT_BROLL_CATALOG)))
    res.json({ ok: true, totalShots: countShots(DEFAULT_BROLL_CATALOG) })
  })

  // Upload one or more files into a shot folder.
  app.post(
    '/api/brolls/upload/:categoryId/:typeId/:shotId',
    upload.array('files', 20),
    (req: Request, res: Response) => {
      const { categoryId, typeId, shotId } = req.params
      const catalog = readCatalog(deps)
      const cat = catalog.categories.find((c) => c.id === categoryId)
      const typ = cat?.types.find((t) => t.id === typeId)
      const shot = typ?.shots.find((s) => s.id === shotId)
      if (!cat || !typ || !shot) return res.status(404).json({ error: 'Shot not found' })
      const dir = shotFolder(deps, categoryId, typeId, shotId)
      fs.mkdirSync(dir, { recursive: true })
      const files = (req.files as Express.Multer.File[] | undefined) || []
      const moved: string[] = []
      for (const f of files) {
        const target = path.join(dir, f.originalname)
        fs.renameSync(f.path, target)
        moved.push(target)
      }
      res.json({ ok: true, moved })
    },
  )

  // Open a shot's folder in Finder so Pablo can drag files in.
  app.post('/api/brolls/reveal', (req: Request, res: Response) => {
    const { categoryId, typeId, shotId } = req.body || {}
    if (!categoryId || !typeId || !shotId) return res.status(400).json({ error: 'categoryId, typeId, shotId required' })
    const dir = shotFolder(deps, categoryId, typeId, shotId)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    spawn('open', [dir], { detached: true, stdio: 'ignore' }).unref()
    res.json({ ok: true, opened: dir })
  })

  // Delete a single clip from a shot folder. Also removes its sidecar entry.
  app.delete('/api/brolls/file', (req: Request, res: Response) => {
    const filePath = req.body?.path as string
    if (!filePath) return res.status(400).json({ error: 'path required' })
    if (!isPathInsideBrolls(deps, filePath)) return res.status(403).json({ error: 'Path outside brolls directory' })
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'not found' })
    const folder = path.dirname(filePath)
    const filename = path.basename(filePath)
    fs.unlinkSync(filePath)
    const meta = readShotMeta(folder)
    if (meta[filename]) {
      delete meta[filename]
      writeShotMeta(folder, meta)
    }
    res.json({ ok: true })
  })

  // Tag a clip with its shot size (close / medium / wide) or null to untag.
  app.patch('/api/brolls/clip-meta', (req: Request, res: Response) => {
    const filePath = req.body?.path as string
    const sizeRaw = req.body?.size
    if (!filePath) return res.status(400).json({ error: 'path required' })
    if (!isPathInsideBrolls(deps, filePath)) return res.status(403).json({ error: 'Path outside brolls directory' })
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'file not found' })
    const folder = path.dirname(filePath)
    const filename = path.basename(filePath)
    const meta = readShotMeta(folder)
    if (sizeRaw === null || sizeRaw === undefined || sizeRaw === '') {
      delete meta[filename]
    } else if (isValidSize(sizeRaw)) {
      meta[filename] = { size: sizeRaw }
    } else {
      return res.status(400).json({ error: 'size must be close, medium, wide, or null' })
    }
    writeShotMeta(folder, meta)
    res.json({ ok: true, filename, size: meta[filename]?.size ?? null })
  })

  // Patch a shot (e.g. update planned shot sizes, notes, or tags).
  app.patch('/api/brolls/shot/:categoryId/:typeId/:shotId', (req: Request, res: Response) => {
    const { categoryId, typeId, shotId } = req.params
    const catalog = readCatalog(deps)
    const cat = catalog.categories.find((c) => c.id === categoryId)
    const typ = cat?.types.find((t) => t.id === typeId)
    const shot = typ?.shots.find((s) => s.id === shotId)
    if (!shot) return res.status(404).json({ error: 'Shot not found' })

    const body = req.body || {}
    if (Array.isArray(body.shotSizes)) {
      const allowed: ShotSize[] = ['close', 'medium', 'wide']
      shot.shotSizes = body.shotSizes.filter((s: unknown): s is ShotSize => typeof s === 'string' && allowed.includes(s as ShotSize))
    }
    if (typeof body.name === 'string' && body.name.trim()) shot.name = body.name.trim()
    if (typeof body.notes === 'string') shot.notes = body.notes
    if (typeof body.duration === 'string' && body.duration.trim()) shot.duration = body.duration.trim()
    if (Array.isArray(body.tags)) shot.tags = body.tags.filter((t: unknown) => typeof t === 'string')
    writeCatalog(deps, catalog)
    res.json({ ok: true, shot })
  })

  // Add a new custom shot under an existing type.
  app.post('/api/brolls/shot/:categoryId/:typeId', (req: Request, res: Response) => {
    const { categoryId, typeId } = req.params
    const catalog = readCatalog(deps)
    const cat = catalog.categories.find((c) => c.id === categoryId)
    const typ = cat?.types.find((t) => t.id === typeId)
    if (!cat || !typ) return res.status(404).json({ error: 'Category/type not found' })
    const body = req.body || {}
    const id = String(body.id || body.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60)
    if (!id) return res.status(400).json({ error: 'id or name required' })
    if (typ.shots.some((s) => s.id === id)) return res.status(409).json({ error: 'Shot id already exists' })
    const shot: BrollShot = {
      id,
      name: String(body.name || id),
      shotSizes: Array.isArray(body.shotSizes) ? body.shotSizes : ['medium'],
      duration: typeof body.duration === 'string' ? body.duration : '4-8s',
      kind: body.kind || 'illustrative',
      tags: Array.isArray(body.tags) ? body.tags : [],
      notes: typeof body.notes === 'string' ? body.notes : undefined,
    }
    typ.shots.push(shot)
    writeCatalog(deps, catalog)
    fs.mkdirSync(shotFolder(deps, categoryId, typeId, id), { recursive: true })
    res.status(201).json({ ok: true, shot })
  })

  // Delete a shot from the catalog (does NOT delete files on disk).
  app.delete('/api/brolls/shot/:categoryId/:typeId/:shotId', (req: Request, res: Response) => {
    const { categoryId, typeId, shotId } = req.params
    const catalog = readCatalog(deps)
    const cat = catalog.categories.find((c) => c.id === categoryId)
    const typ = cat?.types.find((t) => t.id === typeId)
    if (!cat || !typ) return res.status(404).json({ error: 'Category/type not found' })
    const before = typ.shots.length
    typ.shots = typ.shots.filter((s) => s.id !== shotId)
    if (typ.shots.length === before) return res.status(404).json({ error: 'Shot not found' })
    writeCatalog(deps, catalog)
    res.json({ ok: true })
  })
}
