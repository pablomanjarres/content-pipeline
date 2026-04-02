import { useState, useEffect, useCallback } from 'react'
import { getRepos, addRepo, getGenerations, createGeneration, updateGeneration, applyGeneration, createReplyRequest, getReplyHistory } from '../lib/api'
import type { Repo, Generation, ReplyRequest, TonePreset } from '../lib/types'
import { ToneSelector } from '../components/ToneSelector'
import { GenerationCard } from '../components/GenerationCard'

type DateRange = 'this-week' | 'last-7' | 'last-14' | 'custom'

function getDateRange(range: DateRange, customFrom?: string, customTo?: string): { from: string; to: string } {
  const today = new Date()
  const to = today.toISOString().split('T')[0]

  if (range === 'custom' && customFrom && customTo) return { from: customFrom, to: customTo }

  if (range === 'this-week') {
    const day = today.getDay()
    const monday = new Date(today)
    monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
    return { from: monday.toISOString().split('T')[0], to }
  }

  const days = range === 'last-14' ? 14 : 7
  const from = new Date(today)
  from.setDate(today.getDate() - days)
  return { from: from.toISOString().split('T')[0], to }
}

export function ContentEngine() {
  const [repos, setRepos] = useState<Repo[]>([])
  const [generations, setGenerations] = useState<Generation[]>([])
  const [replies, setReplies] = useState<ReplyRequest[]>([])

  // Scanner state
  const [selectedRepo, setSelectedRepo] = useState<string>('')
  const [dateRange, setDateRange] = useState<DateRange>('this-week')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [tone, setTone] = useState<TonePreset>('builder')
  const [generating, setGenerating] = useState(false)

  // Add repo
  const [showAddRepo, setShowAddRepo] = useState(false)
  const [newRepoPath, setNewRepoPath] = useState('')

  // Review state
  const [selectedGen, setSelectedGen] = useState<string | null>(null)
  const [appliedIndices, setAppliedIndices] = useState<Set<number>>(new Set())

  // Reply state
  const [replyPost, setReplyPost] = useState('')
  const [replyPlatform, setReplyPlatform] = useState<'linkedin' | 'x'>('x')
  const [replyTone, setReplyTone] = useState<TonePreset>('builder')
  const [queuingReply, setQueuingReply] = useState(false)

  const load = useCallback(async () => {
    const [r, g, h] = await Promise.all([getRepos(), getGenerations(), getReplyHistory()])
    setRepos(r)
    setGenerations(g)
    setReplies(h)
    if (r.length > 0 && !selectedRepo) setSelectedRepo(r[0].id)
  }, [selectedRepo])

  useEffect(() => { load() }, [])

  // Auto-refresh generations every 10s to catch updates from Claude Code
  useEffect(() => {
    const interval = setInterval(async () => {
      const [g, h] = await Promise.all([getGenerations(), getReplyHistory()])
      setGenerations(g)
      setReplies(h)
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  const handleAddRepo = async () => {
    if (!newRepoPath.trim()) return
    const repo = await addRepo({ name: '', path: newRepoPath.trim() })
    setNewRepoPath('')
    setShowAddRepo(false)
    setSelectedRepo(repo.id)
    load()
  }

  const handleGenerate = async () => {
    if (!selectedRepo) return
    setGenerating(true)
    try {
      const { from, to } = getDateRange(dateRange, customFrom, customTo)
      const gen = await createGeneration({ repoId: selectedRepo, tone, dateFrom: from, dateTo: to })
      setSelectedGen(gen.id)
      setAppliedIndices(new Set())
      await load()
    } finally {
      setGenerating(false)
    }
  }

  const handleApply = async (index: number) => {
    if (!selectedGen) return
    await applyGeneration(selectedGen, index)
    setAppliedIndices(prev => new Set(prev).add(index))
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const handleQueueReply = async () => {
    if (!replyPost.trim()) return
    setQueuingReply(true)
    try {
      await createReplyRequest({ originalPost: replyPost.trim(), platform: replyPlatform, tone: replyTone })
      setReplyPost('')
      await load()
    } finally {
      setQueuingReply(false)
    }
  }

  const activeGen = generations.find(g => g.id === selectedGen)

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold">Content Engine</h1>

      {/* Section 1: Repo Scanner */}
      <section className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white/80 uppercase tracking-wider">Repo Scanner</h2>
          <button
            onClick={() => setShowAddRepo(!showAddRepo)}
            className="text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            + Add Repo
          </button>
        </div>

        {showAddRepo && (
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs text-zinc-500 block mb-1">Repo Path</label>
              <input
                value={newRepoPath}
                onChange={e => setNewRepoPath(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddRepo()}
                placeholder="/path/to/your/project"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm outline-none focus:border-zinc-500"
                autoFocus
              />
            </div>
            <button onClick={handleAddRepo} className="bg-white text-black px-3 py-1.5 rounded text-sm font-medium hover:bg-zinc-200 transition-colors">
              Add
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4">
          {/* Repo select */}
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Repository</label>
            <select
              value={selectedRepo}
              onChange={e => setSelectedRepo(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm outline-none"
            >
              {repos.length === 0 && <option value="">No repos configured</option>}
              {repos.map(r => (
                <option key={r.id} value={r.id}>{r.name} — {r.path}</option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Date Range</label>
            <select
              value={dateRange}
              onChange={e => setDateRange(e.target.value as DateRange)}
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm outline-none"
            >
              <option value="this-week">This week</option>
              <option value="last-7">Last 7 days</option>
              <option value="last-14">Last 14 days</option>
              <option value="custom">Custom</option>
            </select>
          </div>
        </div>

        {dateRange === 'custom' && (
          <div className="flex gap-3">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">From</label>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm outline-none" />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">To</label>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm outline-none" />
            </div>
          </div>
        )}

        {/* Tone */}
        <div>
          <label className="text-xs text-zinc-500 block mb-2">Tone</label>
          <ToneSelector value={tone} onChange={setTone} />
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating || !selectedRepo}
          className="w-full bg-white text-black py-2 rounded-lg text-sm font-semibold hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {generating ? 'Queuing...' : 'Generate Content'}
        </button>

        {/* Recent generations */}
        {generations.length > 0 && (
          <div>
            <div className="text-xs text-zinc-500 mb-2">Recent Generations</div>
            <div className="space-y-1.5">
              {generations.slice(0, 10).map(g => (
                <button
                  key={g.id}
                  onClick={() => { setSelectedGen(g.id); setAppliedIndices(new Set()) }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                    selectedGen === g.id
                      ? 'bg-white/[0.08] border border-white/[0.1]'
                      : 'bg-zinc-800/50 border border-transparent hover:bg-zinc-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-white/80">{g.repoName}</span>
                    <StatusBadge status={g.status} />
                  </div>
                  <div className="text-[11px] text-white/30 mt-0.5">
                    {g.dateFrom} to {g.dateTo} · {g.tone} · {g.commits.length} commits
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Section 2: Content Review */}
      {activeGen && activeGen.status === 'ready' && activeGen.content.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-white/80 uppercase tracking-wider">Content Review</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeGen.content.map((c, i) => (
              <GenerationCard
                key={i}
                content={c}
                index={i}
                onApply={handleApply}
                onCopy={handleCopy}
                applied={appliedIndices.has(i)}
              />
            ))}
          </div>
        </section>
      )}

      {activeGen && activeGen.status === 'pending' && (
        <section className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8 text-center">
          <div className="text-white/40 text-sm">
            Generation queued. Run <code className="bg-zinc-800 px-2 py-0.5 rounded text-amber-400">/content-pipeline</code> in Claude Code to process.
          </div>
          <div className="text-white/20 text-xs mt-2">{activeGen.commits.length} commits ready for processing</div>
        </section>
      )}

      {activeGen && activeGen.status === 'processing' && (
        <section className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8 text-center">
          <div className="text-white/50 text-sm">Processing... content will appear here when ready.</div>
        </section>
      )}

      {/* Section 3: Reply Generator */}
      <section className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white/80 uppercase tracking-wider">Reply Generator</h2>

        <div>
          <label className="text-xs text-zinc-500 block mb-1">Paste post or comment</label>
          <textarea
            value={replyPost}
            onChange={e => setReplyPost(e.target.value)}
            placeholder="Paste the post you want to reply to..."
            rows={4}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-500 resize-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 items-end">
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Platform</label>
            <select
              value={replyPlatform}
              onChange={e => setReplyPlatform(e.target.value as 'linkedin' | 'x')}
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm outline-none"
            >
              <option value="x">X (Twitter)</option>
              <option value="linkedin">LinkedIn</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-2">Tone</label>
            <ToneSelector value={replyTone} onChange={setReplyTone} />
          </div>
        </div>

        <button
          onClick={handleQueueReply}
          disabled={queuingReply || !replyPost.trim()}
          className="w-full bg-white/[0.06] text-white/80 py-2 rounded-lg text-sm font-medium hover:bg-white/[0.1] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {queuingReply ? 'Queuing...' : 'Queue Replies'}
        </button>

        {/* Reply history */}
        {replies.length > 0 && (
          <div className="space-y-3 mt-2">
            {replies.slice(0, 5).map(r => (
              <ReplyCard key={r.id} request={r} onCopy={handleCopy} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    pending: { bg: 'rgba(245,158,11,0.1)', text: '#f59e0b' },
    processing: { bg: 'rgba(59,130,246,0.1)', text: '#3b82f6' },
    ready: { bg: 'rgba(16,185,129,0.1)', text: '#10b981' },
    applied: { bg: 'rgba(139,92,246,0.1)', text: '#8b5cf6' },
    discarded: { bg: 'rgba(255,255,255,0.04)', text: 'rgba(255,255,255,0.3)' },
  }
  const c = colors[status] || colors.pending
  return (
    <span className="text-[11px] px-2 py-0.5 rounded" style={{ background: c.bg, color: c.text }}>
      {status}
    </span>
  )
}

function ReplyCard({ request, onCopy }: { request: ReplyRequest; onCopy: (text: string) => void }) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  const handleCopy = (text: string, idx: number) => {
    onCopy(text)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  return (
    <div className="bg-zinc-800/50 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-xs text-white/40 truncate max-w-[70%]">{request.originalPost.slice(0, 80)}...</span>
        <StatusBadge status={request.status} />
      </div>
      {request.status === 'ready' && request.replies.length > 0 ? (
        <div className="divide-y divide-zinc-800">
          {request.replies.map((r, i) => (
            <div key={i} className="px-3 py-2 flex items-start justify-between gap-3 group hover:bg-white/[0.02]">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-white/30 uppercase tracking-wider mb-0.5">{r.mode}</div>
                <p className="text-sm text-white/70">{r.text}</p>
              </div>
              <button
                onClick={() => handleCopy(r.text, i)}
                className="text-[11px] px-2 py-1 rounded bg-white/[0.04] text-white/30 hover:text-white/60 hover:bg-white/[0.08] transition-colors shrink-0 opacity-0 group-hover:opacity-100"
              >
                {copiedIdx === i ? 'Copied!' : 'Copy'}
              </button>
            </div>
          ))}
        </div>
      ) : request.status === 'pending' ? (
        <div className="px-3 py-3 text-xs text-white/30 text-center">
          Queued — run <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-amber-400/70">/content-pipeline</code> to generate
        </div>
      ) : null}
    </div>
  )
}
