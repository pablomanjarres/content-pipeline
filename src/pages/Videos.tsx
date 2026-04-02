import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getVideos } from '../lib/api'
import { STATUS_COLORS, STATUS_LABELS, CATEGORY_COLORS, type Video } from '../lib/types'

interface MediaFile {
  filename: string
  path: string
  size: number
  date: string
  weekKey: string
  modified: string
  type: 'video' | 'image' | 'file'
}

type SortBy = 'newest' | 'oldest' | 'name' | 'size'
type GroupBy = 'none' | 'date' | 'week'

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
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

function MediaCard({ file, index, selected, onToggle }: {
  file: MediaFile
  index: number
  selected: boolean
  onToggle: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const isVideo = file.type === 'video'

  const mediaUrl = `/api/media/serve?path=${encodeURIComponent(file.path)}`

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.4) }}
      className={`rounded-2xl overflow-hidden group cursor-pointer transition-all ${
        selected
          ? 'ring-2 ring-white/60 bg-white/[0.06]'
          : 'glass glass-border hover:bg-white/[0.03]'
      }`}
      onClick={onToggle}
    >
      {/* Media preview */}
      <div
        className="relative aspect-[9/16] bg-black"
        onMouseEnter={() => {
          if (isVideo && videoRef.current) {
            videoRef.current.currentTime = 0
            videoRef.current.play().catch(() => {})
            setPlaying(true)
          }
        }}
        onMouseLeave={() => {
          if (isVideo && videoRef.current) {
            videoRef.current.pause()
            videoRef.current.currentTime = 0
            setPlaying(false)
          }
        }}
      >
        {isVideo ? (
          <video
            ref={videoRef}
            src={mediaUrl}
            muted
            loop
            playsInline
            preload="metadata"
            className="w-full h-full object-cover"
          />
        ) : (
          <img
            src={mediaUrl}
            alt={file.filename}
            className="w-full h-full object-cover"
          />
        )}

        {/* Selection checkbox */}
        <div className={`absolute top-2 left-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
          selected
            ? 'bg-white border-white'
            : 'border-white/30 bg-black/30 backdrop-blur opacity-0 group-hover:opacity-100'
        }`}>
          {selected && (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6L5 9L10 3" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>

        {/* Play icon overlay — only for videos */}
        {isVideo && !playing && !selected && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/10 transition-colors">
            <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
              <svg width="14" height="16" viewBox="0 0 10 12" fill="none">
                <path d="M0 0.5L10 6L0 11.5Z" fill="white" fillOpacity=".9"/>
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* File info */}
      <div className="p-3">
        <p className="text-[13px] text-white/80 font-medium truncate" title={file.filename}>
          {file.filename}
        </p>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[11px] text-white/25">{formatDate(file.date)}</span>
          <span className="text-[11px] text-white/25">{formatSize(file.size)}</span>
        </div>
      </div>
    </motion.div>
  )
}

