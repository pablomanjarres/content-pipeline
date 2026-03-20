import { useEffect, useState } from 'react'

// Schedule: what needs to be published each day
const DAILY_TASKS = [
  { key: 'ig-short', label: 'IG Reel', color: '#e1306c', freq: 'daily' },
  { key: 'tiktok-short', label: 'TikTok', color: '#00f2ea', freq: 'daily' },
  { key: 'yt-short', label: 'YT Short', color: '#ff0000', freq: 'daily' },
  { key: 'x-post', label: 'X Post', color: '#1da1f2', freq: 'daily' },
  { key: 'linkedin-post', label: 'LinkedIn', color: '#0a66c2', freq: 'daily' },
  { key: 'reddit-post', label: 'Reddit', color: '#ff4500', freq: 'daily' },
] as const

const WEEKLY_TASKS = [
  { key: 'yt-video', label: 'YT Video', color: '#ff0000' },
] as const

type DayData = Record<string, boolean>
type WeekData = Record<string, DayData>

function getWeekDates(): { weekKey: string; days: { date: string; label: string; dayName: string; isToday: boolean }[] } {
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7))

  // ISO week number
  const jan1 = new Date(monday.getFullYear(), 0, 1)
  const weekNum = Math.ceil(((monday.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
  const weekKey = `${monday.getFullYear()}-W${String(weekNum).padStart(2, '0')}`

  const days = []
  const todayStr = now.toISOString().split('T')[0]
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const dateStr = d.toISOString().split('T')[0]
    days.push({
      date: dateStr,
      label: `${d.getDate()}`,
      dayName: dayNames[i],
      isToday: dateStr === todayStr,
    })
  }

  return { weekKey, days }
}

export function WeeklyTracker() {
  const [data, setData] = useState<WeekData>({})
  const { weekKey, days } = getWeekDates()

  useEffect(() => {
    fetch(`/api/weekly/${weekKey}`).then(r => r.json()).then(setData)
  }, [weekKey])

  const toggle = async (date: string, taskKey: string) => {
    const dayData = data[date] || {}
    const updated = { ...data, [date]: { ...dayData, [taskKey]: !dayData[taskKey] } }
    setData(updated)
    await fetch(`/api/weekly/${weekKey}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    })
  }

  // Count completion
  const totalSlots = days.length * DAILY_TASKS.length + WEEKLY_TASKS.length
  let completed = 0
  for (const day of days) {
    for (const task of DAILY_TASKS) {
      if (data[day.date]?.[task.key]) completed++
    }
  }
  for (const task of WEEKLY_TASKS) {
    // Weekly tasks: check if any day has it marked
    if (days.some(d => data[d.date]?.[task.key])) completed++
  }
  const pct = totalSlots > 0 ? Math.round((completed / totalSlots) * 100) : 0

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">This Week</h2>
          <div className="text-xs text-zinc-500 mt-0.5">
            {days[0].dayName} {days[0].label} – {days[6].dayName} {days[6].label}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold" style={{ color: pct === 100 ? '#22c55e' : pct > 50 ? '#f59e0b' : '#ef4444' }}>
            {pct}%
          </div>
          <div className="text-[10px] text-zinc-600">{completed}/{totalSlots}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-zinc-800 rounded-full h-1.5 mb-4">
        <div
          className="h-1.5 rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: pct === 100 ? '#22c55e' : pct > 50 ? '#f59e0b' : '#ef4444' }}
        />
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-left text-[10px] text-zinc-600 pb-2 pr-3 w-[90px]" />
              {days.map(d => (
                <th key={d.date} className={`text-center pb-2 px-1 ${d.isToday ? 'text-white' : 'text-zinc-500'}`}>
                  <div className="text-[10px] font-medium">{d.dayName}</div>
                  <div className={`text-xs font-bold ${d.isToday ? 'bg-white text-black rounded-full w-6 h-6 flex items-center justify-center mx-auto' : ''}`}>
                    {d.label}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAILY_TASKS.map(task => (
              <tr key={task.key}>
                <td className="pr-3 py-1">
                  <span className="text-xs text-zinc-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: task.color }} />
                    {task.label}
                  </span>
                </td>
                {days.map(d => {
                  const done = data[d.date]?.[task.key]
                  return (
                    <td key={d.date} className="text-center px-1 py-1">
                      <button
                        onClick={() => toggle(d.date, task.key)}
                        className={`w-7 h-7 rounded-md border transition-all ${
                          done
                            ? 'border-transparent'
                            : d.isToday
                            ? 'border-zinc-600 hover:border-zinc-400'
                            : 'border-zinc-800 hover:border-zinc-700'
                        }`}
                        style={done ? { backgroundColor: task.color + '33', borderColor: task.color } : undefined}
                      >
                        {done && <span className="text-xs" style={{ color: task.color }}>✓</span>}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
            {/* Weekly tasks */}
            {WEEKLY_TASKS.map(task => {
              const doneOnDay = days.find(d => data[d.date]?.[task.key])
              return (
                <tr key={task.key} className="border-t border-zinc-800/50">
                  <td className="pr-3 py-1">
                    <span className="text-xs text-zinc-400 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: task.color }} />
                      {task.label}
                      <span className="text-[9px] text-zinc-600">weekly</span>
                    </span>
                  </td>
                  {days.map(d => {
                    const done = data[d.date]?.[task.key]
                    return (
                      <td key={d.date} className="text-center px-1 py-1">
                        <button
                          onClick={() => toggle(d.date, task.key)}
                          className={`w-7 h-7 rounded-md border transition-all ${
                            done
                              ? 'border-transparent'
                              : doneOnDay
                              ? 'border-zinc-800/30'
                              : d.isToday
                              ? 'border-zinc-600 hover:border-zinc-400'
                              : 'border-zinc-800 hover:border-zinc-700'
                          }`}
                          style={done ? { backgroundColor: task.color + '33', borderColor: task.color } : undefined}
                        >
                          {done && <span className="text-xs" style={{ color: task.color }}>✓</span>}
                        </button>
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
