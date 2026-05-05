import { useEffect, useState, useCallback } from 'react'
import { createVideo, createPost, getVideos, getPosts } from '../lib/api'
import { useIsMobile } from '../lib/useIsMobile'
import type { Video, Post } from '../lib/types'

interface Props {
  onOpenVideo: (id: string) => void
  onOpenPost: (id: string) => void
}

interface TaskDef {
  key: string
  label: string
  color: string
  type: 'video' | 'post'
  platform?: string
  freq: 'daily' | 'weekly'
}

const TASKS: TaskDef[] = [
  { key: 'daily-video', label: 'Daily Video', color: '#22d3ee', type: 'video', freq: 'daily' },
  { key: 'ig-short', label: 'IG Reel', color: '#e1306c', type: 'video', platform: 'instagram', freq: 'daily' },
  { key: 'tiktok-short', label: 'TikTok', color: '#00f2ea', type: 'video', platform: 'tiktok', freq: 'daily' },
  { key: 'yt-short', label: 'YT Short', color: '#ff0000', type: 'video', platform: 'youtube', freq: 'daily' },
  { key: 'x-post', label: 'X', color: '#1da1f2', type: 'post', platform: 'x', freq: 'daily' },
  { key: 'linkedin-post', label: 'LinkedIn', color: '#0a66c2', type: 'post', platform: 'linkedin', freq: 'daily' },
  { key: 'reddit-post', label: 'Reddit', color: '#ff4500', type: 'post', platform: 'reddit', freq: 'daily' },
  { key: 'yt-video', label: 'YT Video', color: '#ff0000', type: 'video', platform: 'youtube', freq: 'weekly' },
]

export { TASKS }

type WeekData = Record<string, Record<string, string | boolean>> // date -> taskKey -> contentId or true

