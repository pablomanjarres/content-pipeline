import { useEffect, useState, useRef } from 'react'

interface MediaFile {
  filename: string
  path: string
  size: number
}

interface Props {
  weekKey: string
}

function getWeekDays(weekKey: string) {
  // Parse weekKey like "2026-W12" to get Monday
  const [yearStr, wStr] = weekKey.split('-W')
  const year = parseInt(yearStr)
  const week = parseInt(wStr)

  // ISO week to date
  const jan1 = new Date(year, 0, 1)
  const dayOffset = (jan1.getDay() + 6) % 7
  const monday = new Date(year, 0, 1 + (week - 1) * 7 - dayOffset)

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const todayStr = new Date().toISOString().split('T')[0]

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const dateStr = d.toISOString().split('T')[0]
    return { date: dateStr, dayName: dayNames[i], num: d.getDate(), isToday: dateStr === todayStr }
  })
}

export function DailyMedia({ weekKey }: Props) {
  const [mediaByDay, setMediaByDay] = useState<Record<string, MediaFile[]>>({})
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ path: string; name: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const days = getWeekDays(weekKey)

  // Auto-expand today
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    setExpandedDay(today)
  }, [])

  useEffect(() => {
    fetch(`/api/media/week/${weekKey}`).then(r => r.json()).then(setMediaByDay)
  }, [weekKey])

  const handleUpload = async (date: string, files: FileList) => {
    setUploading(true)
    try {
      const form = new FormData()
      for (const f of files) form.append('files', f)
      const res = await fetch(`/api/media/upload/${weekKey}/${date}`, { method: 'POST', body: form })
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
      const updated = await fetch(`/api/media/week/${weekKey}`).then(r => r.json())
      setMediaByDay(updated)
    } catch (err) {
      console.error('Upload error:', err)
    } finally {
      setUploading(false)
    }
  }

  const handleRename = async (oldPath: string, newName: string) => {
    await fetch('/api/media/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath, newName }),
    })
    setRenaming(null)
    const updated = await fetch(`/api/media/week/${weekKey}`).then(r => r.json())
    setMediaByDay(updated)
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const totalFiles = Object.values(mediaByDay).reduce((sum, files) => sum + files.length, 0)

  return (
    <div className="glass glass-border rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Daily <span className="font-serif italic font-normal text-white/70">Media</span></h2>
          <div className="text-[11px] text-white/30 mt-0.5 font-medium">Timelapses, b-roll, raw clips</div>
        </div>
        <div className="text-[11px] text-white/20 font-medium">{totalFiles} files</div>
      </div>

      <div className="space-y-1">
        {days.map(day => {
          const files = mediaByDay[`uploads-${day.date}`] || []
          const isExpanded = expandedDay === day.date

          return (
            <div key={day.date} className={`rounded-lg border transition-colors ${
              day.isToday ? 'border-zinc-700 bg-zinc-800/50' : 'border-zinc-800/50 bg-zinc-900/30'
            }`}>
              {/* Day header */}
              <button
                onClick={() => setExpandedDay(isExpanded ? null : day.date)}
                className="w-full flex items-center gap-3 px-3 py-2 text-left"
              >
                <span className={`text-xs font-medium w-8 ${day.isToday ? 'text-white' : 'text-zinc-500'}`}>{day.dayName}</span>
                <span className={`text-xs ${day.isToday ? 'text-zinc-300' : 'text-zinc-600'}`}>{day.date}</span>
                <span className="text-[10px] text-zinc-600 ml-auto">{files.length > 0 ? `${files.length} files` : ''}</span>
                <span className="text-zinc-600 text-xs">{isExpanded ? '▾' : '▸'}</span>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-3 pb-3 space-y-2">
                  {/* Files */}
                  {files.map(f => (
                    <div key={f.path} className="flex items-center gap-2 bg-zinc-800/50 rounded px-2.5 py-1.5 group">
                      <span className="text-[10px] text-zinc-600">🎬</span>
                      {renaming?.path === f.path ? (
                        <input
                          value={renaming.name}
                          onChange={e => setRenaming({ ...renaming, name: e.target.value })}
                          onBlur={() => handleRename(f.path, renaming.name)}
                          onKeyDown={e => { if (e.key === 'Enter') handleRename(f.path, renaming.name); if (e.key === 'Escape') setRenaming(null) }}
                          className="flex-1 bg-zinc-700 rounded px-1.5 py-0.5 text-xs outline-none text-white"
                          autoFocus
                        />
                      ) : (
                        <span className="text-xs text-zinc-300 flex-1 truncate">{f.filename}</span>
                      )}
                      <span className="text-[10px] text-zinc-600">{formatSize(f.size)}</span>
                      <button
                        onClick={() => setRenaming({ path: f.path, name: f.filename })}
                        className="text-[10px] text-zinc-600 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        rename
                      </button>
                    </div>
                  ))}

                  {/* Upload */}
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    accept="video/*,image/*"
                    className="hidden"
                    onChange={e => { if (e.target.files?.length) handleUpload(day.date, e.target.files) }}
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="w-full border border-dashed border-zinc-700 rounded-lg py-3 text-xs text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {uploading ? 'Uploading...' : '+ Drop or click to upload'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
