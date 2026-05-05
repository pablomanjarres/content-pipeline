import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createVideo,
  deleteVideo,
  getVideo,
  getVideos,
  getWeekly,
  updateVideo,
  updateWeekly,
  uploadShortVideoClip,
  type WeeklyData,
} from '../lib/api'
import type { Video } from '../lib/types'
import { STATUS_COLORS, STATUS_LABELS, VIDEO_PLATFORM_LABELS, VIDEO_PLATFORMS } from '../lib/types'
import {
  DAILY_VIDEO_TASK_KEY,
  buildDailyVideoNotes,
  dateKeyFromDate,
  dayDisplayLabel,
  defaultDailyVideoTitle,
  getDailyVideoMeta,
  getDailyVideoProductionPlan,
  getWeekDays,
  hasDailyVideoProductionPlan,
  weekKeyForDate,
} from '../lib/dailyVideo'

interface Props {
  onOpenVideo: (id: string) => void
}

function weekKeyForOffset(offset: number): string {
  const date = new Date()
  date.setDate(date.getDate() + offset * 7)
  return weekKeyForDate(date)
}

function weekLabel(offset: number): string {
  if (offset === 0) return 'This Week'
  if (offset === 1) return 'Next Week'
  if (offset === -1) return 'Last Week'
  return offset > 0 ? `${offset} Weeks Ahead` : `${Math.abs(offset)} Weeks Back`
}

