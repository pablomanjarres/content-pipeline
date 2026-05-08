import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { getStats, getTemplates } from '../lib/api'
import { CATEGORY_COLORS, PLATFORM_LABELS, type OutreachTemplate } from '../lib/types'
import { DailyMedia } from '../components/DailyMedia'
import { LatestPostGroupCard } from '../components/LatestPostGroupCard'
import { PaperclipBatchButton } from '../components/PaperclipBatchButton'

interface Props {
  onOpenVideo: (id: string) => void
  onOpenPost: (id: string) => void
  onNavigate: (page: 'dashboard' | 'videos' | 'posts' | 'strategy' | 'templates' | 'ideas' | 'outbound' | 'sent' | 'shorts') => void
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
  transition: { duration: 0.5, delay, ease: [0.4, 0, 0.2, 1] as const },
})

export function Dashboard({ onOpenVideo, onOpenPost, onNavigate }: Props) {
  const [stats, setStats] = useState<any>(null)
  const [templates, setTemplates] = useState<OutreachTemplate[]>([])
  const [templateSearch, setTemplateSearch] = useState('')
  const weekKey = getWeekKey()

  useEffect(() => {
    getStats().then(setStats)
    getTemplates().then(setTemplates)
  }, [])

  if (!stats) return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="text-white/20 text-sm font-medium">Loading...</div>
    </div>
  )

  const filteredTemplates = templates.filter((t) => {
    const q = templateSearch.trim().toLowerCase()
    if (!q) return true
    return [t.name, t.platform, t.tone, t.notes, t.template].some((v) => v.toLowerCase().includes(q))
  })

  return (
    <div className="space-y-6 md:space-y-8">
      <motion.div {...fade(0)}>
        <PaperclipBatchButton />
      </motion.div>

      <motion.div {...fade(0.1)}>
        <LatestPostGroupCard onOpenPost={onOpenPost} onOpenVideo={onOpenVideo} />
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div {...fade(0.2)} className="lg:col-span-2 space-y-5">
          <div className="glass glass-border rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">Content Mix</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
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

          <div className="glass glass-border rounded-2xl p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Templates</h3>
                <div className="text-[11px] text-white/25 mt-1">{filteredTemplates.length} of {templates.length}</div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  placeholder="Search templates..."
                  className="w-full sm:w-64 bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-white/20 text-white placeholder:text-white/20"
                />
                <button
                  onClick={() => onNavigate('templates')}
                  className="shrink-0 text-[11px] text-white/30 hover:text-white/70 transition-colors font-medium"
                >
                  Manage
                </button>
              </div>
            </div>

            {filteredTemplates.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredTemplates.slice(0, 8).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onNavigate('templates')}
                    className="text-left rounded-xl bg-white/[0.02] border border-white/[0.04] p-4 hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[13px] font-semibold text-white/85 truncate">{t.name}</span>
                      <span className="text-[10px] text-white/30 bg-white/[0.05] px-1.5 py-0.5 rounded">
                        {PLATFORM_LABELS[t.platform]}
                      </span>
                      <span className="text-[10px] text-white/20 capitalize">{t.tone}</span>
                    </div>
                    <div className="text-[12px] text-white/45 line-clamp-3 font-mono leading-relaxed">
                      {t.template}
                    </div>
                    {t.notes && <div className="text-[11px] text-white/25 mt-2 truncate">{t.notes}</div>}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-[13px] text-white/25 rounded-xl bg-white/[0.02] border border-white/[0.04] p-4">
                No templates match that search.
              </div>
            )}
          </div>
        </motion.div>

        <motion.div {...fade(0.3)}>
          <DailyMedia weekKey={weekKey} />
        </motion.div>
      </div>
    </div>
  )
}
