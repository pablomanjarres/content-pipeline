import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
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

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: [0.4, 0, 0.2, 1] },
})

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
    <div className="flex items-center justify-center h-[60vh]">
      <div className="text-white/20 text-sm font-medium">Loading...</div>
    </div>
  )

  const recent = [...videos, ...posts.map(p => ({ ...p }))]
    .sort((a: any, b: any) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6)

  return (
    <div className="space-y-8">
      {/* Hero Stats */}
      <motion.div {...fade(0)} className="grid grid-cols-4 gap-4">
        {[
          { label: 'Videos', value: stats.totalVideos, gradient: 'from-blue-500/10 to-transparent', accent: '#3b82f6', page: 'pipeline' as const },
          { label: 'Posts', value: stats.totalPosts, gradient: 'from-purple-500/10 to-transparent', accent: '#8b5cf6', page: 'posts' as const },
          { label: 'Ideas', value: stats.totalIdeas, gradient: 'from-amber-500/10 to-transparent', accent: '#f59e0b', page: 'ideas' as const },
          { label: 'Clips', value: stats.totalClips, gradient: 'from-white/[0.03] to-transparent', accent: '#525252', page: null },
        ].map(s => (
          <motion.div
            key={s.label}
            whileHover={s.page ? { scale: 1.02 } : undefined}
            whileTap={s.page ? { scale: 0.98 } : undefined}
            onClick={() => s.page && onNavigate(s.page)}
            className={`glass glass-border rounded-2xl p-5 bg-gradient-to-br ${s.gradient} ${s.page ? 'cursor-pointer' : ''}`}
          >
            <div className="text-4xl font-bold tabular-nums tracking-tight" style={{ color: s.value > 0 ? s.accent : 'rgba(255,255,255,0.1)' }}>
              {s.value}
            </div>
            <div className="text-[13px] text-white/40 mt-1.5 font-medium">{s.label}</div>
          </motion.div>
        ))}
      </motion.div>

      {/* Weekly Tracker */}
      <motion.div {...fade(0.1)}>
        <WeeklyTracker onOpenVideo={onOpenVideo} onOpenPost={onOpenPost} />
      </motion.div>

      {/* Two-column: Pipelines + Media */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div {...fade(0.2)} className="lg:col-span-2 space-y-5">
          {/* Video Pipeline */}
          <div className="glass glass-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Video Pipeline</h3>
              <button onClick={() => onNavigate('pipeline')} className="text-[11px] text-white/30 hover:text-white/60 transition-colors font-medium">View all →</button>
            </div>
            <div className="flex gap-2">
              {STATUS_ORDER.map(s => {
                const count = stats.byStatus[s] || 0
                return (
                  <div key={s} className="flex-1 text-center rounded-xl bg-white/[0.02] py-3">
                    <div className="text-xl font-bold tabular-nums" style={{ color: count > 0 ? STATUS_COLORS[s] : 'rgba(255,255,255,0.08)' }}>{count}</div>
                    <div className="text-[10px] text-white/25 mt-1 font-medium">{STATUS_LABELS[s]}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Post Pipeline */}
          <div className="glass glass-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Post Pipeline</h3>
              <button onClick={() => onNavigate('posts')} className="text-[11px] text-white/30 hover:text-white/60 transition-colors font-medium">View all →</button>
            </div>
            <div className="flex gap-2">
              {POST_STATUS_ORDER.map(s => {
                const count = stats.postsByStatus[s] || 0
                return (
                  <div key={s} className="flex-1 text-center rounded-xl bg-white/[0.02] py-3">
                    <div className="text-xl font-bold tabular-nums" style={{ color: count > 0 ? POST_STATUS_COLORS[s] : 'rgba(255,255,255,0.08)' }}>{count}</div>
                    <div className="text-[10px] text-white/25 mt-1 font-medium">{POST_STATUS_LABELS[s]}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Content Mix */}
          <div className="glass glass-border rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">Content Mix</h3>
            <div className="grid grid-cols-3 gap-6">
              {(['building', 'studying', 'workout'] as const).map(cat => {
                const count = stats.byCategory[cat] || 0
                const total = stats.totalVideos || 1
                const pct = Math.round((count / total) * 100)
                const target = cat === 'building' ? 70 : cat === 'studying' ? 20 : 10
                return (
                  <div key={cat}>
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-xs font-semibold capitalize" style={{ color: CATEGORY_COLORS[cat] }}>{cat}</span>
                      <span className="text-[11px] text-white/25 tabular-nums">{pct}% <span className="text-white/15">/ {target}%</span></span>
                    </div>
                    <div className="w-full bg-white/[0.04] rounded-full h-1">
                      <div className="h-1 rounded-full transition-all duration-500" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: CATEGORY_COLORS[cat] }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Recent */}
          {recent.length > 0 && (
            <div className="glass glass-border rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">Recent Activity</h3>
              <div className="space-y-1">
                {recent.map((item: any) => {
                  const isVideo = 'script' in item
                  const status = item.status
                  const color = isVideo ? STATUS_COLORS[status] : POST_STATUS_COLORS[status]
                  const statusLabel = isVideo ? STATUS_LABELS[status] : POST_STATUS_LABELS[status]
                  return (
                    <motion.button
                      key={item.id}
                      whileHover={{ x: 4 }}
                      onClick={() => isVideo ? onOpenVideo(item.id) : onOpenPost(item.id)}
                      className="flex items-center gap-3 w-full text-left rounded-xl px-3 py-2.5 hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="w-1 h-5 rounded-full" style={{ backgroundColor: color }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] text-white/80 truncate font-medium">{item.title}</div>
                      </div>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-md" style={{ backgroundColor: color + '15', color }}>{statusLabel}</span>
                      <span className="text-[10px] text-white/20 font-medium w-10 text-right">{isVideo ? 'video' : 'post'}</span>
                    </motion.button>
                  )
                })}
              </div>
            </div>
          )}
        </motion.div>

        {/* Right: Daily Media */}
        <motion.div {...fade(0.3)}>
          <DailyMedia weekKey={weekKey} />
        </motion.div>
      </div>
    </div>
  )
}
