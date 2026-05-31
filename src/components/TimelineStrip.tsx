import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getTimelineRange,
  updateTimelineEntry,
  uploadTimelineAttachment,
  deleteTimelineAttachment,
  getPosts,
} from '../lib/api'
import {
  TIMELINE_STATUS_ORDER,
  TIMELINE_STATUS_LABELS,
  TIMELINE_STATUS_COLORS,
  type TimelineEntry,
  type TimelineAttachment,
  type Post,
} from '../lib/types'

// Timeline day-prior rule:
//   Pablo plans + ships work on day D.
//   The post about that work runs on day D + 1 (the morning after).
// So for the day-D card's "See post" button, we look up posts created on
// (D + 1) tagged `series/day-1-to-yc`. If found, button is enabled and links
// to that post (LinkedIn version preferred). If not, button is disabled.
function nextDayKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(y, (m || 1) - 1, (d || 1) + 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

// ─── Date helpers ───────────────────────────────────────────────────────────
// Match the WeeklyTracker getWeekInfo() pattern: ISO week starts on Monday.
// All comparisons are by local date (YYYY-MM-DD), never timestamps, so the
// "today" highlight stays correct across DST boundaries.

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface DayInfo {
  date: string
  num: number
  dayName: string
  month: string
  isToday: boolean
  isPast: boolean
}

interface WeekInfo {
  monday: Date
  days: DayInfo[]
  rangeLabel: string
  startKey: string
  endKey: string
}

function getWeekInfo(weekOffset = 0): WeekInfo {
  const now = new Date()
  const base = new Date(now)
  base.setDate(now.getDate() + weekOffset * 7)
  const day = base.getDay()
  const monday = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  monday.setDate(base.getDate() - ((day + 6) % 7))

  const todayStr = toDateKey(now)
  const days: DayInfo[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const dateStr = toDateKey(d)
    return {
      date: dateStr,
      num: d.getDate(),
      dayName: DAY_NAMES[i],
      month: MONTH_NAMES[d.getMonth()],
      isToday: dateStr === todayStr,
      isPast: dateStr < todayStr,
    }
  })

  const rangeLabel = `${days[0].month} ${days[0].num} – ${days[6].month} ${days[6].num}`
  return { monday, days, rangeLabel, startKey: days[0].date, endKey: days[6].date }
}

