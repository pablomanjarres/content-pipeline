import { useEffect, useState, useCallback } from 'react'
import { createVideo, createPost, getVideos, getPosts, type Action } from '../lib/api'
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
  { key: 'ig-short', label: 'IG Reel', color: '#e1306c', type: 'video', platform: 'instagram', freq: 'daily' },
  { key: 'tiktok-short', label: 'TikTok', color: '#00f2ea', type: 'video', platform: 'tiktok', freq: 'daily' },
  { key: 'yt-short', label: 'YT Short', color: '#ff0000', type: 'video', platform: 'youtube', freq: 'daily' },
  { key: 'x-post', label: 'X', color: '#1da1f2', type: 'post', platform: 'x', freq: 'daily' },
  { key: 'linkedin-post', label: 'LinkedIn', color: '#0a66c2', type: 'post', platform: 'linkedin', freq: 'daily' },
  { key: 'reddit-post', label: 'Reddit', color: '#ff4500', type: 'post', platform: 'reddit', freq: 'daily' },
  { key: 'yt-video', label: 'YT Video', color: '#ff0000', type: 'video', platform: 'youtube', freq: 'weekly' },
]

type WeekData = Record<string, Record<string, string | boolean>> // date -> taskKey -> contentId or true

function getWeekInfo() {
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7))

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

  return { weekKey, days, rangeLabel }
}

export function WeeklyTracker({ onOpenVideo, onOpenPost }: Props) {
  const [weekData, setWeekData] = useState<WeekData>({})
  const [videos, setVideos] = useState<Video[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [frozenTasks, setFrozenTasks] = useState<string[]>([])
  const { weekKey, days, rangeLabel } = getWeekInfo()

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
    if (existing && typeof existing === 'string') {
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

  // Get content status for a cell
  const getCellStatus = (date: string, taskKey: string): { linked: boolean; status: string | null; id: string | null } => {
    const val = weekData[date]?.[taskKey]
    if (!val) return { linked: false, status: null, id: null }
    if (typeof val === 'boolean') return { linked: false, status: val ? 'done' : null, id: null }

    const video = videos.find(v => v.id === val)
    if (video) return { linked: true, status: video.status, id: val }
    const post = posts.find(p => p.id === val)
    if (post) return { linked: true, status: post.status, id: val }
    return { linked: true, status: 'unknown', id: val }
  }

  // Count stats (exclude frozen tasks)
  const activeTasks = TASKS.filter(t => !frozenTasks.includes(t.key))
  const dailyTasks = activeTasks.filter(t => t.freq === 'daily')
  const weeklyTasks = activeTasks.filter(t => t.freq === 'weekly')
  const totalSlots = days.length * dailyTasks.length + weeklyTasks.length

  let completed = 0
  let inProgress = 0
  for (const day of days) {
    for (const task of activeTasks) {
      if (task.freq === 'weekly' && day !== days[0]) continue
      const cell = getCellStatus(day.date, task.key)
      if (cell.status === 'posted') completed++
      else if (cell.linked) inProgress++
    }
  }
  // Check weekly tasks across all days
  for (const task of weeklyTasks) {
    for (const day of days) {
      const cell = getCellStatus(day.date, task.key)
      if (cell.status === 'posted') { completed++; break }
      if (cell.linked) { inProgress++; break }
    }
  }

  const pct = totalSlots > 0 ? Math.round((completed / totalSlots) * 100) : 0

  return (
    <div className="glass glass-border rounded-2xl p-3 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-bold tracking-tight">This <span className="font-serif italic font-normal text-white/70">Week</span></h2>
          <div className="text-[13px] text-white/30 mt-0.5 font-medium">{rangeLabel}</div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-3 text-[11px] text-white/30 font-medium">
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-white/10" /> Open</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Working</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Posted</span>
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
            {TASKS.map((task, ti) => {
              const isFrozen = frozenTasks.includes(task.key)
              return (
              <tr key={task.key} className={`${task.freq === 'weekly' ? 'border-t border-zinc-800' : ''} ${isFrozen ? 'opacity-30' : ''}`}>
                <td className="pr-2 py-0.5">
                  <div className="flex items-center gap-2 group/row">
                    <div className="w-1 h-6 rounded-full" style={{ backgroundColor: isFrozen ? '#3f3f46' : task.color }} />
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs font-medium ${isFrozen ? 'text-zinc-600 line-through' : 'text-zinc-300'}`}>{task.label}</div>
                      {task.freq === 'weekly' && <div className="text-[9px] text-zinc-600">weekly</div>}
                    </div>
                    <button
                      onClick={() => toggleFreeze(task.key)}
                      className="opacity-0 group-hover/row:opacity-100 transition-opacity text-[10px] text-zinc-500 hover:text-white shrink-0"
                      title={isFrozen ? 'Unfreeze pipeline' : 'Freeze pipeline'}
                    >
                      {isFrozen ? '▶' : '❄'}
                    </button>
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
                  const isPosted = cell.status === 'posted'
                  const isWorking = cell.linked && !isPosted
                  const isEmpty = !cell.linked && !isPosted

                  const hasContent = isPosted || isWorking

                  return (
                    <td key={d.date} className="text-center p-0">
                      <div className="relative group/cell">
                        <button
                          onClick={() => handleClick(d.date, task, d)}
                          className={`w-full h-10 rounded-lg border transition-all text-xs font-medium ${
                            isPosted
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                              : isWorking
                              ? 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:border-amber-500/50'
                              : d.isToday
                              ? 'border-zinc-600 bg-zinc-800 text-zinc-500 hover:border-zinc-400 hover:bg-zinc-700'
                              : d.isPast
                              ? 'border-zinc-800/50 bg-zinc-900/50 text-zinc-700'
                              : 'border-zinc-800 bg-zinc-900 text-zinc-600 hover:border-zinc-600 hover:bg-zinc-800'
                          }`}
                          title={isPosted ? 'Posted — click to open' : isWorking ? `${cell.status} — click to open` : `Click to create ${task.label}`}
                        >
                          {isPosted ? '✓' : isWorking ? statusIcon(cell.status!) : ''}
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
