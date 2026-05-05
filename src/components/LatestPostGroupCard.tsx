import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getGeneratorRuns,
  getPosts,
  getVideo,
  createGeneratorRun,
  createPost,
  deleteVideo,
  updatePost,
  updateVideo,
  createVideo,
  updateGeneratorRun,
  deleteGeneratorRun,
  updatePostStatus,
  updatePostMedia,
  uploadPostMedia,
  deletePost,
  uploadShortVideoClip,
  getWeekly,
  updateWeekly,
  getMediaLibrary,
  getStorageInfo,
  getMediaVersions,
  openInPremiere,
  revealInFinder,
  type MediaItem,
  type MediaVersion,
  type StorageInfo,
} from '../lib/api'
import type { Category, GeneratorRun, Post, PostStatus, Video, MediaStatus, MediaKind } from '../lib/types'
import { POST_STATUS_ORDER, POST_STATUS_LABELS, POST_STATUS_COLORS, CATEGORY_COLORS } from '../lib/types'
import {
  DAILY_VIDEO_TASK_KEY,
  buildDailyVideoNotes,
  defaultDailyVideoTitle,
  getDailyVideoMeta,
  getDailyVideoProductionPlan,
  getDayGuide,
  hasDailyVideoProductionPlan,
  dateKeyFromDate,
  weekKeyForDate,
  weekKeyForDateKey,
  type DailyVideoMeta,
} from '../lib/dailyVideo'

interface Props {
  onOpenPost: (id: string) => void
  onOpenVideo: (id: string) => void
}

