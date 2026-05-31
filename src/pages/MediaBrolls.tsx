import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

type ShotSize = 'close' | 'medium' | 'wide'

interface BrollFile {
  filename: string
  path: string
  size: number
  modified: string
  type: 'video' | 'image' | 'file'
  shotSize: ShotSize | null
}

interface Shot {
  id: string
  name: string
  shotSizes: ShotSize[]
  duration: string
  kind: string
  tags: string[]
  notes?: string
  series?: string
  folder: string
  files: BrollFile[]
  fileCount: number
  recordedSizes: ShotSize[]
  untaggedCount: number
}

interface CatType {
  id: string
  name: string
  shots: Shot[]
}

interface Category {
  id: string
  name: string
  icon: string
  color: string
  description?: string
  types: CatType[]
}

interface CatalogResponse {
  version: 1
  brollsRoot: string
  totalShots: number
  recordedShots: number
  totalFiles: number
  categories: Category[]
}

const SHOT_SIZE_LABEL: Record<ShotSize, string> = { close: 'Close', medium: 'Medium', wide: 'Wide' }
const SHOT_SIZE_ORDER: ShotSize[] = ['close', 'medium', 'wide']

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function CategoryIcon({ id }: { id: string }) {
  const props = { width: '14', height: '14', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (id) {
    case 'founder-life': return <svg {...props}><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>
    case 'startup-day-one': return <svg {...props}><path d="M4 22V4l16 4-16 4"/></svg>
    case 'gym': return <svg {...props}><path d="M6.5 6.5L18 18M2 12h20M5 9v6M19 9v6M2 9v6M22 9v6"/></svg>
    case 'swim': return <svg {...props}><path d="M2 18s2-2 5-2 5 2 5 2 2-2 5-2 5 2 5 2"/><path d="M2 12s2-2 5-2 5 2 5 2 2-2 5-2 5 2 5 2"/><circle cx="17" cy="6" r="2"/></svg>
    case 'college': return <svg {...props}><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1 3 3 6 3s6-2 6-3v-5"/></svg>
    case 'personal-brand': return <svg {...props}><polygon points="12 2 15 9 22 10 17 15 18 22 12 19 6 22 7 15 2 10 9 9 12 2"/></svg>
    case 'lifestyle': return <svg {...props}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/></svg>
    default: return <svg {...props}><circle cx="12" cy="12" r="10"/></svg>
  }
}

function CopyPathButton({ path, className }: { path: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const onClick = async (e: MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(path)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {}
  }
  return (
    <button
      onClick={onClick}
      title={copied ? 'Copied!' : 'Copy file path'}
      className={`transition-colors cursor-pointer ${copied ? 'text-emerald-400' : 'text-white/25 hover:text-white/70'} ${className ?? ''}`}
    >
      {copied ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      )}
    </button>
  )
}

function ShotSizeBadge({ size, recorded }: { size: ShotSize; recorded: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors ${
        recorded
          ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
          : 'bg-white/[0.04] border-white/10 text-white/40'
      }`}
    >
      {recorded && (
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
          <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
      {SHOT_SIZE_LABEL[size]}
    </span>
  )
}

function ClipSizePicker({
  value,
  onChange,
  size = 'sm',
}: {
  value: ShotSize | null
  onChange: (next: ShotSize | null) => void
  size?: 'sm' | 'xs'
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange((e.target.value || null) as ShotSize | null)}
      onClick={(e) => e.stopPropagation()}
      className={`bg-black/60 border border-white/15 text-white/90 rounded backdrop-blur cursor-pointer outline-none focus:border-white/40 ${
        size === 'xs' ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-2 py-0.5'
      }`}
    >
      <option value="">Untagged</option>
      <option value="close">Close</option>
      <option value="medium">Medium</option>
      <option value="wide">Wide</option>
    </select>
  )
}

function ShotCard({
  shot,
  category,
  type,
  onReveal,
  onUpload,
  onDeleteFile,
  onPlay,
  onSetClipSize,
}: {
  shot: Shot
  category: Category
  type: CatType
  onReveal: () => void
  onUpload: (files: FileList) => void
  onDeleteFile: (file: BrollFile) => void
  onPlay: (file: BrollFile) => void
  onSetClipSize: (file: BrollFile, size: ShotSize | null) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showFiles, setShowFiles] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [clipIndex, setClipIndex] = useState(0)
  const recorded = shot.fileCount > 0

  // Clamp index when files change underneath us.
  const safeIndex = Math.min(clipIndex, Math.max(0, shot.files.length - 1))
  const currentFile = shot.files[safeIndex]
  const previewUrl = currentFile ? `/api/media/serve?path=${encodeURIComponent(currentFile.path)}` : null
  const videoRef = useRef<HTMLVideoElement>(null)

  // Reset playback when switching clips.
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.currentTime = 0
    }
  }, [currentFile?.path])

  const goPrev = () => setClipIndex((i) => (i - 1 + shot.files.length) % shot.files.length)
  const goNext = () => setClipIndex((i) => (i + 1) % shot.files.length)

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (e.dataTransfer.files?.length) onUpload(e.dataTransfer.files)
      }}
      className={`glass glass-border rounded-2xl overflow-hidden transition-all ${
        dragOver ? 'ring-2 ring-emerald-400/60 bg-emerald-500/5' : ''
      } ${recorded ? '' : 'opacity-95'}`}
    >
      {/* Preview */}
      <div className="relative aspect-[9/16] bg-black group/preview">
        {previewUrl && currentFile?.type === 'video' ? (
          <video
            ref={videoRef}
            key={currentFile.path}
            src={previewUrl}
            muted
            loop
            playsInline
            preload="metadata"
            className="w-full h-full object-cover cursor-pointer"
            onMouseEnter={() => videoRef.current?.play().catch(() => {})}
            onMouseLeave={() => { if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0 } }}
            onClick={() => currentFile && onPlay(currentFile)}
          />
        ) : previewUrl ? (
          <img src={previewUrl} alt={shot.name} className="w-full h-full object-cover cursor-pointer" onClick={() => currentFile && onPlay(currentFile)} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-white/[0.06] flex items-center justify-center mb-2">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-white/30">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
              </div>
              <p className="text-[10px] text-white/30 px-3">Drop clips or click ↑</p>
            </div>
          </div>
        )}

        {/* Top-left: clip counter + per-clip size picker (current clip) */}
        {currentFile && (
          <div className="absolute top-2 left-2 flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/60 text-white/85 backdrop-blur">
              {safeIndex + 1}/{shot.files.length}
            </span>
            <ClipSizePicker
              value={currentFile.shotSize}
              onChange={(next) => onSetClipSize(currentFile, next)}
              size="xs"
            />
          </div>
        )}

        {/* Top-right: duration + copy path */}
        <div className="absolute top-2 right-2 flex items-center gap-1.5">
          {currentFile && (
            <span className="px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur opacity-0 group-hover/preview:opacity-100 transition-opacity">
              <CopyPathButton path={currentFile.path} className="!text-white/70 hover:!text-white flex items-center" />
            </span>
          )}
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-black/60 text-white/60 backdrop-blur">
            {shot.duration}
          </span>
        </div>

        {/* Clip nav arrows — only when more than one clip */}
        {shot.files.length > 1 && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); goPrev() }}
              className="absolute left-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/55 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur opacity-0 group-hover/preview:opacity-100 transition-opacity cursor-pointer"
              aria-label="Previous clip"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); goNext() }}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/55 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur opacity-0 group-hover/preview:opacity-100 transition-opacity cursor-pointer"
              aria-label="Next clip"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>

            {/* Bottom dots */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1">
              {shot.files.map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); setClipIndex(i) }}
                  className={`w-1.5 h-1.5 rounded-full transition-colors cursor-pointer ${
                    i === safeIndex ? 'bg-white' : 'bg-white/40 hover:bg-white/70'
                  }`}
                  aria-label={`Jump to clip ${i + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Body */}
      <div className="p-3 space-y-2.5">
        <div>
          <p className="text-[13px] font-medium text-white/90 leading-snug">{shot.name}</p>
          {shot.notes && (
            <p className="text-[11px] text-white/40 mt-0.5 leading-snug">{shot.notes}</p>
          )}
        </div>

        {/* Shot sizes — green-checked when at least one *tagged* clip exists for that size */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {SHOT_SIZE_ORDER.filter((s) => shot.shotSizes.includes(s)).map((size) => (
            <ShotSizeBadge key={size} size={size} recorded={shot.recordedSizes.includes(size)} />
          ))}
          {shot.untaggedCount > 0 && (
            <span className="text-[10px] text-amber-300/80 ml-1" title="Tag each clip's size to update the checkmarks">
              {shot.untaggedCount} untagged
            </span>
          )}
        </div>

        {/* Tags + kind */}
        {(shot.tags.length > 0 || shot.kind) && (
          <div className="flex flex-wrap gap-1">
            {shot.kind && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded text-violet-200/80 bg-violet-500/10 border border-violet-400/15"
                title="Shot kind"
              >
                {shot.kind}
              </span>
            )}
            {shot.tags.map((t) => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded text-white/45 bg-white/[0.04]">
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1.5 pt-1">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.06] hover:bg-white/[0.12] text-white/70 hover:text-white transition-colors cursor-pointer"
            title="Upload files"
          >
            Upload
          </button>
          <button
            onClick={onReveal}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.06] hover:bg-white/[0.12] text-white/70 hover:text-white transition-colors cursor-pointer"
            title="Open folder in Finder"
          >
            Finder
          </button>
          {shot.fileCount > 0 && (
            <button
              onClick={() => setShowFiles((v) => !v)}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.06] hover:bg-white/[0.12] text-white/70 hover:text-white transition-colors cursor-pointer"
              title="Toggle file list"
            >
              {showFiles ? 'Hide' : 'Files'}
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="video/*,image/*"
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) onUpload(e.target.files); e.target.value = '' }}
        />

        <AnimatePresence>
          {showFiles && shot.files.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden border-t border-white/[0.06] -mx-3 -mb-3 mt-1"
            >
              <div className="px-3 py-2 space-y-1 max-h-48 overflow-y-auto">
                {shot.files.map((f, i) => {
                  const isCurrent = i === safeIndex
                  return (
                    <div
                      key={f.path}
                      className={`flex items-center gap-2 text-[11px] group rounded-md px-1 py-1 ${
                        isCurrent ? 'bg-white/[0.05]' : ''
                      }`}
                    >
                      <button
                        onClick={() => setClipIndex(i)}
                        className={`flex-1 truncate text-left cursor-pointer ${
                          isCurrent ? 'text-white' : 'text-white/55 hover:text-white/85'
                        }`}
                        title={f.filename}
                      >
                        {f.filename}
                      </button>
                      <ClipSizePicker
                        value={f.shotSize}
                        onChange={(next) => onSetClipSize(f, next)}
                        size="xs"
                      />
                      <span className="text-white/25 tabular-nums w-14 text-right">{formatSize(f.size)}</span>
                      <CopyPathButton path={f.path} className="px-1" />
                      <button
                        onClick={() => onPlay(f)}
                        className="text-white/25 hover:text-white/70 transition-colors cursor-pointer px-1"
                        title="Play full screen"
                      >
                        ▶
                      </button>
                      <button
                        onClick={() => onDeleteFile(f)}
                        className="text-red-400/0 group-hover:text-red-400/70 hover:!text-red-400 transition-colors cursor-pointer"
                        title="Delete"
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Hidden category/type label for accessibility */}
      <span className="sr-only">{category.name} / {type.name}</span>
    </div>
  )
}

export function MediaBrolls() {
  const [data, setData] = useState<CatalogResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'recorded' | 'planned'>('all')
  const [seriesFilter, setSeriesFilter] = useState<string | null>(null)
  const [playFile, setPlayFile] = useState<BrollFile | null>(null)

  const reload = async () => {
    const r = await fetch('/api/brolls')
    const j = (await r.json()) as CatalogResponse
    setData(j)
    setLoading(false)
    if (!activeCategoryId && j.categories[0]) setActiveCategoryId(j.categories[0].id)
  }

  useEffect(() => {
    reload().catch((e) => { console.error('[brolls] load failed', e); setLoading(false) })
  }, [])

  const seriesOptions = useMemo(() => {
    if (!data) return [] as string[]
    const set = new Set<string>()
    for (const c of data.categories) for (const t of c.types) for (const s of t.shots) if (s.series) set.add(s.series)
    return Array.from(set)
  }, [data])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-white/20 text-sm font-medium">Loading b-rolls...</div>
      </div>
    )
  }

  if (!data) {
    return <div className="text-white/40 text-sm py-10">Failed to load b-roll catalog.</div>
  }

  const activeCategory = data.categories.find((c) => c.id === activeCategoryId) || data.categories[0]
  const progressPct = data.totalShots ? Math.round((data.recordedShots / data.totalShots) * 100) : 0

  function passesFilter(s: Shot, c: Category, t: CatType): boolean {
    if (filter === 'recorded' && s.fileCount === 0) return false
    if (filter === 'planned' && s.fileCount > 0) return false
    if (seriesFilter && s.series !== seriesFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const haystack = [
        s.name,
        s.notes ?? '',
        s.kind,
        s.duration,
        s.series ?? '',
        ...s.tags,
        ...s.shotSizes,
        ...s.recordedSizes,
        ...s.files.map((f) => f.shotSize ?? '').filter(Boolean),
        c.name, c.id,
        t.name, t.id,
      ].join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  }

  // Default: show only the active category. When the user searches or filters
  // by series, expand to all categories so matches across the library surface.
  const isFiltering = Boolean(search.trim()) || Boolean(seriesFilter)
  const visibleCategories = isFiltering
    ? data.categories
    : activeCategory
      ? [activeCategory]
      : data.categories

  const upload = async (categoryId: string, typeId: string, shotId: string, files: FileList) => {
    const fd = new FormData()
    Array.from(files).forEach((f) => fd.append('files', f))
    await fetch(`/api/brolls/upload/${categoryId}/${typeId}/${shotId}`, { method: 'POST', body: fd })
    await reload()
  }

  const reveal = async (categoryId: string, typeId: string, shotId: string) => {
    await fetch('/api/brolls/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId, typeId, shotId }),
    })
  }

  const deleteFile = async (file: BrollFile) => {
    if (!confirm(`Delete ${file.filename}?`)) return
    await fetch('/api/brolls/file', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: file.path }),
    })
    await reload()
  }

  const setClipSize = async (file: BrollFile, size: ShotSize | null) => {
    await fetch('/api/brolls/clip-meta', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: file.path, size }),
    })
    await reload()
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Header / progress */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-sm text-white/30">
              {data.recordedShots} of {data.totalShots} shots recorded
              {' '}&middot;{' '}
              {data.totalFiles} clip{data.totalFiles === 1 ? '' : 's'}
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-48 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full bg-emerald-400 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-[11px] text-white/40 font-medium tabular-nums w-9">{progressPct}%</span>
          </div>
        </div>
        <div className="text-[11px] text-white/30 font-mono truncate max-w-[400px]" title={data.brollsRoot}>
          {data.brollsRoot}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, tags, sizes (close/medium/wide), kind, category..."
          className="flex-1 min-w-[200px] bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-sm outline-none focus:border-white/15 placeholder:text-white/20"
        />
        <div className="flex rounded-lg overflow-hidden border border-white/[0.06]">
          {(['all', 'recorded', 'planned'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 text-xs font-medium transition-colors cursor-pointer capitalize ${
                filter === f ? 'bg-white/[0.10] text-white' : 'bg-white/[0.02] text-white/40 hover:text-white/70'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        {seriesOptions.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSeriesFilter(null)}
              className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium cursor-pointer ${
                seriesFilter === null ? 'bg-white/[0.10] text-white' : 'text-white/40 hover:text-white/70'
              }`}
            >
              All series
            </button>
            {seriesOptions.map((s) => (
              <button
                key={s}
                onClick={() => setSeriesFilter(s)}
                className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium cursor-pointer ${
                  seriesFilter === s ? 'bg-orange-500/20 text-orange-200' : 'text-white/40 hover:text-white/70'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Categories rail + content */}
      <div className="grid grid-cols-12 gap-6">
        {/* Sidebar */}
        <aside className="col-span-12 lg:col-span-3 space-y-1">
          {data.categories.map((c) => {
            const total = c.types.reduce((sum, t) => sum + t.shots.length, 0)
            const recorded = c.types.reduce((sum, t) => sum + t.shots.filter((s) => s.fileCount > 0).length, 0)
            const active = c.id === activeCategory.id
            return (
              <button
                key={c.id}
                onClick={() => setActiveCategoryId(c.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors cursor-pointer flex items-center gap-3 group ${
                  active ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
                }`}
              >
                <span
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: c.color + '24', color: c.color }}
                >
                  <CategoryIcon id={c.id} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className={`text-[13px] font-medium truncate ${active ? 'text-white' : 'text-white/70 group-hover:text-white/90'}`}>
                    {c.name}
                  </div>
                  <div className="text-[10px] text-white/30 tabular-nums">
                    {recorded}/{total}
                  </div>
                </div>
                {recorded === total && total > 0 && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-400 shrink-0">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </button>
            )
          })}
        </aside>

        {/* Main */}
        <div className="col-span-12 lg:col-span-9 space-y-8">
          {visibleCategories.map((cat) => {
            const types = cat.types
              .map((t) => ({ ...t, shots: t.shots.filter((s) => passesFilter(s, cat, t)) }))
              .filter((t) => t.shots.length > 0)

            if (types.length === 0) {
              return (
                <div key={cat.id} className="text-center py-16 text-white/30 text-sm">
                  No shots match your filter.
                </div>
              )
            }

            return (
              <section key={cat.id} className="space-y-6">
                <div className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] pb-3">
                  <div>
                    <h2 className="text-lg font-bold flex items-center gap-2">
                      <span style={{ color: cat.color }}>
                        <CategoryIcon id={cat.id} />
                      </span>
                      {cat.name}
                    </h2>
                    {cat.description && (
                      <p className="text-[12px] text-white/40 mt-0.5">{cat.description}</p>
                    )}
                  </div>
                </div>

                {types.map((typ) => (
                  <div key={typ.id} className="space-y-3">
                    <div className="flex items-center gap-3">
                      <h3 className="text-[13px] font-semibold text-white/60 uppercase tracking-wider">{typ.name}</h3>
                      <div className="flex-1 h-px bg-white/[0.04]" />
                      <span className="text-[10px] text-white/30 tabular-nums">{typ.shots.filter((s) => s.fileCount > 0).length}/{typ.shots.length}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {typ.shots.map((shot) => (
                        <ShotCard
                          key={shot.id}
                          shot={shot}
                          category={cat}
                          type={typ}
                          onReveal={() => reveal(cat.id, typ.id, shot.id)}
                          onUpload={(files) => upload(cat.id, typ.id, shot.id, files)}
                          onDeleteFile={deleteFile}
                          onSetClipSize={setClipSize}
                          onPlay={(f) => setPlayFile(f)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            )
          })}
        </div>
      </div>

      {/* Player modal */}
      <AnimatePresence>
        {playFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPlayFile(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm cursor-pointer"
          >
            <div onClick={(e) => e.stopPropagation()} className="max-w-3xl w-full max-h-[85vh] cursor-default">
              {playFile.type === 'video' ? (
                <video
                  src={`/api/media/serve?path=${encodeURIComponent(playFile.path)}`}
                  controls
                  autoPlay
                  className="w-full max-h-[85vh] rounded-2xl"
                />
              ) : (
                <img
                  src={`/api/media/serve?path=${encodeURIComponent(playFile.path)}`}
                  alt={playFile.filename}
                  className="w-full max-h-[85vh] object-contain rounded-2xl"
                />
              )}
              <div className="mt-3 flex items-center justify-between text-xs text-white/50">
                <span className="truncate">{playFile.filename}</span>
                <button
                  onClick={() => setPlayFile(null)}
                  className="px-3 py-1 rounded-md bg-white/[0.08] hover:bg-white/[0.14] text-white/80 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