function getWeekInfo(weekOffset = 0) {
  const now = new Date()
  const base = new Date(now)
  base.setDate(now.getDate() + weekOffset * 7)
  const day = base.getDay()
  const monday = new Date(base)
  monday.setDate(base.getDate() - ((day + 6) % 7))

  const jan1 = new Date(monday.getFullYear(), 0, 1)
  const weekNum = Math.ceil(((monday.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
  const weekKey = `${monday.getFullYear()}-W${String(weekNum).padStart(2, '0')}`

  const todayStr = now.toISOString().split('T')[0]
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const dateStr = d.toISOString().split('T')[0]
    return { date: dateStr, num: d.getDate(), dayName: dayNames[i], month: monthNames[d.getMonth()], isToday: dateStr === todayStr, isPast: dateStr < todayStr }
  })

  const rangeLabel = `${days[0].month} ${days[0].num} – ${days[6].month} ${days[6].num}`
  const todayIndex = days.findIndex(d => d.isToday)

  return { weekKey, days, rangeLabel, todayIndex: todayIndex >= 0 ? todayIndex : 0 }
}

export { getWeekInfo }

export function WeeklyTracker({ onOpenVideo, onOpenPost }: Props) {
  const [weekData, setWeekData] = useState<WeekData>({})
  const [videos, setVideos] = useState<Video[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [frozenTasks, setFrozenTasks] = useState<string[]>([])
  const [showFrozen, setShowFrozen] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)
  const isMobile = useIsMobile()
  const { weekKey, days, rangeLabel, todayIndex } = getWeekInfo(weekOffset)
  const [selectedDay, setSelectedDay] = useState(todayIndex)
  const weekLabel = weekOffset === 0
    ? 'This Week'
    : weekOffset === 1
    ? 'Next Week'
    : weekOffset === -1
    ? 'Last Week'
    : weekOffset > 0
    ? `${weekOffset} Weeks Ahead`
    : `${Math.abs(weekOffset)} Weeks Back`

  const load = useCallback(() => {
    fetch(`/api/weekly/${weekKey}`).then(r => r.json()).then(setWeekData)
    getVideos().then(setVideos)
    getPosts().then(setPosts)
    fetch('/api/frozen').then(r => r.json()).then(setFrozenTasks)
  }, [weekKey])

  const toggleFreeze = async (taskKey: string) => {
    const next = frozenTasks.includes(taskKey)
      ? frozenTasks.filter(k => k !== taskKey)
      : [...frozenTasks, taskKey]
    setFrozenTasks(next)
    await fetch('/api/frozen', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    })
  }

  useEffect(() => { load() }, [load])
  useEffect(() => { setSelectedDay(weekOffset === 0 ? todayIndex : 0) }, [weekKey, todayIndex, weekOffset])

  const saveWeekData = async (updated: WeekData) => {
    setWeekData(updated)
    await fetch(`/api/weekly/${weekKey}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    })
  }

  const handleClick = async (date: string, task: TaskDef, day: typeof days[0]) => {
    const existing = weekData[date]?.[task.key]

    // If already linked to content, open it
    if (existing && typeof existing === 'string' && existing !== 'skipped') {
      if (task.type === 'video') onOpenVideo(existing)
      else onOpenPost(existing)
      return
    }

    // Create new content and link it
    const title = task.freq === 'weekly'
      ? `${task.label} — Week of ${days[0].month} ${days[0].num}`
      : `${task.label} — ${day.dayName} ${day.month} ${day.num}`

    let contentId: string

    if (task.type === 'video') {
      const video = await createVideo({ title, category: 'building' })
      contentId = video.id
      onOpenVideo(contentId)
    } else {
      const post = await createPost({ title, platform: task.platform as any, category: 'building' })
      contentId = post.id
      onOpenPost(contentId)
    }

    // Link in weekly data
    const updated = { ...weekData, [date]: { ...weekData[date], [task.key]: contentId } }
    await saveWeekData(updated)
    load()
  }

  const resetCell = async (date: string, taskKey: string) => {
    const dayData = { ...weekData[date] }
    delete dayData[taskKey]
    const updated = { ...weekData, [date]: dayData }
    await saveWeekData(updated)
    load()
  }

  const skipCell = async (date: string, taskKey: string) => {
    const updated = { ...weekData, [date]: { ...weekData[date], [taskKey]: 'skipped' } }
    await saveWeekData(updated)
    load()
  }

  // Get content status for a cell
  const getCellStatus = (date: string, taskKey: string): { linked: boolean; status: string | null; id: string | null } => {
    const val = weekData[date]?.[taskKey]
    if (!val) return { linked: false, status: null, id: null }
    if (val === 'skipped') return { linked: false, status: 'skipped', id: null }
    if (typeof val === 'boolean') return { linked: false, status: val ? 'done' : null, id: null }

    const video = videos.find(v => v.id === val)
    if (video) return { linked: true, status: video.status, id: val }
    const post = posts.find(p => p.id === val)
    if (post) return { linked: true, status: post.status, id: val }
    return { linked: true, status: 'unknown', id: val }
  }

  // Count stats (exclude frozen and skipped tasks)
  const activeTasks = TASKS.filter(t => !frozenTasks.includes(t.key))
  const dailyTasks = activeTasks.filter(t => t.freq === 'daily')
  const weeklyTasks = activeTasks.filter(t => t.freq === 'weekly')
  const frozenCount = TASKS.filter(t => frozenTasks.includes(t.key)).length

  let completed = 0
  let inProgress = 0
  let skipped = 0
  for (const day of days) {
    for (const task of activeTasks) {
      if (task.freq === 'weekly' && day !== days[0]) continue
      const cell = getCellStatus(day.date, task.key)
      if (cell.status === 'skipped') skipped++
      else if (cell.status === 'posted') completed++
      else if (cell.linked) inProgress++
    }
  }
  // Check weekly tasks across all days
  for (const task of weeklyTasks) {
    for (const day of days) {
      const cell = getCellStatus(day.date, task.key)
      if (cell.status === 'skipped') { skipped++; break }
      if (cell.status === 'posted') { completed++; break }
      if (cell.linked) { inProgress++; break }
    }
  }
  const totalSlots = days.length * dailyTasks.length + weeklyTasks.length - skipped

  const pct = totalSlots > 0 ? Math.round((completed / totalSlots) * 100) : 0

  // ─── Mobile Card View ───
  if (isMobile) {
    const d = days[selectedDay]
    const dayActiveTasks = activeTasks.filter(t => t.freq === 'daily' || (t.freq === 'weekly' && selectedDay === 0))
    const dayFrozenTasks = TASKS.filter(t => frozenTasks.includes(t.key))

    return (
      <div className="glass glass-border rounded-2xl p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight">{weekLabel}</h2>
            <div className="text-[12px] text-white/30 font-medium">{rangeLabel}</div>
          </div>
          <div className="text-2xl font-bold tabular-nums" style={{ color: pct === 100 ? '#22c55e' : pct > 50 ? '#f59e0b' : '#ef4444' }}>
            {pct}<span className="text-sm text-zinc-500">%</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 mb-4">
          <button
            onClick={() => setWeekOffset(o => o - 1)}
            className="h-8 px-3 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[12px] text-white/50 active:scale-95 transition-transform"
          >
            Prev
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            disabled={weekOffset === 0}
            className="h-8 px-3 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[12px] text-white/50 disabled:opacity-35 active:scale-95 transition-transform"
          >
            Today
          </button>
          <button
            onClick={() => setWeekOffset(o => o + 1)}
            className="h-8 px-3 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[12px] text-white/50 active:scale-95 transition-transform"
          >
            Next
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex gap-0.5 mb-4">
          {Array.from({ length: totalSlots }, (_, i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full"
              style={{
                backgroundColor: i < completed ? '#22c55e' : i < completed + inProgress ? '#f59e0b' : '#27272a',
              }}
            />
          ))}
        </div>

        {/* Day Selector */}
        <div className="flex gap-1 mb-4 overflow-x-auto">
          {days.map((day, i) => (
            <button
              key={day.date}
              onClick={() => setSelectedDay(i)}
              className={`flex-1 min-w-[42px] py-2 rounded-xl text-center transition-all ${
                i === selectedDay
                  ? 'bg-white/[0.1] border border-white/[0.12]'
                  : day.isToday
                  ? 'bg-white/[0.04] border border-white/[0.06]'
                  : 'border border-transparent'
              }`}
            >
              <div className={`text-[10px] uppercase tracking-wider ${i === selectedDay || day.isToday ? 'text-white/70' : 'text-zinc-600'}`}>
                {day.dayName}
              </div>
              <div className={`text-sm font-semibold mt-0.5 ${
                day.isToday && i === selectedDay ? 'text-white' : day.isToday ? 'text-white/80' : i === selectedDay ? 'text-white' : day.isPast ? 'text-zinc-500' : 'text-zinc-400'
              }`}>
                {day.num}
              </div>
            </button>
          ))}
        </div>

        {/* Task Cards */}
        <div className="space-y-2">
          {dayActiveTasks.map(task => {
            const cell = getCellStatus(d.date, task.key)
            const isSkipped = cell.status === 'skipped'
            const isPosted = cell.status === 'posted'
            const isWorking = cell.linked && !isPosted
            const isEmpty = !isPosted && !isWorking && !isSkipped

            return (
              <div
                key={task.key}
                className={`flex items-center gap-3 rounded-xl p-3 transition-all ${
                  isSkipped
                    ? 'bg-zinc-900/50 border border-zinc-800/50'
                    : isPosted
                    ? 'bg-emerald-500/[0.07] border border-emerald-500/20'
                    : isWorking
                    ? 'bg-amber-500/[0.07] border border-amber-500/20'
                    : 'bg-white/[0.02] border border-white/[0.06]'
                }`}
              >
                <div className="w-1 h-8 rounded-full shrink-0" style={{ backgroundColor: isSkipped ? '#52525b' : task.color }} />
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${isSkipped ? 'text-zinc-500 line-through' : 'text-white/90'}`}>
                    {task.label}
                  </div>
                  <div className="text-[11px] text-white/30">
                    {isSkipped ? 'Skipped' : isPosted ? 'Posted' : isWorking ? statusLabel(cell.status!) : task.type === 'video' ? 'Video' : 'Post'}
                  </div>
                </div>

                {/* Status badge */}
                {isPosted && (
                  <button onClick={() => handleClick(d.date, task, d)} className="text-emerald-400 text-lg">✓</button>
                )}
                {isWorking && (
                  <button onClick={() => handleClick(d.date, task, d)} className="text-amber-400 text-sm font-medium px-2 py-1 rounded-lg bg-amber-500/10">
                    {statusIcon(cell.status!)}
                  </button>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {isEmpty && (
                    <>
                      <button
                        onClick={() => handleClick(d.date, task, d)}
                        className="w-9 h-9 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white/50 text-lg flex items-center justify-center active:scale-95 transition-transform"
                        title={`Create ${task.label}`}
                      >
                        +
                      </button>
                      <button
                        onClick={() => skipCell(d.date, task.key)}
                        className="w-9 h-9 rounded-lg bg-zinc-800/80 border border-zinc-700/50 text-zinc-500 text-sm flex items-center justify-center active:scale-95 transition-transform"
                        title="Skip today"
                      >
                        —
                      </button>
                    </>
                  )}
                  {isSkipped && (
                    <button
                      onClick={() => resetCell(d.date, task.key)}
                      className="text-[11px] text-zinc-500 px-2 py-1 rounded-lg bg-zinc-800/60 active:scale-95 transition-transform"
                    >
                      Undo
                    </button>
                  )}
                  {isWorking && (
                    <button
                      onClick={() => resetCell(d.date, task.key)}
                      className="w-7 h-7 rounded-lg text-zinc-600 text-xs flex items-center justify-center active:scale-95"
                      title="Reset"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Frozen pipelines toggle */}
        {frozenCount > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setShowFrozen(!showFrozen)}
              className="text-[11px] text-zinc-500 font-medium"
            >
              {showFrozen ? '▾' : '▸'} {frozenCount} frozen pipeline{frozenCount > 1 ? 's' : ''}
            </button>
            {showFrozen && (
              <div className="mt-2 space-y-1.5">
                {dayFrozenTasks.map(task => (
                  <div key={task.key} className="flex items-center gap-3 rounded-xl p-2.5 bg-zinc-900/30 border border-zinc-800/30 opacity-50">
                    <div className="w-1 h-6 rounded-full bg-zinc-700 shrink-0" />
                    <div className="text-xs text-zinc-600 line-through flex-1">{task.label}</div>
                    <button
                      onClick={() => toggleFreeze(task.key)}
                      className="text-[10px] text-zinc-500 px-2 py-0.5 rounded bg-zinc-800/60 active:scale-95"
                    >
                      Activate
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ─── Desktop Table View ───
  return (
    <div className="glass glass-border rounded-2xl p-3 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{weekLabel}</h2>
          <div className="text-[13px] text-white/30 mt-0.5 font-medium">{rangeLabel}</div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setWeekOffset(o => o - 1)}
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
              onClick={() => setWeekOffset(o => o + 1)}
              className="h-8 px-3 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[12px] text-white/50 hover:text-white/75 hover:bg-white/[0.07] transition-colors"
            >
              Next
            </button>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-white/30 font-medium">
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-white/10" /> Open</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Working</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Posted</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-zinc-500" /> Skipped</span>
            {frozenTasks.length > 0 && <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-zinc-600" /> Frozen</span>}
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold tabular-nums" style={{ color: pct === 100 ? '#22c55e' : pct > 50 ? '#f59e0b' : '#ef4444' }}>
              {pct}<span className="text-lg text-zinc-500">%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex gap-0.5 mb-6">
        {Array.from({ length: totalSlots }, (_, i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full"
            style={{
              backgroundColor: i < completed ? '#22c55e' : i < completed + inProgress ? '#f59e0b' : '#27272a',
            }}
          />
        ))}
      </div>

      {/* Grid */}
      <div className="overflow-x-auto -mx-2">
        <table className="w-full min-w-[640px] border-separate" style={{ borderSpacing: '4px' }}>
          <thead>
            <tr>
              <th className="w-[100px]" />
              {days.map(d => (
                <th key={d.date} className="text-center pb-1">
                  <div className={`text-[10px] uppercase tracking-wider ${d.isToday ? 'text-white' : 'text-zinc-600'}`}>{d.dayName}</div>
                  <div className={`text-sm font-semibold mt-0.5 ${
                    d.isToday ? 'bg-white text-black w-7 h-7 rounded-full flex items-center justify-center mx-auto' : d.isPast ? 'text-zinc-500' : 'text-zinc-300'
                  }`}>
                    {d.num}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TASKS.map((task) => {
              const isFrozen = frozenTasks.includes(task.key)
              return (
              <tr key={task.key} className={`${task.freq === 'weekly' ? 'border-t border-zinc-800' : ''} ${isFrozen ? 'opacity-30' : ''}`}>
                <td className="pr-2 py-0.5">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleFreeze(task.key)}
                      className={`w-1 h-6 rounded-full shrink-0 transition-all cursor-pointer ${isFrozen ? 'bg-zinc-700 ring-1 ring-zinc-600' : ''}`}
                      style={{ backgroundColor: isFrozen ? undefined : task.color }}
                      title={isFrozen ? 'Unfreeze pipeline' : 'Freeze pipeline — excludes from weekly %'}
                    />
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs font-medium ${isFrozen ? 'text-zinc-600 line-through' : 'text-zinc-300'}`}>{task.label}</div>
                      {task.freq === 'weekly' && <div className="text-[9px] text-zinc-600">weekly</div>}
                      {isFrozen && task.freq !== 'weekly' && <div className="text-[9px] text-zinc-600">frozen</div>}
                    </div>
                  </div>
                </td>
                {days.map(d => {
                  if (isFrozen) {
                    return (
                      <td key={d.date} className="text-center p-0">
                        <div className="w-full h-10 rounded-lg border border-zinc-800/30 bg-zinc-900/30" />
                      </td>
                    )
                  }

                  const cell = getCellStatus(d.date, task.key)
                  const isSkipped = cell.status === 'skipped'
                  const isPosted = cell.status === 'posted'
                  const isWorking = cell.linked && !isPosted
                  const hasContent = isPosted || isWorking
                  const isEmpty = !hasContent && !isSkipped

                  return (
                    <td key={d.date} className="text-center p-0">
                      <div className="relative group/cell">
                        <button
                          onClick={() => isSkipped ? resetCell(d.date, task.key) : handleClick(d.date, task, d)}
                          className={`w-full h-10 rounded-lg border transition-all text-xs font-medium ${
                            isSkipped
                              ? 'border-zinc-700/50 bg-zinc-900/50 text-zinc-600'
                              : isPosted
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                              : isWorking
                              ? 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:border-amber-500/50'
                              : d.isToday
                              ? 'border-zinc-600 bg-zinc-800 text-zinc-500 hover:border-zinc-400 hover:bg-zinc-700'
                              : d.isPast
                              ? 'border-zinc-800/50 bg-zinc-900/50 text-zinc-700'
                              : 'border-zinc-800 bg-zinc-900 text-zinc-600 hover:border-zinc-600 hover:bg-zinc-800'
                          }`}
                          title={isSkipped ? 'Skipped — click to restore' : isPosted ? 'Posted — click to open' : isWorking ? `${cell.status} — click to open` : `Click to create ${task.label}`}
                        >
                          {isSkipped ? '—' : isPosted ? '✓' : isWorking ? statusIcon(cell.status!) : ''}
                        </button>
                        {hasContent && (
                          <button
                            onClick={(e) => { e.stopPropagation(); resetCell(d.date, task.key) }}
                            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-zinc-800 border border-zinc-700 text-[8px] text-white/40 hover:text-red-400 hover:border-red-500/50 opacity-0 group-hover/cell:opacity-100 transition-all flex items-center justify-center"
                            title="Reset — unlink content"
                          >
                            ×
                          </button>
                        )}
                        {isEmpty && (
                          <button
                            onClick={(e) => { e.stopPropagation(); skipCell(d.date, task.key) }}
                            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-zinc-800 border border-zinc-700 text-[8px] text-white/40 hover:text-zinc-400 hover:border-zinc-500/50 opacity-0 group-hover/cell:opacity-100 transition-all flex items-center justify-center"
                            title="Skip — no post today"
                          >
                            –
                          </button>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function statusIcon(status: string): string {
  switch (status) {
    case 'idea': case 'draft': return '○'
    case 'scripted': case 'written': return '◐'
    case 'filming': return '◑'
    case 'editing': return '◕'
    case 'ready': case 'scheduled': return '●'
    default: return '·'
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'idea': return 'Idea'
    case 'draft': return 'Draft'
    case 'scripted': return 'Scripted'
    case 'written': return 'Written'
    case 'filming': return 'Filming'
    case 'editing': return 'Editing'
    case 'ready': return 'Ready'
    case 'scheduled': return 'Scheduled'
    default: return 'In progress'
  }
}
