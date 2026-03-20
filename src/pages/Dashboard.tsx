import { useEffect, useState } from 'react'
import { getStats, getVideos } from '../lib/api'
import { STATUS_COLORS, STATUS_LABELS, STATUS_ORDER, CATEGORY_COLORS, type Video } from '../lib/types'

interface Props {
  onOpenVideo: (id: string) => void
  onNavigate: (page: 'dashboard' | 'pipeline' | 'ideas' | 'strategy') => void
}

export function Dashboard({ onOpenVideo, onNavigate }: Props) {
  const [stats, setStats] = useState<any>(null)
  const [recent, setRecent] = useState<Video[]>([])

  useEffect(() => {
    getStats().then(setStats)
    getVideos().then(v => setRecent(v.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8)))
  }, [])

  if (!stats) return <div className="text-zinc-500">Loading...</div>

  return (
    <div className="space-y-8">
      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Videos" value={stats.totalVideos} onClick={() => onNavigate('pipeline')} />
        <StatCard label="Ideas" value={stats.totalIdeas} onClick={() => onNavigate('ideas')} />
        <StatCard label="Clips" value={stats.totalClips} />
      </div>

      {/* Pipeline Overview */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Pipeline</h2>
        <div className="flex gap-2">
          {STATUS_ORDER.map(s => (
            <div
              key={s}
              className="flex-1 rounded-lg bg-zinc-900 border border-zinc-800 p-3 text-center cursor-pointer hover:border-zinc-600 transition-colors"
              onClick={() => onNavigate('pipeline')}
            >
              <div className="text-2xl font-bold" style={{ color: STATUS_COLORS[s] }}>
                {stats.byStatus[s] || 0}
              </div>
              <div className="text-xs text-zinc-500 mt-1">{STATUS_LABELS[s]}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Category Breakdown */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Categories</h2>
        <div className="flex gap-3">
          {(['building', 'studying', 'workout'] as const).map(cat => (
            <div key={cat} className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
              <span className="text-sm capitalize">{cat}</span>
              <span className="text-zinc-500 text-sm ml-1">{stats.byCategory[cat] || 0}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Recent Activity */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Recent</h2>
        {recent.length === 0 ? (
          <p className="text-zinc-500 text-sm">No videos yet. Create one from the Pipeline tab.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recent.map(v => (
              <button
                key={v.id}
                onClick={() => onOpenVideo(v.id)}
                className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3 hover:border-zinc-600 transition-colors text-left w-full"
              >
                <div className="w-2 h-8 rounded-full" style={{ backgroundColor: STATUS_COLORS[v.status] }} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{v.title}</div>
                  <div className="text-xs text-zinc-500 flex gap-2 mt-0.5">
                    <span style={{ color: STATUS_COLORS[v.status] }}>{STATUS_LABELS[v.status]}</span>
                    <span className="capitalize">{v.category}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function StatCard({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`bg-zinc-900 border border-zinc-800 rounded-lg p-4 ${onClick ? 'cursor-pointer hover:border-zinc-600' : ''} transition-colors`}
    >
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-sm text-zinc-500 mt-1">{label}</div>
    </div>
  )
}