// Empty default entry — used when the server hasn't materialized one yet.
function emptyEntry(date: string): TimelineEntry {
  return {
    date,
    plannedTitle: '',
    plannedDescription: '',
    actualShipped: '',
    status: 'planned',
    attachments: [],
    createdAt: '',
    updatedAt: '',
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

interface TimelineStripProps {
  onOpenPost: (id: string) => void
}

export function TimelineStrip({ onOpenPost }: TimelineStripProps) {
  const [weekOffset, setWeekOffset] = useState(0)
  const week = useMemo(() => getWeekInfo(weekOffset), [weekOffset])

  // entries keyed by date; missing dates render as empty defaults
  const [entries, setEntries] = useState<Record<string, TimelineEntry>>({})
  const [loading, setLoading] = useState(true)

  // Posts in CP (filtered to the YC series). Re-fetched whenever the week
  // changes so the "See post" buttons stay accurate as runs land.
  const [posts, setPosts] = useState<Post[]>([])

  const loadPosts = useCallback(async () => {
    try {
      const list = await getPosts()
      setPosts(list.filter((p) => (p.tags || []).includes('series/day-1-to-yc')))
    } catch {
      setPosts([])
    }
  }, [])

  useEffect(() => { loadPosts() }, [loadPosts])

  // Per-day map: date → post (LinkedIn preferred). null when no post yet.
  // Match priority: scheduledAt > createdAt. Mirrors LatestPostGroupCard's grouping
  // logic (which uses run.scheduledFor || run.createdAt). When Pablo pre-drafts a
  // week of posts on a single day, every post lands with the same createdAt but
  // a scheduledAt per post-day — so scheduledAt is the correct bucketing field.
  const postForDay = useMemo(() => {
    const map: Record<string, Post | null> = {}
    for (const d of week.days) {
      const targetKey = nextDayKey(d.date)
      const candidates = posts.filter((p) => {
        const effective = (p.scheduledAt || p.createdAt || '').slice(0, 10)
        return effective === targetKey
      })
      if (candidates.length === 0) { map[d.date] = null; continue }
      const li = candidates.find((p) => p.platform === 'linkedin')
      map[d.date] = li ?? candidates[0]
    }
    return map
  }, [week.days, posts])

  const weekLabel = weekOffset === 0
    ? 'This Week'
    : weekOffset === 1
    ? 'Next Week'
    : weekOffset === -1
    ? 'Last Week'
    : weekOffset > 0
    ? `${weekOffset} Weeks Ahead`
    : `${Math.abs(weekOffset)} Weeks Back`

  const load = useCallback(async () => {
    try {
      const list = await getTimelineRange(week.startKey, week.endKey)
      const map: Record<string, TimelineEntry> = {}
      for (const e of list) map[e.date] = e
      setEntries(map)
    } catch {
      setEntries({})
    }
  }, [week.startKey, week.endKey])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  // Apply a partial mutation locally + persist. Server is source of truth on
  // refresh, but optimistic state keeps typing snappy.
  const persist = useCallback(async (date: string, patch: Partial<TimelineEntry>) => {
    setEntries((prev) => {
      const current = prev[date] ?? emptyEntry(date)
      return { ...prev, [date]: { ...current, ...patch } }
    })
    try {
      const next = await updateTimelineEntry(date, patch)
      setEntries((prev) => ({ ...prev, [date]: next }))
    } catch {
      // swallow — next refresh corrects
    }
  }, [])

  const onUpload = useCallback(async (date: string, file: File) => {
    try {
      await uploadTimelineAttachment(date, file)
      await load()
    } catch {
      // ignored — surfaced visually via the day card error state
    }
  }, [load])

  const onDeleteAttachment = useCallback(async (date: string, attachId: string) => {
    try {
      await deleteTimelineAttachment(date, attachId)
      await load()
    } catch {
      // ignored
    }
  }, [load])

  return (
    <div className="glass glass-border rounded-2xl p-5">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">Timeline</h3>
          <div className="text-[11px] text-white/30 font-medium mt-1">
            {weekLabel} · {week.rangeLabel}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekOffset((o) => o - 1)}
            className="px-2.5 py-1 rounded-md text-[11px] text-white/45 hover:text-white/85 bg-white/[0.03] transition-colors cursor-pointer"
          >
            Prev
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            disabled={weekOffset === 0}
            className="px-2.5 py-1 rounded-md text-[11px] text-white/45 hover:text-white/85 bg-white/[0.03] disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            This Week
          </button>
          <button
            onClick={() => setWeekOffset((o) => o + 1)}
            className="px-2.5 py-1 rounded-md text-[11px] text-white/45 hover:text-white/85 bg-white/[0.03] transition-colors cursor-pointer"
          >
            Next
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-[13px] text-white/25 rounded-xl bg-white/[0.02] border border-white/[0.04] p-4">
          Loading week…
        </div>
      ) : (
        // Horizontal scroll on any width. Each card holds a usable 280px min-width
        // so the inner fields breathe. Snap-x so navigation feels deliberate.
        <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory -mx-1 px-1 timeline-scroll">
          {week.days.map((day) => (
            <div key={day.date} className="w-[280px] flex-shrink-0 snap-start">
              <DayCard
                day={day}
                entry={entries[day.date] ?? emptyEntry(day.date)}
                onPersist={persist}
                onUpload={onUpload}
                onDeleteAttachment={onDeleteAttachment}
                matchedPost={postForDay[day.date] ?? null}
                onOpenPost={onOpenPost}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Day card ───────────────────────────────────────────────────────────────

interface DayCardProps {
  day: DayInfo
  entry: TimelineEntry
  onPersist: (date: string, patch: Partial<TimelineEntry>) => Promise<void>
  onUpload: (date: string, file: File) => Promise<void>
  onDeleteAttachment: (date: string, attachId: string) => Promise<void>
  matchedPost: Post | null            // post created on day+1 (day-prior rule)
  onOpenPost: (id: string) => void
}

function DayCard({ day, entry, onPersist, onUpload, onDeleteAttachment, matchedPost, onOpenPost }: DayCardProps) {
  // Local field buffers, mirrored from the server entry. dirty flags prevent
  // server refresh from clobbering an in-flight edit.
  const [title, setTitle] = useState(entry.plannedTitle)
  const [desc, setDesc] = useState(entry.plannedDescription)
  const [shipped, setShipped] = useState(entry.actualShipped)
  const dirty = useRef<Set<'plannedTitle' | 'plannedDescription' | 'actualShipped'>>(new Set())
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Sync local buffers when the server entry refreshes, but only for fields
  // the user isn't actively editing.
  useEffect(() => {
    if (!dirty.current.has('plannedTitle')) setTitle(entry.plannedTitle)
    if (!dirty.current.has('plannedDescription')) setDesc(entry.plannedDescription)
    if (!dirty.current.has('actualShipped')) setShipped(entry.actualShipped)
  }, [entry.plannedTitle, entry.plannedDescription, entry.actualShipped, entry.updatedAt])

  // Debounce per-field — 600ms after the last keystroke fires the PUT.
  useEffect(() => {
    if (!dirty.current.has('plannedTitle')) return
    if (title === entry.plannedTitle) { dirty.current.delete('plannedTitle'); return }
    const t = window.setTimeout(() => {
      onPersist(day.date, { plannedTitle: title })
      dirty.current.delete('plannedTitle')
    }, 600)
    return () => window.clearTimeout(t)
  }, [title, entry.plannedTitle, day.date, onPersist])

  useEffect(() => {
    if (!dirty.current.has('plannedDescription')) return
    if (desc === entry.plannedDescription) { dirty.current.delete('plannedDescription'); return }
    const t = window.setTimeout(() => {
      onPersist(day.date, { plannedDescription: desc })
      dirty.current.delete('plannedDescription')
    }, 600)
    return () => window.clearTimeout(t)
  }, [desc, entry.plannedDescription, day.date, onPersist])

  useEffect(() => {
    if (!dirty.current.has('actualShipped')) return
    if (shipped === entry.actualShipped) { dirty.current.delete('actualShipped'); return }
    const t = window.setTimeout(() => {
      onPersist(day.date, { actualShipped: shipped })
      dirty.current.delete('actualShipped')
    }, 600)
    return () => window.clearTimeout(t)
  }, [shipped, entry.actualShipped, day.date, onPersist])

  function cycleStatus() {
    const idx = TIMELINE_STATUS_ORDER.indexOf(entry.status)
    const next = TIMELINE_STATUS_ORDER[(idx + 1) % TIMELINE_STATUS_ORDER.length]
    onPersist(day.date, { status: next })
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      for (const f of Array.from(files)) {
        await onUpload(day.date, f)
      }
    } finally {
      setUploading(false)
    }
  }

  const showShipped = day.isPast || entry.actualShipped.trim().length > 0
  const statusColor = TIMELINE_STATUS_COLORS[entry.status]

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
      className={`rounded-xl border p-3 flex flex-col gap-2 transition-colors ${
        dragOver
          ? 'border-orange-400/70 ring-2 ring-orange-400/20 bg-white/[0.05]'
          : day.isToday
          ? 'border-white/[0.18] bg-white/[0.055]'
          : 'border-white/[0.06] bg-white/[0.025]'
      }`}
    >
      {/* Header: day name + number + status pill */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-1.5">
          <span className={`text-[10px] uppercase tracking-wider font-semibold ${day.isToday ? 'text-white/85' : day.isPast ? 'text-white/30' : 'text-white/55'}`}>
            {day.dayName}
          </span>
          <span className={`text-sm font-bold tabular-nums ${day.isToday ? 'text-white' : day.isPast ? 'text-white/35' : 'text-white/70'}`}>
            {day.num}
          </span>
          <span className="text-[10px] text-white/25">{day.month}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={cycleStatus}
            title={`Status: ${TIMELINE_STATUS_LABELS[entry.status]} (click to cycle)`}
            className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded transition-colors cursor-pointer hover:brightness-125"
            style={{ color: statusColor, backgroundColor: `${statusColor}22` }}
          >
            {TIMELINE_STATUS_LABELS[entry.status]}
          </button>
          {matchedPost ? (
            <button
              onClick={() => onOpenPost(matchedPost.id)}
              title={`See post: "${(matchedPost.title || 'Untitled').slice(0, 80)}"`}
              className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded transition-colors cursor-pointer text-white/65 hover:text-white bg-white/[0.06] hover:bg-white/[0.12]"
            >
              → post
            </button>
          ) : (
            <span
              title="No post yet for this day's work — posts get drafted the morning after"
              className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded text-white/15 bg-white/[0.02] cursor-not-allowed select-none"
            >
              → post
            </span>
          )}
        </div>
      </div>

      {/* What to build — title (single-line, grows visually but no wrap) */}
      <input
        value={title}
        onChange={(e) => {
          dirty.current.add('plannedTitle')
          setTitle(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur()
          }
        }}
        placeholder="what are you building?"
        className="w-full bg-transparent border-0 border-b border-white/[0.06] focus:border-white/25 outline-none px-0 py-1 text-[13px] font-medium text-white/90 placeholder:text-white/20"
      />

      {/* Description — autosize textarea */}
      <AutoTextarea
        value={desc}
        onChange={(next) => {
          dirty.current.add('plannedDescription')
          setDesc(next)
        }}
        placeholder="details, links, decisions..."
        minRows={2}
        className="w-full bg-transparent border border-white/[0.05] rounded-lg px-2 py-1.5 text-[12px] text-white/75 placeholder:text-white/20 outline-none focus:border-white/20 resize-none"
      />

      {/* Shipped — only past days or already-filled */}
      {showShipped && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/35 mb-1">what shipped</div>
          <AutoTextarea
            value={shipped}
            onChange={(next) => {
              dirty.current.add('actualShipped')
              setShipped(next)
            }}
            placeholder="fill in after the day"
            minRows={2}
            className="w-full bg-emerald-500/[0.04] border border-emerald-500/[0.12] rounded-lg px-2 py-1.5 text-[12px] text-white/80 placeholder:text-white/20 outline-none focus:border-emerald-500/30 resize-none"
          />
        </div>
      )}

      {/* Attachments */}
      {entry.attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {entry.attachments.map((att) => (
            <Attachment
              key={att.id}
              attachment={att}
              onDelete={() => onDeleteAttachment(day.date, att.id)}
            />
          ))}
        </div>
      )}

      {/* Add file zone */}
      <div className="flex items-center gap-2 mt-auto pt-1">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 text-[11px] text-white/45 hover:text-white/85 disabled:opacity-50 transition-colors cursor-pointer"
          title="Attach an image, video, or file"
        >
          <span className="text-base leading-none">+</span>
          <span>{uploading ? 'uploading…' : 'attach'}</span>
        </button>
        <span className="text-[10px] text-white/20">or drop a file</span>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
    </div>
  )
}

// ─── Attachment thumbnail ───────────────────────────────────────────────────

function Attachment({ attachment, onDelete }: { attachment: TimelineAttachment; onDelete: () => void }) {
  const src = `/api/media/serve?path=${encodeURIComponent(attachment.path)}`
  return (
    <div className="relative group/att rounded-lg overflow-hidden border border-white/[0.06] bg-white/[0.02]">
      {attachment.kind === 'image' ? (
        <img src={src} alt={attachment.filename} className="block w-14 h-14 object-cover" />
      ) : attachment.kind === 'video' ? (
        <div className="w-14 h-14 flex flex-col items-center justify-center text-white/45" title={attachment.filename}>
          <span className="text-xl leading-none">▶</span>
          <span className="text-[8px] mt-0.5 px-1 truncate max-w-full">{attachment.filename}</span>
        </div>
      ) : (
        <div className="w-14 h-14 flex flex-col items-center justify-center text-white/45" title={attachment.filename}>
          <span className="text-base leading-none">📎</span>
          <span className="text-[8px] mt-0.5 px-1 truncate max-w-full">{attachment.filename}</span>
        </div>
      )}
      <button
        onClick={onDelete}
        title="Remove attachment"
        className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 border border-white/15 text-white/70 hover:bg-red-500/80 hover:text-white text-[10px] leading-none flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition-opacity cursor-pointer"
      >
        ×
      </button>
    </div>
  )
}

// ─── Auto-sizing textarea ───────────────────────────────────────────────────
// Same pattern as the existing AutoTextarea elsewhere in the codebase: grow with
// content, never shrink below minRows.

function AutoTextarea({
  value,
  onChange,
  placeholder,
  className,
  minRows = 2,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  minRows?: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    />
  )
}