function upsertVideo(list: Video[], video: Video): Video[] {
  return [video, ...list.filter((v) => v.id !== video.id)]
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export function Shorts({ onOpenVideo }: Props) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [weekly, setWeekly] = useState<WeeklyData>({})
  const [videos, setVideos] = useState<Video[]>([])
  const [busyDay, setBusyDay] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const weekKey = weekKeyForOffset(weekOffset)
  const days = useMemo(() => getWeekDays(weekKey), [weekKey])
  const videoById = useMemo(() => new Map(videos.map((v) => [v.id, v])), [videos])

  async function load() {
    const [weekData, allVideos] = await Promise.all([getWeekly(weekKey), getVideos()])
    setWeekly(weekData)
    setVideos(allVideos)
  }

  useEffect(() => {
    load().catch((e) => setError((e as Error).message))
    const id = setInterval(() => load().catch(() => {}), 5000)
    return () => clearInterval(id)
  }, [weekKey])

  async function linkVideo(dateKey: string, videoId: string) {
    const next = {
      ...weekly,
      [dateKey]: {
        ...(weekly[dateKey] || {}),
        [DAILY_VIDEO_TASK_KEY]: videoId,
      },
    }
    await updateWeekly(weekKey, next)
    setWeekly(next)
  }

  async function ensureVideo(dateKey: string): Promise<Video> {
    const existingId = weekly[dateKey]?.[DAILY_VIDEO_TASK_KEY]
    if (existingId && typeof existingId === 'string') {
      const cached = videoById.get(existingId)
      if (cached) return cached
      const fetched = await getVideo(existingId)
      setVideos((prev) => upsertVideo(prev, fetched))
      return fetched
    }

    const meta = getDailyVideoMeta(null, dateKey)
    const title = defaultDailyVideoTitle(dateKey)
    const video = await createVideo({
      title,
      category: meta.category,
      status: 'idea',
      tags: ['daily-video', `type:${slug(meta.contentType)}`, `role:${slug(meta.dayRole)}`],
      notes: buildDailyVideoNotes(dateKey, {
        contentType: meta.contentType,
        dayRole: meta.dayRole,
        topic: title,
        brief: meta.brief,
      }),
    })
    await linkVideo(dateKey, video.id)
    setVideos((prev) => upsertVideo(prev, video))
    return video
  }

  async function uploadFinishedEdit(dateKey: string, file: File) {
    if (!file.type.startsWith('video/')) {
      setError('Only video files are supported')
      return
    }
    setError(null)
    setBusyDay(dateKey)
    try {
      const video = await ensureVideo(dateKey)
      const uploaded = await uploadShortVideoClip(video.id, file)
      const updated = await updateVideo(video.id, { clipPaths: uploaded.clipPaths, status: 'ready' })
      setVideos((prev) => upsertVideo(prev, updated))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusyDay(null)
    }
  }

  async function removeFinishedEdit(video: Video) {
    setBusyDay(video.id)
    try {
      const updated = await updateVideo(video.id, { clipPaths: [], status: video.hook || video.script ? 'scripted' : 'idea' })
      setVideos((prev) => upsertVideo(prev, updated))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusyDay(null)
    }
  }

  async function clearSlot(dateKey: string) {
    const id = weekly[dateKey]?.[DAILY_VIDEO_TASK_KEY]
    if (!id || typeof id !== 'string') return
    if (!confirm('Clear this short video slot?\n\nThe video record stays in Videos (delete it there if you also want it gone).')) return
    setBusyDay(dateKey)
    try {
      const dayData = { ...(weekly[dateKey] || {}) }
      delete dayData[DAILY_VIDEO_TASK_KEY]
      const next = { ...weekly }
      if (Object.keys(dayData).length === 0) delete next[dateKey]
      else next[dateKey] = dayData
      await updateWeekly(weekKey, next)
      setWeekly(next)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusyDay(null)
    }
  }

  async function deleteShortVideo(dateKey: string, video: Video) {
    if (!confirm(`Delete short video "${video.title || 'Untitled'}"?\n\nThis removes the video record and unlinks it from ${dateKey}. Media files stay on disk.`)) return
    setError(null)
    setBusyDay(video.id)
    try {
      const next: WeeklyData = {}
      let shouldUnlink = false
      for (const [day, dayData] of Object.entries(weekly)) {
        const filtered = Object.fromEntries(
          Object.entries(dayData).filter(([, value]) => {
            const keep = value !== video.id
            if (!keep) shouldUnlink = true
            return keep
          })
        ) as Record<string, string | boolean>
        if (Object.keys(filtered).length > 0) next[day] = filtered
      }

      await deleteVideo(video.id)
      if (shouldUnlink) await updateWeekly(weekKey, next)
      setVideos((prev) => prev.filter((v) => v.id !== video.id))
      if (shouldUnlink) setWeekly(next)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusyDay(null)
    }
  }

  const range = days.length
    ? `${days[0].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${days[6].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : ''

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Daily <span className="font-serif italic font-normal text-white/70">Shorts</span></h1>
          <div className="text-sm text-white/30 mt-1">{weekLabel(weekOffset)} · {range}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setWeekOffset((o) => o - 1)}
            className="h-8 px-3 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[12px] text-white/50 hover:text-white/75 hover:bg-white/[0.07] transition-colors"
          >
            Prev
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            disabled={weekOffset === 0}
            className="h-8 px-3 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[12px] text-white/50 hover:text-white/75 hover:bg-white/[0.07] disabled:opacity-35 disabled:hover:text-white/50 disabled:hover:bg-white/[0.04] transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => setWeekOffset((o) => o + 1)}
            className="h-8 px-3 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[12px] text-white/50 hover:text-white/75 hover:bg-white/[0.07] transition-colors"
          >
            Next
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {days.map((day) => {
          const id = weekly[day.dateKey]?.[DAILY_VIDEO_TASK_KEY]
          const video = typeof id === 'string' ? videoById.get(id) ?? null : null
          return (
            <ShortDayCard
              key={day.dateKey}
              dateKey={day.dateKey}
              dayName={day.dayName}
              video={video}
              busy={busyDay === day.dateKey || busyDay === video?.id}
              onUpload={(file) => uploadFinishedEdit(day.dateKey, file)}
              onOpen={video ? () => onOpenVideo(video.id) : undefined}
              onRemove={video ? () => removeFinishedEdit(video) : undefined}
              onClearSlot={video ? () => clearSlot(day.dateKey) : undefined}
              onDelete={video ? () => deleteShortVideo(day.dateKey, video) : undefined}
            />
          )
        })}
      </div>
    </div>
  )
}

function ShortDayCard({
  dateKey,
  dayName,
  video,
  busy,
  onUpload,
  onOpen,
  onRemove,
  onClearSlot,
  onDelete,
}: {
  dateKey: string
  dayName: string
  video: Video | null
  busy: boolean
  onUpload: (file: File) => void
  onOpen?: () => void
  onRemove?: () => void
  onClearSlot?: () => void
  onDelete?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const meta = getDailyVideoMeta(video, dateKey)
  const plan = getDailyVideoProductionPlan(video, dateKey)
  const clipPath = video?.clipPaths?.[0] ?? null
  const clipUrl = clipPath ? `/api/media/serve?path=${encodeURIComponent(clipPath)}` : null
  const status = video?.status || 'idea'

  function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (file) onUpload(file)
  }

  return (
    <div className={`glass glass-border rounded-xl p-4 border ${dateKey === dateKeyFromDate(new Date()) ? 'border-cyan-400/35' : 'border-white/[0.08]'}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-white/80">{dayName}</span>
            <span className="text-[11px] text-white/25">{dayDisplayLabel(dateKey)}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-cyan-200/90">{meta.contentType}</span>
            <span className="rounded-md bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/45">{meta.dayRole}</span>
            {video && (
              <span className="rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider" style={{ backgroundColor: STATUS_COLORS[status] + '18', color: STATUS_COLORS[status] }}>
                {STATUS_LABELS[status]}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {onOpen && (
            <button onClick={onOpen} className="px-2.5 py-1 rounded-lg text-[11px] text-white/45 hover:text-white/80 bg-white/[0.04] transition-colors">
              Open
            </button>
          )}
          {onClearSlot && (
            <button
              onClick={onClearSlot}
              disabled={busy}
              title="Clear this slot — unlinks the video from this day. The video record stays in Videos."
              className="px-2.5 py-1 rounded-lg text-[11px] text-red-300/70 hover:text-red-200 bg-white/[0.04] hover:bg-red-500/[0.12] disabled:opacity-40 transition-colors"
            >
              Clear
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              disabled={busy}
              title="Delete this short-video record. Media files stay on disk."
              className="px-2.5 py-1 rounded-lg text-[11px] text-red-200/85 hover:text-red-100 bg-red-500/[0.1] hover:bg-red-500/[0.18] disabled:opacity-40 transition-colors"
            >
              Delete
            </button>
          )}
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white text-black hover:bg-zinc-200 disabled:opacity-40 transition-colors"
          >
            {clipPath ? 'Replace' : 'Upload'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[96px_1fr] gap-3">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
          className={`relative aspect-[9/16] rounded-2xl overflow-hidden bg-black border ${dragOver ? 'border-cyan-300/70 ring-2 ring-cyan-300/20' : 'border-white/[0.08]'} transition-colors`}
        >
          {clipUrl ? (
            <video src={clipUrl} controls className="h-full w-full object-cover" preload="metadata" />
          ) : (
            <button
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-3 text-center text-[11px] text-white/40 hover:text-white/80 disabled:opacity-40 transition-colors"
            >
              <span className="text-2xl leading-none">+</span>
              <span>{busy ? 'Uploading...' : 'Finished edit'}</span>
            </button>
          )}
          {busy && clipUrl && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-[12px] text-white/80">Uploading...</div>
          )}
        </div>

        <div className="min-w-0 space-y-2">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-white/25">Topic</div>
            <div className="mt-0.5 text-[13px] font-medium text-white/85 line-clamp-2">{meta.topic}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-white/25">Day guideline</div>
            <div className="mt-0.5 text-[12px] text-white/45 line-clamp-2">{meta.brief}</div>
          </div>
          <RecordingPacket plan={plan} />
          <div className="flex flex-wrap gap-1 pt-1">
            {VIDEO_PLATFORMS.map((platform) => (
              <span key={platform} className="rounded-md bg-white/[0.035] border border-white/[0.05] px-1.5 py-0.5 text-[9px] text-white/30">
                {VIDEO_PLATFORM_LABELS[platform]}
              </span>
            ))}
          </div>
          {clipPath && (
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => navigator.clipboard.writeText(clipPath)}
                className="text-[10px] text-white/35 hover:text-white/75 transition-colors"
              >
                Copy path
              </button>
              {onRemove && (
                <button onClick={onRemove} className="text-[10px] text-red-300/65 hover:text-red-200 transition-colors">
                  Remove
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  )
}

function RecordingPacket({ plan }: { plan: ReturnType<typeof getDailyVideoProductionPlan> }) {
  if (!hasDailyVideoProductionPlan(plan)) {
    return (
      <div className="rounded-lg border border-amber-400/15 bg-amber-400/[0.06] px-2.5 py-2 text-[11px] text-amber-100/55">
        Missing recording packet: add script, b-roll, edit ideas, and cover idea before filming.
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border border-white/[0.06] bg-black/15 p-2.5">
      <div className="text-[9px] uppercase tracking-wider text-white/25">Recording packet</div>
      <PacketField label="Hook" value={plan.hook} lines={2} />
      <PacketField label="Script" value={plan.script} lines={4} />
      <PacketField label="B-roll / shots" value={plan.bRoll} lines={3} />
      <PacketField label="Edit ideas" value={plan.editIdeas} lines={3} />
      <PacketField label="Cover / image" value={plan.imageIdea} lines={2} />
      <PacketField label="CTA" value={plan.cta} lines={2} />
    </div>
  )
}

function PacketField({ label, value, lines }: { label: string; value: string; lines: number }) {
  if (!value) return null
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-white/25">{label}</div>
      <div
        className="mt-0.5 overflow-hidden whitespace-pre-wrap text-[11px] leading-snug text-white/62"
        style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lines }}
      >
        {value}
      </div>
    </div>
  )
}