const MEDIA_STATUS_UI: Record<MediaStatus, { label: string; color: string; bg: string }> = {
  none: { label: 'Missing media', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  rendering: { label: 'Rendering…', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  ready: { label: 'Ready', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  failed: { label: 'Render failed', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function countXWeighted(text: string): number {
  const urls = text.match(/https?:\/\/[^\s<>"']+/g) || []
  const withoutUrls = text.replace(/https?:\/\/[^\s<>"']+/g, '')
  let weighted = 0
  for (const ch of withoutUrls) {
    const cp = ch.codePointAt(0) ?? 0
    const doubleWidth =
      (cp >= 0x2e80 && cp <= 0x303e) ||
      (cp >= 0x3041 && cp <= 0x33ff) ||
      (cp >= 0x3400 && cp <= 0x4dbf) ||
      (cp >= 0x4e00 && cp <= 0x9fff) ||
      (cp >= 0xac00 && cp <= 0xd7a3)
    weighted += doubleWidth ? 2 : 1
  }
  weighted += urls.length * 23
  return weighted
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d)
  next.setDate(next.getDate() + days)
  return next
}

function addMonths(d: Date, months: number): Date {
  const next = new Date(d)
  next.setMonth(next.getMonth() + months)
  return next
}

type RangeMode = 'day' | 'week' | 'month' | 'all'

function getPeriod(mode: RangeMode, cursor: Date): { start: Date | null; end: Date | null; label: string; title: string } {
  const today = startOfDay(new Date())
  if (mode === 'all') return { start: null, end: null, label: 'All posts', title: 'Posts Archive' }

  if (mode === 'day') {
    const start = startOfDay(cursor)
    const end = addDays(start, 1)
    const yesterday = addDays(today, -1)
    const title = isSameDay(start, today) ? "Today's Posts" : isSameDay(start, yesterday) ? "Yesterday's Posts" : 'Daily Posts'
    return {
      start,
      end,
      title,
      label: start.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
    }
  }

  if (mode === 'week') {
    const day = cursor.getDay()
    const start = startOfDay(addDays(cursor, -((day + 6) % 7)))
    const end = addDays(start, 7)
    return {
      start,
      end,
      title: 'Weekly Posts',
      label: `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${addDays(end, -1).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    }
  }

  const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  return {
    start,
    end,
    title: 'Monthly Posts',
    label: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  }
}

function inPeriod(iso: string, period: { start: Date | null; end: Date | null }): boolean {
  if (!period.start || !period.end) return true
  const t = new Date(iso).getTime()
  return t >= period.start.getTime() && t < period.end.getTime()
}

function dateKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return startOfDay(new Date(y, m - 1, d))
}

function dayLabel(key: string): string {
  const date = dateFromKey(key)
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' })
  const dayMonth = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `${weekday} - ${dayMonth}`
}

function targetLabel(date: Date): string {
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' })
  const dayMonth = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `${weekday} - ${dayMonth}`
}

function localDateAtHour(date: Date, hour: number): string {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, 0, 0, 0).toISOString()
}

function ownedPosts(run: GeneratorRun, posts: Post[]): Post[] {
  const ids = new Set(run.postIds || [])
  return posts
    .filter((p) => p.generatorRunId === run.id || ids.has(p.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

function pickPosts(run: GeneratorRun, posts: Post[], platform: 'x' | 'linkedin'): Post[] {
  const owned = ownedPosts(run, posts)
  if (platform === 'x') return owned.filter((p) => p.platform === 'x')
  return owned.filter((p) => p.platform === 'linkedin')
}

function runHasContent(run: GeneratorRun, posts: Post[]): boolean {
  return ownedPosts(run, posts).length > 0 || !!run.videoId || !!run.mediaPath
}

type DayGroup = { key: string; label: string; runs: GeneratorRun[]; postCount: number }

function runDay(run: GeneratorRun): string {
  return run.scheduledFor || run.createdAt
}

function buildDayGroups(runs: GeneratorRun[], posts: Post[], period: { start: Date | null; end: Date | null }, mode: RangeMode): DayGroup[] {
  const map = new Map<string, GeneratorRun[]>()
  for (const run of runs) {
    const day = runDay(run)
    if (!inPeriod(day, period)) continue
    if (!runHasContent(run, posts)) continue
    const key = dateKey(day)
    map.set(key, [...(map.get(key) || []), run])
  }
  return [...map.entries()]
    .sort(([a], [b]) => mode === 'all' ? b.localeCompare(a) : a.localeCompare(b))
    .map(([key, groupRuns]) => ({
      key,
      label: dayLabel(key),
      runs: groupRuns.sort((a, b) => runDay(b).localeCompare(runDay(a))),
      postCount: groupRuns.reduce((sum, run) => sum + ownedPosts(run, posts).length, 0),
    }))
}

function deriveStatus(run: GeneratorRun): MediaStatus {
  if (run.status === 'rendering') return 'rendering'
  if (run.status === 'failed') return 'failed'
  if (run.mediaPath) return 'ready'
  return 'none'
}

function isEdited(post: Post): boolean {
  if (!post.updatedAt || !post.createdAt) return false
  return new Date(post.updatedAt).getTime() - new Date(post.createdAt).getTime() > 2000
}

export function LatestPostGroupCard({ onOpenPost, onOpenVideo }: Props) {
  const [runs, setRuns] = useState<GeneratorRun[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [video, setVideo] = useState<Video | null>(null)
  const [dailyVideo, setDailyVideo] = useState<Video | null>(null)
  const [batchShortVideo, setBatchShortVideo] = useState<Video | null>(null)
  const [dayIndex, setDayIndex] = useState(0)
  const [batchIndex, setBatchIndex] = useState(0)
  const [selectedXIndex, setSelectedXIndex] = useState(0)
  const [selectedLiIndex, setSelectedLiIndex] = useState(0)
  const [rangeMode, setRangeMode] = useState<RangeMode>('week')
  const [cursorDate, setCursorDate] = useState(() => new Date())
  const [showManualForm, setShowManualForm] = useState(false)
  const [manualTitle, setManualTitle] = useState('')
  const [manualContext, setManualContext] = useState('')
  const [creatingManual, setCreatingManual] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pickerFor, setPickerFor] = useState<{ kind: 'post'; post: Post } | { kind: 'video' } | null>(null)
  const [copyFlash, setCopyFlash] = useState<string | null>(null)

  async function refresh() {
    const [r, p] = await Promise.all([getGeneratorRuns(), getPosts()])
    setRuns(r)
    setPosts(p)
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
    const iv = setInterval(refresh, 4000)
    return () => clearInterval(iv)
  }, [])

  const period = useMemo(() => getPeriod(rangeMode, cursorDate), [rangeMode, cursorDate])
  const [slottedShortDates, setSlottedShortDates] = useState<Set<string>>(new Set())

  // Fetch weekly data for any ISO weeks the period touches, then collect the
  // dateKeys that have a daily-video slot. Used below to seed virtual day-groups
  // so a script-only short still surfaces in the day nav even before any post or
  // generator run exists for that date.
  useEffect(() => {
    if (!period.start || !period.end) { setSlottedShortDates(new Set()); return }
    let cancelled = false
    ;(async () => {
      const weekKeys = new Set<string>()
      const cursor = new Date(period.start!)
      while (cursor.getTime() <= period.end!.getTime()) {
        weekKeys.add(weekKeyForDate(new Date(cursor)))
        cursor.setDate(cursor.getDate() + 1)
      }
      const dates = new Set<string>()
      for (const wk of weekKeys) {
        try {
          const w = await getWeekly(wk)
          for (const [date, tasks] of Object.entries(w || {})) {
            const id = (tasks as Record<string, unknown> | null)?.[DAILY_VIDEO_TASK_KEY]
            if (typeof id === 'string' && id) dates.add(date)
          }
        } catch { /* skip */ }
      }
      if (!cancelled) setSlottedShortDates(dates)
    })()
    return () => { cancelled = true }
  }, [period.start?.getTime(), period.end?.getTime(), dailyVideo?.id])

  const dayGroups = useMemo(() => {
    const base = buildDayGroups(runs, posts, period, rangeMode)
    const present = new Set(base.map((g) => g.key))
    // String-compare dateKeys (local tz) instead of `inPeriod` so we don't pull in
    // the next Monday: period.end is the next Monday at LOCAL midnight, but
    // `inPeriod` parses date-only strings as UTC midnight, which sits a few hours
    // before the boundary in negative-UTC zones (e.g. Bogota -5).
    const startKey = period.start ? dateKeyFromDate(period.start) : null
    const endKey = period.end ? dateKeyFromDate(addDays(period.end, -1)) : null
    const extras: DayGroup[] = []
    for (const date of slottedShortDates) {
      if (present.has(date)) continue
      if (startKey && date < startKey) continue
      if (endKey && date > endKey) continue
      extras.push({ key: date, label: dayLabel(date), runs: [], postCount: 0 })
    }
    if (!extras.length) return base
    return [...base, ...extras].sort((a, b) =>
      rangeMode === 'all' ? b.key.localeCompare(a.key) : a.key.localeCompare(b.key),
    )
  }, [runs, posts, period, rangeMode, slottedShortDates])

  useEffect(() => {
    setDayIndex((i) => Math.min(i, Math.max(0, dayGroups.length - 1)))
  }, [dayGroups.length])

  const currentGroup = dayGroups[dayIndex] ?? null
  const groupRuns = currentGroup?.runs ?? []
  const current = groupRuns[batchIndex] ?? groupRuns[0] ?? null

  useEffect(() => {
    setBatchIndex(0)
  }, [currentGroup?.key])

  useEffect(() => {
    setBatchIndex((i) => Math.min(i, Math.max(0, groupRuns.length - 1)))
  }, [groupRuns.length])

  useEffect(() => {
    if (current?.videoId) {
      getVideo(current.videoId).then(setVideo).catch(() => setVideo(null))
    } else {
      setVideo(null)
    }
  }, [current?.videoId])

  const xPosts = useMemo(() => (current ? pickPosts(current, posts, 'x') : []), [current, posts])
  const liPosts = useMemo(() => (current ? pickPosts(current, posts, 'linkedin') : []), [current, posts])
  const selectedXPost = xPosts[selectedXIndex] ?? null
  const selectedLiPost = liPosts[selectedLiIndex] ?? null
  const liPost = liPosts[0] ?? null

  useEffect(() => {
    setSelectedXIndex(0)
    setSelectedLiIndex(0)
  }, [current?.id])

  useEffect(() => {
    setSelectedXIndex((i) => Math.min(i, Math.max(0, xPosts.length - 1)))
  }, [xPosts.length])

  useEffect(() => {
    setSelectedLiIndex((i) => Math.min(i, Math.max(0, liPosts.length - 1)))
  }, [liPosts.length])

  async function patchPost(id: string, updates: Partial<Post>) {
    await updatePost(id, updates)
    await refresh()
  }

  async function setPostStatus(id: string, s: PostStatus) {
    await updatePostStatus(id, s)
    await refresh()
  }

  async function pickMediaForPost(post: Post, item: MediaItem) {
    await updatePostMedia(post.id, { mediaPath: item.path, mediaKind: item.type === 'image' ? 'image' : 'video', mediaStatus: 'ready' })
    await refresh()
    setPickerFor(null)
  }

  async function removeMediaFromPost(post: Post) {
    await updatePostMedia(post.id, { mediaPath: null, mediaKind: null, mediaStatus: 'none' })
    await refresh()
  }

  async function uploadMediaForPost(post: Post, file: File) {
    await uploadPostMedia(post.id, file)
    await refresh()
  }

  async function deletePostFromBatch(post: Post) {
    const platform = post.platform === 'linkedin' ? 'LinkedIn' : 'X'
    const ok = window.confirm(`Delete ${platform} post "${post.title || 'Untitled'}"?`)
    if (!ok) return
    await deletePost(post.id)
    await refresh()
  }

  async function rescheduleCurrentBatch(newDay: string) {
    if (!current) return
    const existing = runDay(current)
    const time = (existing && existing.includes('T')) ? existing.slice(11) : '09:00:00.000Z'
    const iso = new Date(`${newDay}T${time}`).toISOString()
    await updateGeneratorRun(current.id, { scheduledFor: iso })
    await refresh()
  }

  async function deleteCurrentBatch() {
    if (!current) return
    const count = ownedPosts(current, posts).length
    const hasVideo = !!current.videoId
    const ok = window.confirm(
      `Delete this batch?\n\nThis removes the batch, ${count} post record${count === 1 ? '' : 's'}${hasVideo ? ', and its short-video record' : ''}. Media files on disk stay untouched.`
    )
    if (!ok) return
    await deleteGeneratorRun(current.id, { cascade: true })
    await refresh()
    setBatchIndex((i) => Math.max(0, i - 1))
  }

  async function createExtraXPost() {
    if (!current) return
    const seed = selectedXPost ?? xPosts.at(-1) ?? liPost
    const description = current.featureDescription.trim() || 'today post'
    const post = await createPost({
      title: seed?.title ? `${seed.title} v${xPosts.length + 1}` : `X - ${description.slice(0, 60)}`,
      platform: 'x',
      status: 'draft',
      category: seed?.category ?? 'building',
      content: seed?.content ?? '',
      hook: seed?.hook ?? '',
      cta: seed?.cta ?? '',
      tags: seed?.tags ?? [],
      notes: seed?.notes ?? '',
      mediaPath: seed?.mediaPath ?? current.mediaPath,
      mediaKind: seed?.mediaKind ?? current.mediaKind,
      mediaStatus: seed?.mediaStatus ?? deriveStatus(current),
      generatorRunId: current.id,
    })
    await updateGeneratorRun(current.id, {
      postIds: Array.from(new Set([...(current.postIds || []), post.id])),
    })
    setSelectedXIndex(xPosts.length)
    await refresh()
  }

  async function createLinkedInPostForCurrent() {
    if (!current) return
    const seed = selectedLiPost ?? xPosts[0]
    const description = current.featureDescription.trim() || 'manual post set'
    const post = await createPost({
      title: seed?.title ? `${seed.title} v${liPosts.length + 1}` : `LinkedIn - ${description.slice(0, 60)}`,
      platform: 'linkedin',
      status: 'draft',
      category: seed?.category ?? 'building',
      content: seed?.content ?? '',
      hook: seed?.hook ?? '',
      cta: seed?.cta ?? '',
      tags: Array.from(new Set([...(seed?.tags ?? []), 'manual/voice-help'])),
      notes: seed?.notes ?? '',
      mediaPath: seed?.mediaPath ?? current.mediaPath,
      mediaKind: seed?.mediaKind ?? current.mediaKind,
      mediaStatus: seed?.mediaStatus ?? deriveStatus(current),
      generatorRunId: current.id,
    })
    await updateGeneratorRun(current.id, {
      postIds: Array.from(new Set([...(current.postIds || []), post.id])),
    })
    setSelectedLiIndex(liPosts.length)
    await refresh()
  }

  async function createManualSet() {
    const trimmedTitle = manualTitle.trim()
    const trimmedContext = manualContext.trim()
    if (!trimmedTitle && !trimmedContext) return

    const targetDate = getNewSetTargetDate()
    setCreatingManual(true)
    try {
      const description = trimmedTitle || trimmedContext.slice(0, 80) || 'Manual post set'
      const run = await createGeneratorRun({
        featureDescription: description,
        status: 'drafting',
        scheduledFor: localDateAtHour(targetDate, 9),
        voiceAnchors: trimmedContext
          ? [{ file: 'dashboard-manual-draft', excerpt: trimmedContext, tags: ['manual', 'voice-help'] }]
          : [],
        postIds: [],
      })
      const base = {
        status: 'draft' as const,
        category: 'building' as const,
        hook: '',
        cta: '',
        linkedVideoId: null,
        url: null,
        tags: ['manual/voice-help'],
        notes: trimmedContext,
        mediaPath: null,
        mediaKind: null,
        mediaStatus: 'none' as const,
        generatorRunId: run.id,
      }
      const [x, linkedin] = await Promise.all([
        createPost({ ...base, title: `X - ${description.slice(0, 60)}`, platform: 'x', content: '' }),
        createPost({ ...base, title: `LinkedIn - ${description.slice(0, 60)}`, platform: 'linkedin', content: '' }),
      ])
      await updateGeneratorRun(run.id, { postIds: [x.id, linkedin.id] })
      setManualTitle('')
      setManualContext('')
      setShowManualForm(false)
      await refresh()
    } finally {
      setCreatingManual(false)
    }
  }

  function shiftPeriod(direction: -1 | 1) {
    if (rangeMode === 'day') setCursorDate((d) => addDays(d, direction))
    if (rangeMode === 'week') setCursorDate((d) => addDays(d, direction * 7))
    if (rangeMode === 'month') setCursorDate((d) => addMonths(d, direction))
  }

  function getNewSetTargetDate(): Date {
    if (currentGroup) return dateFromKey(currentGroup.key)
    if (period.start) return period.start
    return startOfDay(new Date())
  }

  const newSetTargetDate = getNewSetTargetDate()
  const shortVideoDateKey = currentGroup?.key ?? dateKey(newSetTargetDate.toISOString())
  const shortVideoWeekKey = weekKeyForDateKey(shortVideoDateKey)
  const shortVideoGuide = getDayGuide(shortVideoDateKey)

  useEffect(() => {
    let cancelled = false

    async function loadDailyVideo() {
      try {
        const weekly = await getWeekly(shortVideoWeekKey)
        const value = weekly[shortVideoDateKey]?.[DAILY_VIDEO_TASK_KEY]
        if (!value || typeof value !== 'string') {
          if (!cancelled) setDailyVideo(null)
          return
        }
        const v = await getVideo(value)
        if (!cancelled) setDailyVideo(v)
      } catch {
        if (!cancelled) setDailyVideo(null)
      }
    }

    loadDailyVideo()
    return () => { cancelled = true }
  }, [shortVideoDateKey, shortVideoWeekKey])

  // Per-batch short. Each generator run can carry its own shortVideoId. When the
  // currently-selected batch has one, it overrides the day-level daily-video
  // fallback. Lets a single day hold multiple shorts (one per batch) plus an
  // unaffiliated one in weekly[date].daily-video.
  useEffect(() => {
    let cancelled = false
    const currentRun = groupRuns[batchIndex] ?? null
    const sid = currentRun?.shortVideoId
    if (!sid) { setBatchShortVideo(null); return }
    ;(async () => {
      try {
        const v = await getVideo(sid)
        if (!cancelled) setBatchShortVideo(v)
      } catch {
        if (!cancelled) setBatchShortVideo(null)
      }
    })()
    return () => { cancelled = true }
  }, [groupRuns, batchIndex])

  async function attachShortToBatch() {
    const currentRun = groupRuns[batchIndex] ?? null
    if (!currentRun) return
    const target = batchShortVideo ?? dailyVideo
    if (!target) return
    const updated = await updateGeneratorRun(currentRun.id, { shortVideoId: target.id })
    setRuns((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
    setBatchShortVideo(target)
  }

  async function detachShortFromBatch() {
    const currentRun = groupRuns[batchIndex] ?? null
    if (!currentRun) return
    const updated = await updateGeneratorRun(currentRun.id, { shortVideoId: null })
    setRuns((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
    setBatchShortVideo(null)
  }

  async function linkDailyVideo(videoId: string) {
    const weekly = await getWeekly(shortVideoWeekKey)
    const updated = {
      ...weekly,
      [shortVideoDateKey]: {
        ...(weekly[shortVideoDateKey] || {}),
        [DAILY_VIDEO_TASK_KEY]: videoId,
      },
    }
    await updateWeekly(shortVideoWeekKey, updated)
  }

  async function ensureDailyVideoForDate(): Promise<Video> {
    if (dailyVideo) return dailyVideo
    const title = defaultDailyVideoTitle(shortVideoDateKey)
    const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    const v = await createVideo({
      title,
      category: shortVideoGuide.category,
      status: 'idea',
      tags: ['daily-video', `type:${slug(shortVideoGuide.contentType)}`, `role:${slug(shortVideoGuide.dayRole)}`],
      notes: buildDailyVideoNotes(shortVideoDateKey, {
        contentType: shortVideoGuide.contentType,
        dayRole: shortVideoGuide.dayRole,
        topic: title,
        brief: shortVideoGuide.brief,
      }),
    })
    await linkDailyVideo(v.id)
    setDailyVideo(v)
    return v
  }

  async function pickMediaForVideo(item: MediaItem) {
    const v = await ensureDailyVideoForDate()
    const next = [item.path, ...(v.clipPaths || []).filter((p) => p !== item.path)]
    const updated = await updateVideo(v.id, { clipPaths: next, status: 'ready' })
    setDailyVideo(updated)
    setPickerFor(null)
  }

  async function uploadClipToShortVideo(file: File): Promise<Video | null> {
    const v = await ensureDailyVideoForDate()
    if (!v) return null
    const uploaded = await uploadShortVideoClip(v.id, file)
    const updated = await updateVideo(v.id, { clipPaths: uploaded.clipPaths, status: 'ready' })
    setDailyVideo(updated)
    return updated
  }

  async function removeShortVideoMedia() {
    const target = batchShortVideo ?? dailyVideo ?? video
    if (!target) return
    const updated = await updateVideo(target.id, { clipPaths: [], status: target.hook || target.script ? 'scripted' : 'idea' })
    if (batchShortVideo?.id === target.id) setBatchShortVideo(updated)
    if (dailyVideo?.id === target.id) setDailyVideo(updated)
    if (video?.id === target.id) setVideo(updated)
    await refresh()
  }

  async function deleteShortVideo(target: Video) {
    const ok = window.confirm(
      `Delete short video "${target.title || 'Untitled'}"?\n\nThis removes the video record and unlinks it from this day or batch. Media files stay on disk.`
    )
    if (!ok) return

    const currentRun = groupRuns[batchIndex] ?? null
    const runUpdates: Partial<GeneratorRun> = {}
    if (currentRun?.videoId === target.id) runUpdates.videoId = null
    if (currentRun?.shortVideoId === target.id) runUpdates.shortVideoId = null
    if (currentRun && Object.keys(runUpdates).length > 0) {
      await updateGeneratorRun(currentRun.id, runUpdates)
    }

    const weekly = await getWeekly(shortVideoWeekKey)
    const dayData = { ...(weekly[shortVideoDateKey] || {}) }
    if (dayData[DAILY_VIDEO_TASK_KEY] === target.id) {
      delete dayData[DAILY_VIDEO_TASK_KEY]
      const updatedWeekly = { ...weekly }
      if (Object.keys(dayData).length === 0) delete updatedWeekly[shortVideoDateKey]
      else updatedWeekly[shortVideoDateKey] = dayData
      await updateWeekly(shortVideoWeekKey, updatedWeekly)
    }

    await deleteVideo(target.id)
    if (dailyVideo?.id === target.id) setDailyVideo(null)
    if (batchShortVideo?.id === target.id) setBatchShortVideo(null)
    if (video?.id === target.id) setVideo(null)
    await refresh()
  }

  async function copyPath(path: string) {
    try {
      await navigator.clipboard.writeText(path)
      setCopyFlash(path)
      setTimeout(() => setCopyFlash((v) => (v === path ? null : v)), 1500)
    } catch {}
  }

  if (loading) {
    return (
      <div className="glass glass-border rounded-2xl p-5">
        <div className="text-[13px] text-white/20">Loading today's posts…</div>
      </div>
    )
  }
  const status = current ? MEDIA_STATUS_UI[deriveStatus(current)] : MEDIA_STATUS_UI.none
  const totalGroups = dayGroups.length
  const totalPosts = currentGroup?.postCount ?? 0
  const shortVideo = batchShortVideo ?? dailyVideo ?? video
  const shortVideoMeta = getDailyVideoMeta(shortVideo, shortVideoDateKey)
  const shortIsAttachedToBatch = !!(current?.shortVideoId && shortVideo && current.shortVideoId === shortVideo.id)

  return (
    <div className="glass glass-border rounded-2xl p-5">
      <div className="flex flex-col gap-4 mb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">{period.title}</h3>
            <div className="text-[11px] text-white/30 font-medium mt-1">
              {period.label}{currentGroup ? ` · ${currentGroup.label} · ${totalPosts} post${totalPosts === 1 ? '' : 's'}` : ''}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg bg-white/[0.03] border border-white/[0.05] p-0.5">
              {(['day', 'week', 'month', 'all'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => { setRangeMode(mode); setDayIndex(0) }}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium capitalize transition-colors ${
                    rangeMode === mode ? 'bg-white/10 text-white/85' : 'text-white/35 hover:text-white/65'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
            {rangeMode !== 'all' && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => shiftPeriod(-1)}
                  className="px-2 py-1 rounded-md text-[11px] text-white/45 hover:text-white/85 bg-white/[0.03] transition-colors"
                >
                  Prev
                </button>
                <button
                  onClick={() => { setCursorDate(new Date()); setRangeMode('day'); setDayIndex(0) }}
                  className="px-2 py-1 rounded-md text-[11px] text-white/45 hover:text-white/85 bg-white/[0.03] transition-colors"
                >
                  Today
                </button>
                <button
                  onClick={() => shiftPeriod(1)}
                  className="px-2 py-1 rounded-md text-[11px] text-white/45 hover:text-white/85 bg-white/[0.03] transition-colors"
                >
                  Next
                </button>
              </div>
            )}
            </div>
          </div>

        {showManualForm && (
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 space-y-3">
            <div className="text-[11px] text-white/35">
              New set will be scheduled for <span className="text-white/70">{targetLabel(newSetTargetDate)}</span>.
            </div>
            <input
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              placeholder="Post set title or topic"
              className="w-full bg-black/25 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/85 placeholder:text-white/20 outline-none focus:border-white/25"
              autoFocus
            />
            <textarea
              value={manualContext}
              onChange={(e) => setManualContext(e.target.value)}
              placeholder="Leave context, raw thoughts, angles, links, or instructions for voice-post to use later..."
              rows={4}
              className="w-full bg-black/25 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/85 placeholder:text-white/20 outline-none focus:border-white/25 resize-y"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowManualForm(false)}
                className="px-3 py-1.5 text-[12px] text-white/40 hover:text-white/75 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createManualSet}
                disabled={creatingManual || (!manualTitle.trim() && !manualContext.trim())}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white text-black hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {creatingManual ? 'Creating...' : 'Create drafts'}
              </button>
            </div>
          </div>
        )}
      </div>

      {!current && (
        <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-4">
          <div className="text-[13px] text-white/30">
            {slottedShortDates.size > 0
              ? <>No posts in this range yet, but {slottedShortDates.size} slotted short{slottedShortDates.size === 1 ? '' : 's'} above. Create a manual set or run <code className="text-white/50">/voice-post run "&lt;feature&gt;"</code> to add written posts.</>
              : <>No posts in this range yet. Create a manual set or run <code className="text-white/50">/voice-post run "&lt;feature&gt;"</code>.</>}
          </div>
          <button
            onClick={() => setShowManualForm((v) => !v)}
            className="mt-3 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white text-black hover:bg-zinc-200 transition-colors"
          >
            + New set
          </button>
        </div>
      )}

      {totalGroups > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4">
          {dayGroups.map((group, groupIndex) => (
            <button
              key={group.key}
              onClick={() => { setDayIndex(groupIndex); setBatchIndex(0) }}
              className={`shrink-0 rounded-lg px-3 py-2 text-left transition-colors border ${
                groupIndex === dayIndex
                  ? 'bg-white/10 text-white/85 border-white/[0.12]'
                  : 'bg-white/[0.03] text-white/35 hover:text-white/65 border-white/[0.04]'
              }`}
            >
              <span className="block text-[12px] font-semibold">{group.label}</span>
              <span className="block text-[10px] text-white/30 mt-0.5">{group.postCount} post{group.postCount === 1 ? '' : 's'}</span>
            </button>
          ))}
        </div>
      )}

      {currentGroup && (
        <div className="rounded-xl bg-white/[0.045] border border-white/[0.09] p-3 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => setBatchIndex((i) => Math.max(0, i - 1))}
              disabled={batchIndex === 0}
              className="shrink-0 px-2 py-1 rounded-md text-[11px] text-white/45 hover:text-white/85 bg-white/[0.04] disabled:text-white/15 disabled:cursor-not-allowed transition-colors"
            >
              Prev
            </button>
            <div className="flex flex-1 gap-1.5 overflow-x-auto">
              {groupRuns.map((run, runIndex) => {
                const selected = runIndex === batchIndex
                const count = ownedPosts(run, posts).length
                return (
                  <button
                    key={run.id}
                    onClick={() => setBatchIndex(runIndex)}
                    className={`min-w-[92px] shrink-0 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                      selected
                        ? 'bg-white/12 text-white border-white/20'
                        : 'bg-white/[0.025] text-white/35 border-white/[0.06] hover:text-white/65 hover:bg-white/[0.05]'
                    }`}
                  >
                    <span className="block text-[11px] font-semibold">Batch {runIndex + 1}</span>
                    <span className="block text-[10px] text-white/35 mt-0.5">
                      {count} post{count === 1 ? '' : 's'}
                    </span>
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setBatchIndex((i) => Math.min(groupRuns.length - 1, i + 1))}
              disabled={batchIndex >= groupRuns.length - 1}
              className="shrink-0 px-2 py-1 rounded-md text-[11px] text-white/45 hover:text-white/85 bg-white/[0.04] disabled:text-white/15 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-white/75 uppercase tracking-wider">
                Batch of posts #{batchIndex + 1} <span className="text-white/35">of {groupRuns.length}</span>
              </div>
              {current && (
                <div className="text-[12px] text-white/50 italic mt-1 truncate">
                  "{current.featureDescription}"
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {current && (
                <label
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-white/55 bg-white/[0.04] border border-white/[0.08] hover:text-white/80 transition-colors cursor-pointer"
                  title={current.scheduledFor ? 'Scheduled date — change to move this batch to a different day' : 'No explicit schedule — falls back to createdAt'}
                >
                  <span className="text-white/35 uppercase tracking-wider text-[9px] font-semibold">
                    {current.scheduledFor ? 'Scheduled' : 'Move'}
                  </span>
                  <input
                    type="date"
                    value={dateKey(runDay(current))}
                    onChange={(e) => { if (e.target.value) rescheduleCurrentBatch(e.target.value) }}
                    className="bg-transparent text-[11px] text-white/85 outline-none border-none [color-scheme:dark]"
                  />
                </label>
              )}
              {current && (
                <button
                  onClick={deleteCurrentBatch}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-red-300 bg-red-500/10 hover:bg-red-500/18 hover:text-red-200 border border-red-500/15 transition-colors"
                  title="Delete this batch and its post/video records"
                >
                  Delete batch
                </button>
              )}
              <button
                onClick={() => setShowManualForm((v) => !v)}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white text-black hover:bg-zinc-200 transition-colors"
              >
                + New set
              </button>
            </div>
          </div>
        </div>
      )}

      {currentGroup && <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {current && <div className="lg:col-span-4 flex flex-col gap-3">
          <PostVersionBar
            name="X"
            count={xPosts.length}
            selectedIndex={selectedXIndex}
            onSelect={setSelectedXIndex}
            onPrev={() => setSelectedXIndex((i) => Math.max(0, i - 1))}
            onNext={() => setSelectedXIndex((i) => Math.min(xPosts.length - 1, i + 1))}
            onCreate={createExtraXPost}
          />
          {selectedXPost ? (
            <PlatformColumn
              key={selectedXPost.id}
              label={`X v${selectedXIndex + 1}`}
              accent="#1d9bf0"
              post={selectedXPost}
              mediaPath={selectedXPost.mediaPath}
              mediaKind={selectedXPost.mediaKind}
              status={MEDIA_STATUS_UI[selectedXPost.mediaStatus ?? 'none']}
              showCharCount
              onOpen={() => onOpenPost(selectedXPost.id)}
              onPatch={(u) => patchPost(selectedXPost.id, u)}
              onSetStatus={(s) => setPostStatus(selectedXPost.id, s)}
              onDelete={() => deletePostFromBatch(selectedXPost)}
              onPickMedia={() => setPickerFor({ kind: 'post', post: selectedXPost })}
              onRemoveMedia={() => removeMediaFromPost(selectedXPost)}
              onUploadFile={(file) => uploadMediaForPost(selectedXPost, file)}
              onCopyPath={copyPath}
              copyFlash={copyFlash}
            />
          ) : (
            <PlatformColumn
              label="X"
              accent="#1d9bf0"
              post={null}
              mediaPath={null}
              mediaKind={null}
              status={status}
              showCharCount
              onCopyPath={copyPath}
              copyFlash={copyFlash}
            />
          )}
        </div>}
        {current && <div className="lg:col-span-5 flex flex-col gap-3">
          <PostVersionBar
            name="LinkedIn"
            count={liPosts.length}
            selectedIndex={selectedLiIndex}
            onSelect={setSelectedLiIndex}
            onPrev={() => setSelectedLiIndex((i) => Math.max(0, i - 1))}
            onNext={() => setSelectedLiIndex((i) => Math.min(liPosts.length - 1, i + 1))}
            onCreate={createLinkedInPostForCurrent}
          />
          {selectedLiPost ? (
            <PlatformColumn
              key={selectedLiPost.id}
              label={`LinkedIn v${selectedLiIndex + 1}`}
              accent="#0a66c2"
              post={selectedLiPost}
              mediaPath={selectedLiPost.mediaPath}
              mediaKind={selectedLiPost.mediaKind}
              status={MEDIA_STATUS_UI[selectedLiPost.mediaStatus ?? 'none']}
              showFirstLineCount
              onOpen={() => onOpenPost(selectedLiPost.id)}
              onPatch={(u) => patchPost(selectedLiPost.id, u)}
              onSetStatus={(s) => setPostStatus(selectedLiPost.id, s)}
              onDelete={() => deletePostFromBatch(selectedLiPost)}
              onPickMedia={() => setPickerFor({ kind: 'post', post: selectedLiPost })}
              onRemoveMedia={() => removeMediaFromPost(selectedLiPost)}
              onUploadFile={(file) => uploadMediaForPost(selectedLiPost, file)}
              onCopyPath={copyPath}
              copyFlash={copyFlash}
            />
          ) : (
            <PlatformColumn
              label="LinkedIn"
              accent="#0a66c2"
              post={null}
              mediaPath={null}
              mediaKind={null}
              status={MEDIA_STATUS_UI.none}
              showFirstLineCount
            />
          )}
        </div>}
        <ShortVideoColumn
          video={shortVideo}
          meta={shortVideoMeta}
          dateKey={shortVideoDateKey}
          canAct={!!shortVideo || !!current}
          onOpen={shortVideo ? () => onOpenVideo(shortVideo.id) : undefined}
          onUploadFile={uploadClipToShortVideo}
          onPickMedia={(current || shortVideo) ? () => setPickerFor({ kind: 'video' }) : undefined}
          onRemoveMedia={removeShortVideoMedia}
          onDeleteVideo={shortVideo ? () => deleteShortVideo(shortVideo) : undefined}
          onCopyPath={copyPath}
          copyFlash={copyFlash}
          className={current ? 'lg:col-span-3' : 'lg:col-span-12'}
          onAttachToBatch={current && shortVideo && !shortIsAttachedToBatch ? attachShortToBatch : undefined}
          onDetachFromBatch={current && shortIsAttachedToBatch ? detachShortFromBatch : undefined}
        />
      </div>}

      {/* Voice anchors */}
      {current && current.voiceAnchors && current.voiceAnchors.length > 0 && (
        <details className="mt-4 text-[12px]">
          <summary className="cursor-pointer text-white/40 hover:text-white/70 select-none">
            Voice anchors ({current.voiceAnchors.length})
          </summary>
          <ul className="mt-2 space-y-1.5 pl-3">
            {current.voiceAnchors.map((a, i) => (
              <li key={i} className="text-white/60">
                <span className="text-white/30">{a.file}</span>
                <span className="ml-1 text-white/20">· {a.tags.join(', ')}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Media picker modal */}
      {pickerFor && (
        <MediaPicker
          currentPath={pickerFor.kind === 'post' ? pickerFor.post.mediaPath : (shortVideo?.clipPaths?.[0] ?? null)}
          videoOnly={pickerFor.kind === 'video'}
          onPick={(item) => pickerFor.kind === 'post' ? pickMediaForPost(pickerFor.post, item) : pickMediaForVideo(item)}
          onClose={() => setPickerFor(null)}
        />
      )}
    </div>
  )
}

const CATEGORIES: Category[] = ['building', 'studying', 'workout', 'gtm']

function PostVersionBar({
  name,
  count,
  selectedIndex,
  onSelect,
  onPrev,
  onNext,
  onCreate,
}: {
  name: string
  count: number
  selectedIndex: number
  onSelect: (index: number) => void
  onPrev: () => void
  onNext: () => void
  onCreate: () => void
}) {
  const hasVersions = count > 0
  return (
    <div className="rounded-xl bg-white/[0.055] border border-white/[0.1] px-3 py-2">
      <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2">
        <button
          onClick={onPrev}
          disabled={selectedIndex <= 0}
          className="px-2 py-1 rounded-md text-[11px] text-white/45 hover:text-white/85 bg-white/[0.04] disabled:text-white/15 disabled:cursor-not-allowed transition-colors"
          title={`Previous ${name} version`}
        >
          Prev
        </button>

        <div className="min-w-0 text-center">
          <div className="text-[12px] font-semibold text-white/80">{name}</div>
          <div className="text-[10px] text-white/35">
            {hasVersions ? `Version ${selectedIndex + 1} of ${count}` : 'No versions yet'}
          </div>
        </div>

        <button
          onClick={onNext}
          disabled={!hasVersions || selectedIndex >= count - 1}
          className="px-2 py-1 rounded-md text-[11px] text-white/45 hover:text-white/85 bg-white/[0.04] disabled:text-white/15 disabled:cursor-not-allowed transition-colors"
          title={`Next ${name} version`}
        >
          Next
        </button>

        <button
          onClick={onCreate}
          className="px-2 py-1 rounded-md text-[11px] font-medium text-black bg-white hover:bg-zinc-200 transition-colors"
        >
          + Version
        </button>
      </div>

      {count > 1 && (
        <div className="mt-2 flex justify-center gap-1 overflow-x-auto pb-0.5">
          {Array.from({ length: count }, (_, i) => (
            <button
              key={i}
              onClick={() => onSelect(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === selectedIndex ? 'w-6 bg-white/80' : 'w-1.5 bg-white/20 hover:bg-white/45'
              }`}
              title={`${name} version ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PlatformColumn({
  label,
  accent,
  post,
  mediaPath,
  mediaKind,
  status,
  showCharCount,
  showFirstLineCount,
  onOpen,
  onPatch,
  onSetStatus,
  onDelete,
  onPickMedia,
  onRemoveMedia,
  onUploadFile,
  onCopyPath,
  copyFlash,
  className,
}: {
  label: string
  accent: string
  post: Post | null
  mediaPath: string | null
  mediaKind: MediaKind | null
  status: (typeof MEDIA_STATUS_UI)[MediaStatus]
  showCharCount?: boolean
  showFirstLineCount?: boolean
  onOpen?: () => void
  onPatch?: (updates: Partial<Post>) => Promise<void>
  onSetStatus?: (s: PostStatus) => Promise<void>
  onDelete?: () => void
  onPickMedia?: () => void
  onRemoveMedia?: () => void
  onUploadFile?: (file: File) => Promise<void>
  onCopyPath?: (path: string) => void
  copyFlash?: string | null
  className?: string
}) {
  // Local field buffers — initialized from post on mount / change.
  const [title, setTitle] = useState(post?.title || '')
  const [hook, setHook] = useState(post?.hook || '')
  const [content, setContent] = useState(post?.content || '')
  const [cta, setCta] = useState(post?.cta || '')
  const [url, setUrl] = useState(post?.url || '')
  const [notes, setNotes] = useState(post?.notes || '')
  const dirtyFields = useRef<Set<keyof Post>>(new Set())
  const [dirtyVersion, setDirtyVersion] = useState(0)

  useEffect(() => {
    dirtyFields.current.clear()
    setDirtyVersion((v) => v + 1)
    setTitle(post?.title || '')
    setHook(post?.hook || '')
    setContent(post?.content || '')
    setCta(post?.cta || '')
    setUrl(post?.url || '')
    setNotes(post?.notes || '')
  }, [post?.id])

  useEffect(() => {
    if (!dirtyFields.current.has('title')) setTitle(post?.title || '')
    if (!dirtyFields.current.has('hook')) setHook(post?.hook || '')
    if (!dirtyFields.current.has('content')) setContent(post?.content || '')
    if (!dirtyFields.current.has('cta')) setCta(post?.cta || '')
    if (!dirtyFields.current.has('url')) setUrl(post?.url || '')
    if (!dirtyFields.current.has('notes')) setNotes(post?.notes || '')
  }, [post?.updatedAt])

  const charCount = showCharCount ? countXWeighted(content) : 0
  const firstLineLen = showFirstLineCount ? (content.split('\n')[0] || '').length : 0
  const posted = post?.status === 'posted'
  const edited = post ? isEdited(post) : false
  const hasDirtyFields = dirtyVersion >= 0 && dirtyFields.current.size > 0

  function markDirty(key: keyof Post) {
    if (!dirtyFields.current.has(key)) {
      dirtyFields.current.add(key)
      setDirtyVersion((v) => v + 1)
    }
  }

  function clearDirty(key: keyof Post) {
    if (dirtyFields.current.delete(key)) {
      setDirtyVersion((v) => v + 1)
    }
  }

  async function saveField<K extends keyof Post>(key: K, value: Post[K]) {
    if (!post || !onPatch) return
    if ((post as any)[key] === value) {
      clearDirty(key)
      return
    }
    try {
      await onPatch({ [key]: value } as Partial<Post>)
      clearDirty(key)
    } catch {
      markDirty(key)
    }
  }

  useEffect(() => {
    if (!post || !onPatch || !dirtyFields.current.has('content')) return
    if (content === (post.content || '')) {
      clearDirty('content')
      return
    }
    const timeout = window.setTimeout(() => {
      saveField('content', content)
    }, 900)
    return () => window.clearTimeout(timeout)
  }, [content, post?.id])

  return (
    <div className={`flex flex-col gap-3 ${className ?? ''}`}>
      <div className={`rounded-xl bg-white/[0.045] border p-4 flex-1 flex flex-col gap-3 ${posted ? 'border-emerald-500/35' : 'border-white/[0.09]'}`}>
        {/* Header row: centered label, counts, status badges, Open link */}
        <div className="relative flex min-h-6 items-center justify-center">
          <div className="flex items-center justify-center gap-2 flex-wrap text-center px-10">
            <span className="text-[12px] font-semibold" style={{ color: accent }}>{label}</span>
            {showCharCount && post && (
              <span className={`text-[10px] font-medium tabular-nums ${charCount > 280 ? 'text-red-400' : 'text-white/40'}`}>
                {charCount}/280
              </span>
            )}
            {showFirstLineCount && post && (
              <span className={`text-[10px] font-medium tabular-nums ${firstLineLen > 210 ? 'text-amber-400' : 'text-white/40'}`}>
                first line {firstLineLen}/210
              </span>
            )}
            {post && posted && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
                POSTED · {post.postedAt ? relativeTime(post.postedAt) : ''}
              </span>
            )}
            {post && !posted && edited && (
              <span className="text-[10px] font-medium text-amber-400/80">
                edited · {post.updatedAt ? relativeTime(post.updatedAt) : ''}
              </span>
            )}
            {post && hasDirtyFields && (
              <button
                onClick={() => {
                  saveField('title', title)
                  saveField('hook', hook)
                  saveField('content', content)
                  saveField('cta', cta)
                  saveField('url', url || null)
                  saveField('notes', notes)
                }}
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 transition-colors"
              >
                Save changes
              </button>
            )}
          </div>
          {onOpen && (
            <button
              onClick={onOpen}
              className="absolute right-8 text-[11px] text-white/35 hover:text-white/85 transition-colors"
            >
              Open →
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="absolute right-0 text-[11px] text-white/25 hover:text-red-300 transition-colors"
              title="Delete this post"
            >
              ×
            </button>
          )}
        </div>

        {!post ? (
          <div className="text-[13px] text-white/20 italic">— empty —</div>
        ) : (
          <>
            {/* Title */}
            <input
              value={title}
              onChange={(e) => { markDirty('title'); setTitle(e.target.value) }}
              onBlur={() => saveField('title', title)}
              placeholder="Title"
              className="bg-transparent text-[14px] font-semibold text-white/90 border-b border-white/[0.04] focus:border-white/20 outline-none pb-1 transition-colors"
            />

            {/* Hook */}
            <LabeledInput
              label="Hook"
              value={hook}
              onChange={(value) => { markDirty('hook'); setHook(value) }}
              onBlur={() => saveField('hook', hook)}
              placeholder="Opening line that grabs attention"
            />

            {/* Content — main editable body (auto-grows to fit) */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[9px] uppercase tracking-wider text-white/30">Content</label>
                <CopyContentButton content={content} />
              </div>
              <AutoTextarea
                value={content}
                onChange={(value) => { markDirty('content'); setContent(value) }}
                onBlur={() => saveField('content', content)}
                placeholder="Write the post…"
                className="text-[13px] text-white/85 bg-black/20 border border-white/10 rounded-md p-2 leading-relaxed font-normal focus:outline-none focus:border-white/30 min-h-[160px]"
              />
            </div>

            {/* CTA */}
            <LabeledInput
              label="CTA"
              value={cta}
              onChange={(value) => { markDirty('cta'); setCta(value) }}
              onBlur={() => saveField('cta', cta)}
              placeholder="Call to action"
            />

            {/* Status pills (also used to un-post) */}
            <div>
              <label className="text-[9px] uppercase tracking-wider text-white/30 block mb-1">Status</label>
              <div className="flex flex-wrap gap-1">
                {POST_STATUS_ORDER.map((s) => {
                  const active = post.status === s
                  return (
                    <button
                      key={s}
                      onClick={() => onSetStatus && onSetStatus(s)}
                      className="text-[11px] px-2 py-1 rounded-md font-medium transition-colors"
                      style={
                        active
                          ? { backgroundColor: POST_STATUS_COLORS[s] + '22', color: POST_STATUS_COLORS[s] }
                          : { color: 'rgba(255,255,255,0.35)' }
                      }
                    >
                      {POST_STATUS_LABELS[s]}
                    </button>
                  )
                })}
              </div>
              {posted && (
                <button
                  onClick={() => onSetStatus && onSetStatus('draft')}
                  className="text-[10px] text-white/40 hover:text-white/80 mt-1.5 underline underline-offset-2"
                >
                  Unpost — revert to draft
                </button>
              )}
            </div>

            {/* Category pills */}
            <div>
              <label className="text-[9px] uppercase tracking-wider text-white/30 block mb-1">Category</label>
              <div className="flex flex-wrap gap-1">
                {CATEGORIES.map((c) => {
                  const active = post.category === c
                  return (
                    <button
                      key={c}
                      onClick={() => saveField('category', c)}
                      className="text-[11px] px-2 py-1 rounded-md font-medium capitalize transition-colors"
                      style={
                        active
                          ? { backgroundColor: CATEGORY_COLORS[c] + '22', color: CATEGORY_COLORS[c] }
                          : { color: 'rgba(255,255,255,0.35)' }
                      }
                    >
                      {c}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* URL after posting */}
            <LabeledInput
              label="Posted URL"
              value={url}
              onChange={(value) => { markDirty('url'); setUrl(value) }}
              onBlur={() => saveField('url', url || null)}
              placeholder="Paste here after you post"
            />

            {/* Notes — collapsed */}
            <details className="text-[11px]">
              <summary className="cursor-pointer text-white/40 hover:text-white/70 select-none">
                Notes
              </summary>
              <textarea
                value={notes}
                onChange={(e) => { markDirty('notes'); setNotes(e.target.value) }}
                onBlur={() => saveField('notes', notes)}
                placeholder="Additional notes"
                rows={3}
                className="mt-1 text-[12px] text-white/70 bg-black/20 border border-white/10 rounded-md p-2 w-full resize-y focus:outline-none focus:border-white/30"
              />
            </details>

            {/* Fast-path: mark posted */}
            {!posted && onSetStatus && (
              <div className="flex items-center justify-end pt-1">
                <button
                  onClick={() => onSetStatus('posted')}
                  className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-md transition-colors"
                >
                  Mark as posted
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {(post || mediaPath) && (
        <ThumbnailBox
          mediaPath={mediaPath}
          mediaKind={mediaKind}
          status={mediaPath ? status : MEDIA_STATUS_UI.none}
          aspect="aspect-video"
          onPick={onPickMedia}
          onRemove={onRemoveMedia}
          onUploadFile={onUploadFile}
          onCopyPath={onCopyPath}
          copyFlash={copyFlash}
        />
      )}
    </div>
  )
}

function CopyContentButton({ content }: { content: string }) {
  const [flash, setFlash] = useState(false)
  async function handleCopy() {
    if (!content) return
    try {
      await navigator.clipboard.writeText(content)
      setFlash(true)
      setTimeout(() => setFlash(false), 1500)
    } catch {
      // Fallback for older Electron contexts
      const ta = document.createElement('textarea')
      ta.value = content
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(ta)
      setFlash(true)
      setTimeout(() => setFlash(false), 1500)
    }
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!content}
      className={`text-[10px] font-medium px-2 py-0.5 rounded transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
        flash ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/[0.06] text-white/55 hover:bg-white/[0.12] hover:text-white/85'
      }`}
      title="Copy post content"
    >
      {flash ? '✓ copied' : 'Copy'}
    </button>
  )
}

function AutoTextarea({
  value,
  onChange,
  onBlur,
  placeholder,
  className,
}: {
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  placeholder?: string
  className?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  function resize() {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  useEffect(() => {
    resize()
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => { onChange(e.target.value); resize() }}
      onBlur={onBlur}
      onInput={resize}
      placeholder={placeholder}
      rows={1}
      className={`resize-none overflow-hidden ${className ?? ''}`}
      style={{ fieldSizing: 'content' } as React.CSSProperties}
    />
  )
}

function LabeledInput({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onBlur: () => void
  placeholder?: string
}) {
  return (
    <div>
      <label className="text-[9px] uppercase tracking-wider text-white/30 block mb-0.5">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className="w-full bg-transparent text-[12px] text-white/85 border-b border-white/[0.04] focus:border-white/20 outline-none pb-1 transition-colors"
      />
    </div>
  )
}

function ShortVideoColumn({
  video,
  meta,
  dateKey,
  canAct,
  onOpen,
  onUploadFile,
  onPickMedia,
  onRemoveMedia,
  onDeleteVideo,
  onCopyPath,
  copyFlash,
  className,
  onAttachToBatch,
  onDetachFromBatch,
}: {
  video: Video | null
  meta: DailyVideoMeta
  dateKey: string
  canAct: boolean
  onOpen?: () => void
  onUploadFile?: (file: File) => Promise<Video | null>
  onPickMedia?: () => void
  onRemoveMedia?: () => void
  onDeleteVideo?: () => void
  onCopyPath?: (path: string) => void
  copyFlash?: string | null
  className?: string
  onAttachToBatch?: () => void
  onDetachFromBatch?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clipPath = video?.clipPaths?.[0] ?? null
  const clipUrl = clipPath ? `/api/media/serve?path=${encodeURIComponent(clipPath)}` : null
  const plan = getDailyVideoProductionPlan(video, dateKey)

  async function handleFiles(files: FileList | null) {
    if (!onUploadFile || !files || files.length === 0) return
    const file = files[0]
    if (!file.type.startsWith('video/')) {
      setError('Only video files are supported')
      return
    }
    setError(null)
    setUploading(true)
    try {
      await onUploadFile(file)
    } catch (e: any) {
      setError(e?.message ?? 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className={`flex flex-col ${className ?? ''}`}>
      <div className="rounded-xl bg-white/[0.045] border border-white/[0.09] p-3 flex-1 flex flex-col min-h-[300px]">
        <div className="relative flex items-center justify-center mb-2 min-h-6">
          <span className="text-[12px] font-semibold text-white/80">Short video</span>
          <div className="absolute right-0 flex items-center gap-2">
            {onAttachToBatch && (
              <button
                onClick={onAttachToBatch}
                title="Pin this short to the current batch (multiple shorts per day allowed; each batch can carry its own)"
                className="text-[10px] text-cyan-300/75 hover:text-cyan-200 transition-colors"
              >
                Link to batch
              </button>
            )}
            {onDetachFromBatch && (
              <button
                onClick={onDetachFromBatch}
                title="Unpin this short from the current batch — it falls back to the day-level slot"
                className="text-[10px] text-amber-300/75 hover:text-amber-200 transition-colors"
              >
                Unlink batch
              </button>
            )}
            {onOpen && (
              <button
                onClick={onOpen}
                className="text-[11px] text-white/35 hover:text-white/85 transition-colors"
              >
                Open →
              </button>
            )}
            {onDeleteVideo && (
              <button
                onClick={onDeleteVideo}
                disabled={uploading}
                className="text-[10px] text-red-300/70 hover:text-red-200 disabled:opacity-40 transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        </div>

        <div className="mb-3 rounded-lg bg-white/[0.035] border border-white/[0.06] px-3 py-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/30">
            <span>{meta.contentType}</span>
            <span className="text-white/15">/</span>
            <span>{meta.dayRole}</span>
          </div>
          <div className="mt-1 text-[12px] font-medium text-white/80 line-clamp-2">{meta.topic}</div>
          <div className="mt-1 text-[11px] text-white/35 line-clamp-2">{meta.brief}</div>
        </div>

        {canAct && (
          <div className="mb-3 flex flex-col items-center gap-2">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
              className={`relative w-full max-w-[230px] rounded-[2.4rem] bg-zinc-950 p-2 shadow-[0_18px_50px_rgba(0,0,0,0.42)] border transition-colors ${
                dragOver ? 'border-orange-400/70 ring-2 ring-orange-400/20' : 'border-white/[0.16]'
              }`}
            >
              <div className="pointer-events-none absolute left-1/2 top-3 z-20 h-5 w-20 -translate-x-1/2 rounded-full bg-black/90 border border-white/[0.08] shadow-[0_2px_10px_rgba(0,0,0,0.45)]" />
              <div className="relative aspect-[9/19.5] overflow-hidden rounded-[1.9rem] bg-black border border-white/[0.08]">
                {clipUrl ? (
                  <video src={clipUrl} controls className="h-full w-full object-cover" preload="metadata" />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.1),transparent_34%),#050505] text-white/45 text-[11px] px-4 text-center">
                    <button
                      onClick={() => inputRef.current?.click()}
                      disabled={uploading}
                      className="flex flex-col items-center gap-0.5 hover:text-white/85 transition-colors disabled:opacity-50"
                    >
                      <span className="text-2xl leading-none">+</span>
                      <span>{uploading ? 'Uploading…' : 'Drop or click to upload finished edit'}</span>
                    </button>
                    {onPickMedia && (
                      <button
                        onClick={onPickMedia}
                        className="text-white/45 hover:text-white/85 underline underline-offset-2"
                      >
                        or pick from library
                      </button>
                    )}
                  </div>
                )}
                <div className="pointer-events-none absolute bottom-2 left-1/2 h-1 w-20 -translate-x-1/2 rounded-full bg-white/65 shadow-[0_0_10px_rgba(0,0,0,0.5)]" />
              </div>
            </div>

            {clipUrl && (
              <div className="flex w-full max-w-[230px] flex-wrap justify-center gap-1">
                {onCopyPath && clipPath && (
                  <button
                    onClick={() => onCopyPath(clipPath)}
                    className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-white/[0.06] text-white/65 hover:text-white hover:bg-white/[0.1] transition-colors"
                    title={clipPath}
                  >
                    {copyFlash === clipPath ? '✓ copied' : 'Copy path'}
                  </button>
                )}
                {onPickMedia && (
                  <button
                    onClick={onPickMedia}
                    className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-white/[0.06] text-white/65 hover:text-white hover:bg-white/[0.1] transition-colors"
                  >
                    Pick media
                  </button>
                )}
                <button
                  onClick={() => inputRef.current?.click()}
                  className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-white/[0.06] text-white/65 hover:text-white hover:bg-white/[0.1] transition-colors"
                >
                  Replace
                </button>
                {onRemoveMedia && (
                  <button
                    onClick={onRemoveMedia}
                    className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-white/[0.06] text-red-200/75 hover:text-red-100 hover:bg-red-500/[0.12] transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            )}

            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>
        )}
        {error && <div className="text-[10px] text-red-400 mb-1">{error}</div>}

        {video ? (
          <CompactRecordingPacket plan={plan} />
        ) : canAct ? (
          <div className="text-white/20 text-[11px] italic text-center px-2 py-1">
            Script and production notes will show here before filming. Upload the finished short after editing.
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-white/20 text-[12px] italic text-center px-2">
            No run yet
          </div>
        )}
      </div>
    </div>
  )
}

function CompactRecordingPacket({ plan }: { plan: ReturnType<typeof getDailyVideoProductionPlan> }) {
  if (!hasDailyVideoProductionPlan(plan)) {
    return (
      <div className="rounded-lg border border-amber-400/15 bg-amber-400/[0.06] px-2.5 py-2 text-[11px] leading-snug text-amber-100/55">
        Missing recording packet: script, b-roll, edit ideas, and cover idea.
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-2 overflow-hidden rounded-lg border border-white/[0.06] bg-black/15 p-2.5">
      <div className="text-[9px] uppercase tracking-wider text-white/30">Recording packet</div>
      <CompactPacketField label="Hook" value={plan.hook} lines={2} />
      <CompactPacketField label="Script" value={plan.script} lines={5} />
      <CompactPacketField label="B-roll" value={plan.bRoll} lines={3} />
      <CompactPacketField label="Edit" value={plan.editIdeas} lines={3} />
      <CompactPacketField label="Cover" value={plan.imageIdea} lines={2} />
    </div>
  )
}

function CompactPacketField({ label, value, lines }: { label: string; value: string; lines: number }) {
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

function featureFolder(p: string | null): string | null {
  if (!p) return null
  // strip the trailing /current.* or /versions/<file>
  const m = p.match(/^(.*\/media\/videos\/rendered\/(?:features|demos)\/[^/]+)\//)
  return m ? m[1] : null
}

function ThumbnailBox({
  mediaPath,
  mediaKind,
  status,
  aspect,
  onPick,
  onRemove,
  onUploadFile,
  onCopyPath,
  copyFlash,
}: {
  mediaPath: string | null
  mediaKind: MediaKind | null
  status: (typeof MEDIA_STATUS_UI)[MediaStatus]
  aspect: string
  onPick?: () => void
  onRemove?: () => void
  onUploadFile?: (file: File) => Promise<void>
  onCopyPath?: (path: string) => void
  copyFlash?: string | null
}) {
  const [openingPremiere, setOpeningPremiere] = useState(false)
  const [premiereFlash, setPremiereFlash] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const srcUrl = mediaPath ? `/api/media/serve?path=${encodeURIComponent(mediaPath)}` : null
  const folder = featureFolder(mediaPath)
  const canEditInPremiere = !!folder
  const isImage = mediaKind === 'image' || (!mediaKind && /\.(png|jpg|jpeg|gif|webp|heic|heif|bmp|tiff)$/i.test(mediaPath || ''))

  async function handleFiles(files: FileList | null) {
    if (!onUploadFile || !files || files.length === 0) return
    const file = files[0]
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      setUploadError('Only images and videos are supported')
      setTimeout(() => setUploadError(null), 2500)
      return
    }
    setUploadError(null)
    setUploading(true)
    try {
      await onUploadFile(file)
    } catch (e: any) {
      setUploadError(e?.message ?? 'Upload failed')
      setTimeout(() => setUploadError(null), 2500)
    } finally {
      setUploading(false)
    }
  }

  async function editInPremiere() {
    if (!folder) return
    setOpeningPremiere(true)
    try {
      // try to find an existing .prproj in the folder
      const probe = await fetch(`/api/premiere/projects`).then((r) => r.json()) as Array<{ folder: string; path: string }>
      const match = probe.find((p) => p.folder === folder)
      if (match) {
        await openInPremiere(match.path)
        setPremiereFlash('opening project…')
      } else {
        // No .prproj yet — reveal folder so user can create one
        await revealInFinder(folder)
        setPremiereFlash('no .prproj — opened folder in Finder')
      }
      setTimeout(() => setPremiereFlash(null), 2500)
    } catch (e: any) {
      setPremiereFlash(e?.message ?? 'failed')
      setTimeout(() => setPremiereFlash(null), 2500)
    } finally {
      setOpeningPremiere(false)
    }
  }

  async function revealFolder() {
    if (!folder) return
    try { await revealInFinder(folder) } catch {}
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    if (!onUploadFile) return
    const items = e.clipboardData?.items
    if (!items) return
    const filesFromClipboard: File[] = []
    for (const item of Array.from(items)) {
      if (item.kind !== 'file') continue
      if (!item.type.startsWith('image/') && !item.type.startsWith('video/')) continue
      const file = item.getAsFile()
      if (file) filesFromClipboard.push(file)
    }
    if (filesFromClipboard.length === 0) return
    e.preventDefault()
    const dt = new DataTransfer()
    for (const f of filesFromClipboard) dt.items.add(f)
    handleFiles(dt.files)
  }

  return (
    <div
      tabIndex={onUploadFile ? 0 : -1}
      className={`relative rounded-xl overflow-hidden bg-white/[0.02] border ${aspect} ${dragOver ? 'border-orange-400/70 ring-2 ring-orange-400/20' : 'border-white/[0.04]'} transition-colors ${onUploadFile ? 'focus:outline-none focus:ring-2 focus:ring-white/20' : ''}`}
      onDragOver={onUploadFile ? (e) => { e.preventDefault(); setDragOver(true) } : undefined}
      onDragLeave={onUploadFile ? () => setDragOver(false) : undefined}
      onDrop={onUploadFile ? (e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) } : undefined}
      onPaste={onUploadFile ? handlePaste : undefined}
      title={onUploadFile ? 'Drop, click, or paste (Cmd+V) an image' : undefined}
    >
      {onUploadFile && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      )}
      {srcUrl ? (
        isImage ? (
          <img src={srcUrl} className="w-full h-full object-cover cursor-pointer" onClick={onUploadFile ? () => fileInputRef.current?.click() : undefined} />
        ) : (
          <video src={srcUrl} controls className="w-full h-full object-cover" preload="metadata" />
        )
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
          {onUploadFile ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex flex-col items-center gap-0.5 text-white/45 hover:text-white/85 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <span className="text-2xl leading-none">+</span>
              <span className="text-[11px]">{uploading ? 'Uploading…' : 'Drop or click to upload'}</span>
            </button>
          ) : (
            <div
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium"
              style={{ backgroundColor: status.bg, color: status.color }}
            >
              {status.label}
            </div>
          )}
        </div>
      )}
      {uploading && srcUrl && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white/85 text-[12px] font-medium pointer-events-none">
          Uploading…
        </div>
      )}
      {uploadError && (
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-medium bg-red-500/30 text-red-100">
          {uploadError}
        </div>
      )}

      <div
        className="absolute top-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-medium"
        style={{ backgroundColor: status.bg, color: status.color }}
      >
        {status.label}
      </div>

      <div className="absolute bottom-2 right-2 flex gap-1 flex-wrap justify-end">
        {canEditInPremiere && (
          <>
            <button
              onClick={editInPremiere}
              disabled={openingPremiere}
              className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-black/70 text-white/80 hover:text-white transition-colors disabled:opacity-50"
              title="Open feature .prproj (or reveal folder if none)"
            >
              {openingPremiere ? 'Opening…' : 'Premiere'}
            </button>
            <button
              onClick={revealFolder}
              className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-black/70 text-white/80 hover:text-white transition-colors"
              title="Reveal feature folder in Finder"
            >
              Reveal
            </button>
          </>
        )}
        {onCopyPath && mediaPath && (
          <button
            onClick={() => onCopyPath(mediaPath)}
            className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-black/70 text-white/80 hover:text-white transition-colors"
            title={mediaPath}
          >
            {copyFlash === mediaPath ? '✓ copied' : 'Copy path'}
          </button>
        )}
        {onPick && (
          <button
            onClick={onPick}
            className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-black/70 text-white/80 hover:text-white transition-colors"
          >
            {mediaPath ? 'Replace' : 'Pick media'}
          </button>
        )}
        {onRemove && mediaPath && (
          <button
            onClick={onRemove}
            className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-black/70 text-red-200/80 hover:text-red-100 transition-colors"
          >
            Remove
          </button>
        )}
      </div>
      {premiereFlash && (
        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-500/30 text-emerald-100">
          {premiereFlash}
        </div>
      )}
    </div>
  )
}

function MediaPicker({
  currentPath,
  videoOnly,
  onPick,
  onClose,
}: {
  currentPath: string | null
  videoOnly?: boolean
  onPick: (item: MediaItem) => void
  onClose: () => void
}) {
  const [items, setItems] = useState<MediaItem[]>([])
  const [storage, setStorage] = useState<StorageInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [kind, setKind] = useState<'all' | 'video' | 'image'>(videoOnly ? 'video' : 'all')

  useEffect(() => {
    Promise.all([getMediaLibrary(), getStorageInfo().catch(() => null)])
      .then(([list, info]) => {
        setItems(list)
        setStorage(info)
      })
      .finally(() => setLoading(false))
  }, [])

  const filtered = items.filter((m) => {
    if (videoOnly && m.type !== 'video') return false
    if (kind !== 'all' && m.type !== kind) return false
    if (filter && !m.filename.toLowerCase().includes(filter.toLowerCase()) && !m.path.toLowerCase().includes(filter.toLowerCase())) return false
    return true
  })

  // Group by bucket (forge-features, forge-demo, week-key)
  const grouped = filtered.reduce<Record<string, MediaItem[]>>((acc, m) => {
    const k = m.weekKey || 'other'
    ;(acc[k] = acc[k] || []).push(m)
    return acc
  }, {})
  const bucketOrder = Object.keys(grouped).sort((a, b) => {
    if (a === 'images') return -1
    if (b === 'images') return 1
    if (a.startsWith('forge')) return -1
    if (b.startsWith('forge')) return 1
    return b.localeCompare(a)
  })
  const hasImagesBucket = Object.prototype.hasOwnProperty.call(grouped, 'images')
  const showEmptyImagesBucket = !videoOnly && kind !== 'video' && !filter && !hasImagesBucket && !!storage?.activeProject.imagesDir

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-zinc-950 border border-white/10 rounded-2xl max-w-4xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="text-sm font-semibold text-white/80">Pick media</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white/90 text-lg">×</button>
        </div>
        <div className="flex items-center gap-2 p-3 border-b border-white/10">
          <input
            placeholder="Filter by filename or path…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="flex-1 bg-black/30 border border-white/10 rounded-md px-3 py-1.5 text-[12px] text-white/80 focus:outline-none focus:border-white/30"
          />
          {!videoOnly && (
            <div className="flex items-center gap-1 text-[11px]">
              {(['all', 'video', 'image'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`px-2 py-1 rounded-md capitalize ${kind === k ? 'bg-white/10 text-white/90' : 'text-white/40 hover:text-white/70'}`}
                >
                  {k}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="text-white/30 text-[12px] text-center py-8">Loading library…</div>
          ) : filtered.length === 0 ? (
            <div className="text-white/30 text-[12px] text-center py-8">
              No media matches.
              {showEmptyImagesBucket && (
                <div className="mt-2 text-[11px] text-white/20">
                  Images folder is empty: <span className="font-mono">{storage?.activeProject.imagesDir}</span>
                </div>
              )}
            </div>
          ) : (
            <>
              {showEmptyImagesBucket && (
                <div className="mb-4 rounded-lg border border-white/[0.06] bg-white/[0.025] p-3">
                  <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">images (0)</div>
                  <div className="text-[11px] text-white/25">
                    Add images here and they will show in this picker:
                    <span className="block mt-1 font-mono break-all text-white/35">{storage?.activeProject.imagesDir}</span>
                  </div>
                </div>
              )}
              {bucketOrder.map((bucket) => (
                <div key={bucket} className="mb-4">
                  <div className="text-[10px] uppercase tracking-wider text-white/40 mb-2">{bucket} ({grouped[bucket].length})</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {grouped[bucket].map((m) => (
                      <MediaPickerItem
                        key={m.path}
                        item={m}
                        selected={m.path === currentPath}
                        onPick={() => onPick(m)}
                        onPickVersion={(v) => onPick(v)}
                        showVersions={bucket === 'rendered-features' || bucket === 'rendered-demos'}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function MediaPickerItem({
  item,
  selected,
  onPick,
  onPickVersion,
  showVersions,
}: {
  item: MediaItem
  selected: boolean
  onPick: () => void
  onPickVersion?: (versionItem: MediaItem) => void
  showVersions?: boolean
}) {
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [versions, setVersions] = useState<MediaVersion[] | null>(null)
  const [loadingVersions, setLoadingVersions] = useState(false)
  const srcUrl = `/api/media/serve?path=${encodeURIComponent(item.path)}`
  // For per-feature renders, item.path is .../<feature>/current.<ext> — feature dir is the parent.
  const featureDir = item.path.replace(/\/current\.[^/]+$/, '')
  const hasVersionDir = featureDir !== item.path

  async function loadVersions() {
    if (versions || loadingVersions) return
    setLoadingVersions(true)
    try {
      const list = await getMediaVersions(featureDir)
      setVersions(list)
    } catch {
      setVersions([])
    } finally {
      setLoadingVersions(false)
    }
  }

  function toggleVersions(e: React.MouseEvent) {
    e.stopPropagation()
    setVersionsOpen((v) => !v)
    if (!versionsOpen) loadVersions()
  }

  return (
    <div className="relative">
      <button
        onClick={onPick}
        className={`relative rounded-lg overflow-hidden bg-black/40 border w-full ${selected ? 'border-emerald-400/70' : 'border-white/[0.06] hover:border-white/20'} aspect-video group transition-colors`}
      >
        {item.type === 'image' ? (
          <img src={srcUrl} className="w-full h-full object-cover" />
        ) : item.type === 'video' ? (
          <video src={srcUrl} className="w-full h-full object-cover" preload="metadata" muted />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/30 text-[11px]">file</div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-2 text-left">
          <div className="text-[10px] text-white/80 truncate">{item.filename}</div>
        </div>
        {selected && (
          <div className="absolute top-1 right-1 text-[10px] bg-emerald-500/30 text-emerald-200 px-1.5 py-0.5 rounded">current</div>
        )}
      </button>
      {showVersions && hasVersionDir && (
        <button
          onClick={toggleVersions}
          className="mt-1 text-[10px] text-white/40 hover:text-white/80 underline underline-offset-2"
        >
          {versionsOpen ? 'hide versions ▴' : 'versions ▾'}
        </button>
      )}
      {versionsOpen && (
        <div className="mt-1 bg-black/40 border border-white/[0.06] rounded-md p-1.5 max-h-40 overflow-y-auto space-y-0.5">
          {loadingVersions && <div className="text-[10px] text-white/30">loading…</div>}
          {!loadingVersions && versions && versions.length === 0 && (
            <div className="text-[10px] text-white/30">no versions yet</div>
          )}
          {versions?.map((v) => (
            <button
              key={v.path}
              onClick={(e) => { e.stopPropagation(); onPickVersion?.({ ...item, path: v.path, filename: v.filename, modified: v.modified, size: v.size }) }}
              className="w-full text-left text-[10px] text-white/70 hover:text-white/95 hover:bg-white/[0.04] px-1.5 py-1 rounded font-mono truncate"
              title={v.path}
            >
              {v.filename}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
