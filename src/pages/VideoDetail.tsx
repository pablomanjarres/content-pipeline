import { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { getVideo, updateVideo, updateVideoStatus } from '../lib/api'
import { STATUS_ORDER, STATUS_LABELS, STATUS_COLORS, CATEGORY_COLORS, type Video, type Status, type Category } from '../lib/types'

interface ProjectData {
  folderPath: string
  script: string
  sources: { filename: string; path: string; size: number }[]
  exports: { filename: string; path: string; size: number }[]
}

interface SourceFile {
  filename: string; path: string; size: number; week: string; date: string
}

interface Props {
  id: string
  onBack: () => void
}

export function VideoDetail({ id, onBack }: Props) {
  const [video, setVideo] = useState<Video | null>(null)
  const [project, setProject] = useState<ProjectData | null>(null)
  const [script, setScript] = useState('')
  const [saving, setSaving] = useState(false)
  const [browseSources, setBrowseSources] = useState<Record<string, SourceFile[]>>({})
  const [showBrowser, setShowBrowser] = useState(false)
  const [uploading, setUploading] = useState(false)
  const exportRef = useRef<HTMLInputElement>(null)
  const sourceUploadRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    const v = await getVideo(id)
    setVideo(v)

    // Derive weekKey and slug from video
    const weekKey = getWeekKey(v.createdAt)
    const slug = slugify(v.title)

    // Init project folder
    await fetch('/api/projects/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekKey, slug, title: v.title, type: 'video' }),
    })

    // Load project
    const proj = await fetch(`/api/projects/${weekKey}/${slug}`).then(r => r.json())
    setProject(proj)
    setScript(proj.script || '')
  }

  useEffect(() => { load() }, [id])

  if (!video) return <div className="flex items-center justify-center h-40 text-white/20 text-sm">Loading project...</div>

  const weekKey = getWeekKey(video.createdAt)
  const slug = slugify(video.title)

  const save = async (updates: Partial<Video>) => {
    try {
      setSaving(true)
      const updated = await updateVideo(id, updates)
      setVideo(updated)
      setTimeout(() => setSaving(false), 500)
    } catch { setSaving(false) }
  }

  const saveScript = async () => {
    await fetch(`/api/projects/${weekKey}/${slug}/script`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: script }),
    })
  }

  const changeStatus = async (status: Status) => {
    try {
      const updated = await updateVideoStatus(id, status)
      setVideo(updated)
    } catch {}
  }

  const loadBrowseSources = async () => {
    const data = await fetch(`/api/projects/browse-sources/${weekKey}`).then(r => r.json())
    setBrowseSources(data)
    setShowBrowser(true)
  }

  const addSources = async (files: { path: string; filename: string }[]) => {
    await fetch(`/api/projects/${weekKey}/${slug}/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files }),
    })
    setShowBrowser(false)
    load()
  }

  const uploadSources = async (fileList: FileList) => {
    setUploading(true)
    try {
      const form = new FormData()
      for (const f of fileList) form.append('files', f)
      await fetch(`/api/projects/${weekKey}/${slug}/upload`, { method: 'POST', body: form })
      load()
    } catch (err) {
      console.error('Upload error:', err)
    } finally {
      setUploading(false)
    }
  }

  const uploadExport = async (files: FileList) => {
    const form = new FormData()
    form.append('file', files[0])
    await fetch(`/api/projects/${weekKey}/${slug}/exports`, { method: 'POST', body: form })
    load()
  }

  const formatSize = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)}KB` : `${(bytes / (1024 * 1024)).toFixed(1)}MB`

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="text-white/30 hover:text-white text-sm transition-colors">← Back</button>
        <div className="w-px h-4 bg-white/10" />
        <span className="text-[11px] text-white/20 font-medium uppercase tracking-wider">Video Project</span>
        {saving && <span className="text-[11px] text-emerald-400 font-medium">Saved</span>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main */}
        <div className="lg:col-span-2 space-y-5">
          {/* Title */}
          <input
            value={video.title}
            onChange={e => setVideo({ ...video, title: e.target.value })}
            onBlur={() => save({ title: video.title })}
            className="w-full bg-transparent text-2xl font-bold outline-none border-b border-white/5 focus:border-white/20 pb-2 transition-colors"
            placeholder="Video title..."
          />

          {/* Hook */}
          <div className="glass glass-border rounded-xl p-4">
            <label className="text-[11px] text-white/30 uppercase tracking-wider font-medium block mb-2">Hook — first 3 seconds</label>
            <input
              value={video.hook}
              onChange={e => setVideo({ ...video, hook: e.target.value })}
              onBlur={() => save({ hook: video.hook })}
              placeholder="Pattern interrupt, bold claim..."
              className="w-full bg-transparent text-white/90 outline-none text-sm"
            />
          </div>

          {/* Script (synced to script.md in project folder) */}
          <div className="glass glass-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] text-white/30 uppercase tracking-wider font-medium">Script</label>
              <span className="text-[10px] text-white/15 font-mono">script.md</span>
            </div>
            <textarea
              value={script}
              onChange={e => setScript(e.target.value)}
              onBlur={saveScript}
              placeholder="# Hook&#10;&#10;# Script&#10;&#10;# CTA"
              rows={16}
              className="w-full bg-transparent text-white/80 outline-none text-sm resize-y font-mono leading-relaxed min-h-[300px]"
            />
          </div>

          {/* CTA */}
          <div className="glass glass-border rounded-xl p-4">
            <label className="text-[11px] text-white/30 uppercase tracking-wider font-medium block mb-2">CTA</label>
            <input
              value={video.cta}
              onChange={e => setVideo({ ...video, cta: e.target.value })}
              onBlur={() => save({ cta: video.cta })}
              placeholder="Call to action..."
              className="w-full bg-transparent text-white/90 outline-none text-sm"
            />
          </div>

          {/* Source Clips */}
          <div className="glass glass-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-[11px] text-white/30 uppercase tracking-wider font-medium">Source Clips</label>
              <div className="flex gap-2">
                <button onClick={() => sourceUploadRef.current?.click()} className="text-[11px] text-white/40 hover:text-white/70 font-medium transition-colors">
                  {uploading ? 'Uploading...' : '+ Upload clips'}
                </button>
                <button onClick={loadBrowseSources} className="text-[11px] text-white/40 hover:text-white/70 font-medium transition-colors">+ From library</button>
              </div>
            </div>
            <input ref={sourceUploadRef} type="file" multiple accept="video/*,image/*" className="hidden" onChange={e => { if (e.target.files?.length) uploadSources(e.target.files) }} />
            {project?.sources.length === 0 && !showBrowser && (
              <p className="text-sm text-white/15">No source clips yet. Upload or pick from your library.</p>
            )}
            {project?.sources.map(f => (
              <div key={f.path} className="flex items-center gap-2 py-1.5">
                <span className="text-white/15">🎬</span>
                <span className="text-sm text-white/60 flex-1 truncate">{f.filename}</span>
                <span className="text-[10px] text-white/20">{formatSize(f.size)}</span>
              </div>
            ))}

            {/* Source browser */}
            {showBrowser && (
              <div className="mt-3 border-t border-white/5 pt-3 space-y-2">
                <div className="text-[11px] text-white/30 font-medium mb-2">Select from uploads</div>
                {Object.entries(browseSources).length === 0 && (
                  <p className="text-sm text-white/15">No uploads found. Upload raw footage first.</p>
                )}
                {Object.entries(browseSources).map(([key, files]) => (
                  <div key={key}>
                    <div className="text-[10px] text-white/20 font-mono mb-1">{key}</div>
                    {files.map(f => (
                      <button
                        key={f.path}
                        onClick={() => addSources([{ path: f.path, filename: f.filename }])}
                        className="flex items-center gap-2 w-full text-left rounded-lg px-2 py-1.5 hover:bg-white/[0.03] transition-colors"
                      >
                        <span className="text-white/15">+</span>
                        <span className="text-xs text-white/50 flex-1 truncate">{f.filename}</span>
                        <span className="text-[10px] text-white/15">{formatSize(f.size)}</span>
                      </button>
                    ))}
                  </div>
                ))}
                <button onClick={() => setShowBrowser(false)} className="text-[11px] text-white/30 hover:text-white/50">Close</button>
              </div>
            )}
          </div>

          {/* Export Versions */}
          <div className="glass glass-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-[11px] text-white/30 uppercase tracking-wider font-medium">Exports</label>
              <button onClick={() => exportRef.current?.click()} className="text-[11px] text-white/40 hover:text-white/70 font-medium transition-colors">+ Upload version</button>
            </div>
            <input ref={exportRef} type="file" accept="video/*" className="hidden" onChange={e => { if (e.target.files?.length) uploadExport(e.target.files) }} />
            {project?.exports.length === 0 && (
              <p className="text-sm text-white/15">No exports yet. Upload your first version.</p>
            )}
            {project?.exports.map((f, i) => (
              <div key={f.path} className="flex items-center gap-3 py-2 border-b border-white/[0.03] last:border-0">
                <span className="text-xs font-mono font-bold text-white/50 w-6">v{i + 1}</span>
                <span className="text-sm text-white/60 flex-1 truncate">{f.filename}</span>
                <span className="text-[10px] text-white/20">{formatSize(f.size)}</span>
              </div>
            ))}
          </div>

          {/* Notes */}
          <div className="glass glass-border rounded-xl p-4">
            <label className="text-[11px] text-white/30 uppercase tracking-wider font-medium block mb-2">Notes</label>
            <textarea
              value={video.notes}
              onChange={e => setVideo({ ...video, notes: e.target.value })}
              onBlur={() => save({ notes: video.notes })}
              placeholder="Additional notes..."
              rows={3}
              className="w-full bg-transparent text-white/70 outline-none text-sm resize-y"
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Project folder */}
          {project?.folderPath && (
            <div className="glass glass-border rounded-xl p-4">
              <label className="text-[11px] text-white/30 uppercase tracking-wider font-medium block mb-2">Project Folder</label>
              <button
                onClick={() => { navigator.clipboard.writeText(project.folderPath) }}
                className="text-[11px] text-white/40 hover:text-white/60 font-mono break-all text-left transition-colors"
                title="Click to copy path"
              >
                {project.folderPath}
              </button>
              <div className="text-[9px] text-white/15 mt-1">Click to copy — open in Finder/Premiere</div>
            </div>
          )}

          {/* Status */}
          <div className="glass glass-border rounded-xl p-4">
            <label className="text-[11px] text-white/30 uppercase tracking-wider font-medium block mb-2">Status</label>
            <div className="space-y-0.5">
              {STATUS_ORDER.map(s => (
                <button
                  key={s}
                  onClick={() => changeStatus(s)}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-all ${
                    video.status === s ? 'text-white font-medium' : 'text-white/25 hover:text-white/50 hover:bg-white/[0.03]'
                  }`}
                  style={video.status === s ? { backgroundColor: STATUS_COLORS[s] + '20', color: STATUS_COLORS[s] } : undefined}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Category */}
          <div className="glass glass-border rounded-xl p-4">
            <label className="text-[11px] text-white/30 uppercase tracking-wider font-medium block mb-2">Category</label>
            <div className="space-y-0.5">
              {(['building', 'studying', 'workout'] as Category[]).map(cat => (
                <button
                  key={cat}
                  onClick={() => { setVideo({ ...video, category: cat }); save({ category: cat }) }}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-sm capitalize transition-all ${
                    video.category === cat ? 'font-medium' : 'text-white/25 hover:text-white/50 hover:bg-white/[0.03]'
                  }`}
                  style={video.category === cat ? { backgroundColor: CATEGORY_COLORS[cat] + '15', color: CATEGORY_COLORS[cat] } : undefined}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="glass glass-border rounded-xl p-4">
            <label className="text-[11px] text-white/30 uppercase tracking-wider font-medium block mb-2">Tags</label>
            <div className="flex flex-wrap gap-1 mb-2">
              {video.tags.map((tag, i) => (
                <span key={i} className="text-[11px] bg-white/[0.05] rounded-md px-2 py-0.5 text-white/50 flex items-center gap-1">
                  {tag}
                  <button onClick={() => { const tags = video.tags.filter((_, j) => j !== i); setVideo({ ...video, tags }); save({ tags }) }} className="text-white/20 hover:text-red-400">×</button>
                </span>
              ))}
            </div>
            <input
              placeholder="Add tag..."
              className="w-full bg-white/[0.03] rounded-lg px-2.5 py-1.5 text-[11px] outline-none text-white/50 focus:text-white/70 border border-white/[0.04] focus:border-white/10 transition-colors"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const val = (e.target as HTMLInputElement).value.trim()
                  if (val && !video.tags.includes(val)) {
                    const tags = [...video.tags, val]; setVideo({ ...video, tags }); save({ tags });
                    (e.target as HTMLInputElement).value = ''
                  }
                }
              }}
            />
          </div>

          {/* Meta */}
          <div className="text-[11px] text-white/15 space-y-1 px-1">
            <div>Created {new Date(video.createdAt).toLocaleDateString()}</div>
            <div>Updated {new Date(video.updatedAt).toLocaleDateString()}</div>
            <div className="font-mono text-[10px] text-white/10">{video.id}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr)
  const day = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() - ((day + 6) % 7))
  const jan1 = new Date(monday.getFullYear(), 0, 1)
  const weekNum = Math.ceil(((monday.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
  return `${monday.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 50)
}
