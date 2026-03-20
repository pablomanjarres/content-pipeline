import { useEffect, useState } from 'react'
import { getStats, getVideos, getPosts } from '../lib/api'
import { STATUS_COLORS, STATUS_LABELS, STATUS_ORDER, CATEGORY_COLORS, POST_STATUS_ORDER, POST_STATUS_LABELS, POST_STATUS_COLORS, type Video, type Post } from '../lib/types'
import { WeeklyTracker } from '../components/WeeklyTracker'
import { DailyMedia } from '../components/DailyMedia'

interface Props {
  onOpenVideo: (id: string) => void
  onOpenPost: (id: string) => void
  onNavigate: (page: 'dashboard' | 'pipeline' | 'ideas' | 'posts' | 'strategy') => void
}

function getWeekKey() {
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7))
  const jan1 = new Date(monday.getFullYear(), 0, 1)
  const weekNum = Math.ceil(((monday.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
  return `${monday.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

export function Dashboard({ onOpenVideo, onOpenPost, onNavigate }: Props) {
  const [stats, setStats] = useState<any>(null)
  const [videos, setVideos] = useState<Video[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const weekKey = getWeekKey()

  useEffect(() => {
    getStats().then(setStats)
    getVideos().then(setVideos)
    getPosts().then(setPosts)
  }, [])

  if (!stats) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-zinc-600 text-sm">Loading dashboard...</div>
    </div>
  )

  const recent = [...videos, ...posts.map(p => ({ ...p, updatedAt: p.updatedAt }))]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6)

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Videos', value: stats.totalVideos, color: '#3b82f6', page: 'pipeline' as const },
          { label: 'Posts', value: stats.totalPosts, color: '#8b5cf6', page: 'posts' as const },
          { label: 'Ideas', value: stats.totalIdeas, color: '#f59e0b', page: 'ideas' as const },
          { label: 'Clips', value: stats.totalClips, color: '#6b7280', page: null },
        ].map(s => (
          <div
            key={s.label}
            onClick={() => s.page && onNavigate(s.page)}
            className={`rounded-xl bg-zinc-900 border border-zinc-800 p-4 ${s.page ? 'cursor-pointer hover:border-zinc-600' : ''} transition-colors`}
          >
            <div className="text-3xl font-bold tabular-nums" style={{ color: s.value > 0 ? s.color : '#3f3f46' }}>{s.value}</div>
            <div className="text-xs text-zinc-500 mt-1 font-medium">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Weekly Tracker — the main event */}
      <WeeklyTracker onOpenVideo={onOpenVideo} onOpenPost={onOpenPost} />

      {/* Two-column: Pipelines + Media */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Pipelines */}
        <div className="lg:col-span-2 space-y-4">
          {/* Video Pipeline */}
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-zinc-300">Video Pipeline</h3>
              <button onClick={() => onNavigate('pipeline')} className="text-[10px] text-zinc-500 hover:text-zinc-300">View all →</button>
            </div>
            <div className="flex gap-1.5">
              {STATUS_ORDER.map(s => {
                const count = stats.byStatus[s] || 0
                return (
                  <div key={s} className="flex-1 text-center">
                    <div className="text-lg font-bold tabular-nums" style={{ color: count > 0 ? STATUS_COLORS[s] : '#3f3f46' }}>{count}</div>
                    <div className="text-[10px] text-zinc-600 mt-0.5">{STATUS_LABELS[s]}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Post Pipeline */}
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-zinc-300">Post Pipeline</h3>
              <button onClick={() => onNavigate('posts')} className="text-[10px] text-zinc-500 hover:text-zinc-300">View all →</button>
            </div>
            <div className="flex gap-1.5">
              {POST_STATUS_ORDER.map(s => {
                const count = stats.postsByStatus[s] || 0
                return (
                  <div key={s} className="flex-1 text-center">
                    <div className="text-lg font-bold tabular-nums" style={{ color: count > 0 ? POST_STATUS_COLORS[s] : '#3f3f46' }}>{count}</div>
                    <div className="text-[10px] text-zinc-600 mt-0.5">{POST_STATUS_LABELS[s]}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Categories */}
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
            <h3 className="text-sm font-semibold text-zinc-300 mb-3">Content Mix</h3>
            <div className="flex gap-4">
              {(['building', 'studying', 'workout'] as const).map(cat => {
                const count = stats.byCategory[cat] || 0
                const total = stats.totalVideos || 1
                const pct = Math.round((count / total) * 100)
                const target = cat === 'building' ? 70 : cat === 'studying' ? 20 : 10
                return (
                  <div key={cat} className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium capitalize" style={{ color: CATEGORY_COLORS[cat] }}>{cat}</span>
                      <span className="text-[10px] text-zinc-600">{pct}% <span className="text-zinc-700">/ {target}%</span></span>
                    </div>
                    <div className="w-full bg-zinc-800 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: CATEGORY_COLORS[cat] }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Recent */}
          {recent.length > 0 && (
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">Recent Activity</h3>
              <div className="space-y-1.5">
                {recent.map((item: any) => {
                  const isVideo = 'script' in item
                  const status = item.status
                  const color = isVideo ? STATUS_COLORS[status] : POST_STATUS_COLORS[status]
                  return (
                    <button
                      key={item.id}
                      onClick={() => isVideo ? onOpenVideo(item.id) : onOpenPost(item.id)}
                      className="flex items-center gap-3 w-full text-left rounded-lg px-3 py-2 hover:bg-zinc-800/50 transition-colors"
                    >
                      <div className="w-1.5 h-6 rounded-full" style={{ backgroundColor: color }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-zinc-300 truncate">{item.title}</div>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: color + '22', color }}>
                        {isVideo ? STATUS_LABELS[status] : POST_STATUS_LABELS[status]}
                      </span>
                      <span className="text-[10px] text-zinc-700 capitalize">{isVideo ? 'video' : 'post'}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: Daily Media */}
        <div>
          <DailyMedia weekKey={weekKey} />
        </div>
      </div>
    </div>
  )
}