export function Videos() {
  const [files, setFiles] = useState<MediaFile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('newest')
  const [groupBy, setGroupBy] = useState<GroupBy>('date')

  // Selection state
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showPicker, setShowPicker] = useState(false)
  const [pipelineVideos, setPipelineVideos] = useState<Video[]>([])
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const [pickerSearch, setPickerSearch] = useState('')

  useEffect(() => {
    fetch('/api/media/all')
      .then(r => r.json())
      .then(f => { setFiles(f); setLoading(false) })
  }, [])

  const toggleSelect = (path: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const clearSelection = () => setSelected(new Set())

  const openPicker = async () => {
    const videos = await getVideos()
    setPipelineVideos(videos)
    setPickerSearch('')
    setShowPicker(true)
  }

  const sendToVideo = async (video: Video) => {
    setSending(true)
    try {
      const weekKey = getWeekKey(video.createdAt)
      const slug = slugify(video.title)

      // Ensure project folder exists
      await fetch('/api/projects/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekKey, slug, title: video.title, type: 'video' }),
      })

      // Copy selected files to project sources
      const filesToSend = files
        .filter(f => selected.has(f.path))
        .map(f => ({ path: f.path, filename: f.filename }))

      await fetch(`/api/projects/${weekKey}/${slug}/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: filesToSend }),
      })

      setSent(video.title)
      setTimeout(() => setSent(null), 3000)
      setShowPicker(false)
      clearSelection()
    } catch (err) {
      console.error('Send error:', err)
    } finally {
      setSending(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="text-white/20 text-sm font-medium">Loading...</div>
    </div>
  )

  // Filter
  let filtered = files
  if (search.trim()) {
    const q = search.toLowerCase()
    filtered = filtered.filter(f => f.filename.toLowerCase().includes(q))
  }

  // Sort
  filtered = [...filtered].sort((a, b) => {
    if (sortBy === 'newest') return b.modified.localeCompare(a.modified)
    if (sortBy === 'oldest') return a.modified.localeCompare(b.modified)
    if (sortBy === 'name') return a.filename.localeCompare(b.filename)
    if (sortBy === 'size') return b.size - a.size
    return 0
  })

  // Total size
  const totalSize = files.reduce((sum, f) => sum + f.size, 0)

  // Group
  function getGroups(): { label: string; files: MediaFile[] }[] {
    if (groupBy === 'none') return [{ label: '', files: filtered }]

    const map = new Map<string, MediaFile[]>()
    for (const f of filtered) {
      const key = groupBy === 'date' ? f.date : f.weekKey
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(f)
    }

    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, files]) => ({
        label: groupBy === 'date' ? formatDate(key) : key,
        files,
      }))
  }

  const groups = getGroups()

  const filteredPipelineVideos = pipelineVideos.filter(v =>
    !pickerSearch.trim() || v.title.toLowerCase().includes(pickerSearch.toLowerCase())
  )

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Videos</h1>
        <p className="text-sm text-white/30 mt-1">
          {files.length} clips &middot; {formatSize(totalSize)}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search files..."
          className="flex-1 min-w-[200px] bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-sm outline-none focus:border-white/15 placeholder:text-white/20"
        />
        <select
          value={groupBy}
          onChange={e => setGroupBy(e.target.value as GroupBy)}
          className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-sm outline-none text-white/60"
        >
          <option value="date">Group by day</option>
          <option value="week">Group by week</option>
          <option value="none">No grouping</option>
        </select>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as SortBy)}
          className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-sm outline-none text-white/60"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">By name</option>
          <option value="size">By size</option>
        </select>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-white/20 text-sm">
          {files.length === 0 ? 'No video clips uploaded yet' : 'No clips match your search'}
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(group => (
            <div key={group.label || '_all'}>
              {group.label && (
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-sm font-semibold text-white/50">{group.label}</h2>
                  <div className="flex-1 h-px bg-white/[0.06]" />
                  <span className="text-[11px] text-white/20">{group.files.length} clips</span>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {group.files.map((file, i) => (
                  <MediaCard
                    key={file.path}
                    file={file}
                    index={i}
                    selected={selected.has(file.path)}
                    onToggle={() => toggleSelect(file.path)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Selection bottom bar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-zinc-900 border border-white/10 rounded-2xl px-5 py-3 shadow-2xl shadow-black/50"
          >
            <span className="text-sm text-white/70 font-medium">
              {selected.size} clip{selected.size > 1 ? 's' : ''} selected
            </span>
            <button
              onClick={openPicker}
              className="bg-white text-black px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-zinc-200 transition-colors"
            >
              Send to video
            </button>
            <button
              onClick={clearSelection}
              className="text-white/30 hover:text-white/60 transition-colors text-sm"
            >
              Clear
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success toast */}
      <AnimatePresence>
        {sent && (
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-lg"
          >
            Sent to {sent}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Video picker modal */}
      <AnimatePresence>
        {showPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setShowPicker(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={e => e.stopPropagation()}
              className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md max-h-[70vh] flex flex-col shadow-2xl"
            >
              {/* Modal header */}
              <div className="p-5 border-b border-white/[0.06]">
                <h2 className="text-lg font-bold">Send to video</h2>
                <p className="text-[13px] text-white/30 mt-1">
                  {selected.size} clip{selected.size > 1 ? 's' : ''} will be copied to the video's sources folder
                </p>
                <input
                  value={pickerSearch}
                  onChange={e => setPickerSearch(e.target.value)}
                  placeholder="Search videos..."
                  autoFocus
                  className="w-full mt-3 bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-sm outline-none focus:border-white/15 placeholder:text-white/20"
                />
              </div>

              {/* Video list */}
              <div className="flex-1 overflow-y-auto p-2">
                {filteredPipelineVideos.length === 0 ? (
                  <div className="text-center py-8 text-white/20 text-sm">No videos found</div>
                ) : (
                  filteredPipelineVideos.map(video => (
                    <button
                      key={video.id}
                      onClick={() => sendToVideo(video)}
                      disabled={sending}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left hover:bg-white/[0.04] transition-colors disabled:opacity-50"
                    >
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: STATUS_COLORS[video.status] }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-white/80 truncate">{video.title}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: STATUS_COLORS[video.status] + '18', color: STATUS_COLORS[video.status] }}
                          >
                            {STATUS_LABELS[video.status]}
                          </span>
                          <span
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded capitalize"
                            style={{ backgroundColor: CATEGORY_COLORS[video.category] + '18', color: CATEGORY_COLORS[video.category] }}
                          >
                            {video.category}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* Modal footer */}
              <div className="p-3 border-t border-white/[0.06]">
                <button
                  onClick={() => setShowPicker(false)}
                  className="w-full text-sm text-white/30 hover:text-white/60 py-2 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
