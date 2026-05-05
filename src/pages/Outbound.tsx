import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  getOutbound,
  updateOutbound,
  requestOutboundRedraft,
  getTriggers,
  createTrigger,
  updateTrigger,
  deleteTrigger,
  getBatchInfo,
  openNextBatch,
  closeCurrentBatch,
  getOutboundStats,
  type BatchInfo,
} from '../lib/api'
import {
  type OutboundAngle,
  type OutboundDraft,
  type OutboundDraftKind,
  type OutboundPlatform,
  type OutboundStatus,
  type OutboundThread,
  type Trigger,
  OUTBOUND_ANGLE_LABELS,
  OUTBOUND_KIND_LABELS,
} from '../lib/types'

const ANGLES: OutboundAngle[] = ['empathetic', 'technical', 'contrarian']
const ANGLE_COLORS: Record<OutboundAngle, string> = {
  empathetic: '#34d399',
  technical: '#60a5fa',
  contrarian: '#f59e0b',
}
const KIND_COLORS: Record<OutboundDraftKind, string> = {
  reply: '#34d399',
  dm: '#a78bfa',
  repost: '#f97316',
}

// Outbound shows only drafted (still-needs-action) threads. Once Pablo sends
// or skips, the thread leaves Outbound and shows up on the Sent page (or just
// disappears for skipped). No status filter pills, no "Sent 0" noise.
const PLATFORM_TABS: Array<{ value: OutboundPlatform; label: string }> = [
  { value: 'x', label: 'X' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'reddit', label: 'Reddit' },
]

const REPLY_LIMIT = 280

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return ''
  const mins = Math.round(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

function formatFollowers(n: number | null): string {
  if (n == null) return ''
  if (n < 1000) return `${n}`
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

function flash(message: string) {
  const el = document.createElement('div')
  el.textContent = message
  el.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white/[0.92] text-black text-[13px] font-medium px-4 py-2 rounded-lg shadow-xl'
  document.body.appendChild(el)
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s' }, 1400)
  setTimeout(() => { el.remove() }, 1800)
}

function draftsByKind(drafts: OutboundDraft[]) {
  const out: Record<OutboundDraftKind, OutboundDraft[]> = { reply: [], dm: [], repost: [] }
  for (const d of drafts || []) {
    const kind = (d.kind || 'reply') as OutboundDraftKind
    out[kind] = [...out[kind], d]
  }
  return out
}

function findDraft(drafts: OutboundDraft[], kind: OutboundDraftKind, angle: OutboundAngle): OutboundDraft | null {
  return drafts.find((d) => (d.kind || 'reply') === kind && d.angle === angle) || null
}

export function Outbound() {
  const [threads, setThreads] = useState<OutboundThread[]>([])
  const [platform, setPlatform] = useState<OutboundPlatform>('x')
  const [batchFilter, setBatchFilter] = useState<number | 'all'>('all')
  const [busy, setBusy] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({})
  const [selectedAngles, setSelectedAngles] = useState<Record<string, { reply: OutboundAngle, dm: OutboundAngle, repost: OutboundAngle }>>({})

  // Only fetch drafted threads; everything else shows up on the Sent page.
  const load = async () => setThreads(await getOutbound('drafted'))
  useEffect(() => { load(); const id = setInterval(load, 8000); return () => clearInterval(id) }, [])

  const platformThreads = useMemo(
    () => threads.filter((t) => (t.platform || 'x') === platform),
    [threads, platform],
  )

  // Per-platform tab counts use only the drafted population.
  const platformCounts = useMemo(() => {
    const c: Record<OutboundPlatform, number> = { x: 0, linkedin: 0, reddit: 0 }
    for (const t of threads) c[(t.platform || 'x') as OutboundPlatform] = (c[(t.platform || 'x') as OutboundPlatform] || 0) + 1
    return c
  }, [threads])

  const batchNumbers = useMemo(() => {
    const set = new Set<number>()
    for (const t of platformThreads) {
      if (typeof t.batchNumber === 'number') set.add(t.batchNumber)
    }
    return [...set].sort((a, b) => a - b)
  }, [platformThreads])

  const filtered = useMemo(() => {
    if (typeof batchFilter === 'number') return platformThreads.filter((t) => t.batchNumber === batchFilter)
    return platformThreads
  }, [platformThreads, batchFilter])

  const angleFor = (threadId: string, kind: OutboundDraftKind): OutboundAngle =>
    selectedAngles[threadId]?.[kind] || 'empathetic'

  const setAngle = (threadId: string, kind: OutboundDraftKind, angle: OutboundAngle) =>
    setSelectedAngles((prev) => {
      const current = prev[threadId] ?? { reply: 'empathetic', dm: 'empathetic', repost: 'empathetic' }
      return {
        ...prev,
        [threadId]: { ...current, [kind]: angle },
      }
    })

  const editedBody = (t: OutboundThread, draftId: string): string => {
    const local = edits[t.id]?.[draftId]
    if (local != null) return local
    const d = t.drafts.find((x) => x.id === draftId)
    return d?.editedBody ?? d?.body ?? ''
  }

  const setEditedBody = (threadId: string, draftId: string, value: string) =>
    setEdits((prev) => ({ ...prev, [threadId]: { ...(prev[threadId] || {}), [draftId]: value } }))

  const persistEdits = (t: OutboundThread): OutboundDraft[] =>
    t.drafts.map((d) => {
      const local = edits[t.id]?.[d.id]
      return local != null && local !== d.body ? { ...d, editedBody: local, charCount: local.length } : d
    })

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); flash(`Copied ${label}`) }
    catch { flash('Copy failed; long-press / select manually') }
  }

  const onMarkSent = async (t: OutboundThread, draft: OutboundDraft) => {
    setBusy(t.id)
    try {
      const drafts = persistEdits(t)
      const updated = await updateOutbound(t.id, { drafts, sentDraftId: draft.id } as any)
      setThreads((prev) => prev.map((p) => (p.id === t.id ? updated : p)))
      flash(`${OUTBOUND_KIND_LABELS[(draft.kind || 'reply') as OutboundDraftKind]} marked sent`)
    } finally { setBusy(null) }
  }

  const onSkip = async (t: OutboundThread) => {
    setBusy(t.id)
    try {
      const updated = await updateOutbound(t.id, { status: 'skipped', skipReason: null })
      setThreads((prev) => prev.map((p) => (p.id === t.id ? updated : p)))
      flash('Lead skipped')
    } catch (e) {
      flash(`Skip failed: ${(e as Error).message}`)
    } finally { setBusy(null) }
  }

  const onRedraft = async (t: OutboundThread) => {
    setBusy(t.id)
    try { await requestOutboundRedraft(t.leadId); flash('Redraft queued (~60s)') }
    catch (e) { flash(`Redraft failed: ${(e as Error).message}`) }
    finally { setBusy(null) }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Outbound <span className="font-serif italic font-normal text-white/70">Replies + DMs</span></h1>
          <p className="text-sm text-white/30 mt-1">Discovered X leads with pre-drafted reply and DM angles. Pick one, copy, send manually, mark sent. Each angle saves separately to Mars.</p>
        </div>
        <DrafterStats />
      </div>

      <BatchSection />

      <div className="glass glass-border rounded-xl p-1.5 flex items-center gap-1">
        {PLATFORM_TABS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => { setPlatform(value); setBatchFilter('all') }}
            className={`flex-1 px-4 py-2 rounded-lg text-[13px] font-medium transition-colors ${
              platform === value
                ? 'bg-white/[0.08] text-white border border-white/[0.12]'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            {label} <span className="text-white/30 ml-1.5 tabular-nums">{platformCounts[value] || 0}</span>
          </button>
        ))}
      </div>

      <div className="glass glass-border rounded-xl p-4 flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-white/35 mr-1">Batch</span>
        <FilterPill label="All" active={batchFilter === 'all'} onClick={() => setBatchFilter('all')} />
        {batchNumbers.map((n) => (
          <FilterPill key={n} label={`#${n}`} active={batchFilter === n} onClick={() => setBatchFilter(n)} />
        ))}
        <span className="text-[11px] text-white/30 ml-auto hidden md:inline">Replies → <span className="font-mono">Mars/content/replies</span> · DMs → <span className="font-mono">Mars/content/dms</span></span>
      </div>

      <TriggersSection />

      {filtered.length === 0 ? (
        <div className="glass glass-border rounded-xl p-8 text-center text-sm text-white/30">
          {threads.length === 0 ? 'No outbound threads yet. Discovery runs every 20 minutes on the openclaw VM.' : 'Nothing matches that filter.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          <AnimatePresence>
            {filtered.map((t) => {
              const byKind = draftsByKind(t.drafts)
              const replyAngle = angleFor(t.id, 'reply')
              const dmAngle = angleFor(t.id, 'dm')
              const reply = findDraft(t.drafts, 'reply', replyAngle)
              const dm = findDraft(t.drafts, 'dm', dmAngle)
              const hasReply = byKind.reply.length > 0
              const hasDm = byKind.dm.length > 0

              return (
                <motion.div
                  key={t.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="glass glass-border rounded-xl p-5 space-y-4"
                >
                  <ThreadHeader thread={t} />

                  <div className="bg-white/[0.025] rounded-lg p-4 border border-white/[0.05]">
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <div className="text-[11px] uppercase tracking-wider text-white/35 shrink-0">Original post we are reacting to</div>
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          onClick={() => { navigator.clipboard.writeText(t.originalPostUrl) }}
                          title="Copy URL"
                          className="text-[10px] text-white/45 hover:text-white/70 font-mono bg-white/[0.04] hover:bg-white/[0.08] px-2 py-1 rounded truncate max-w-[260px] cursor-pointer transition-colors"
                        >
                          {t.originalPostUrl}
                        </button>
                        <a href={t.originalPostUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-300/80 hover:text-blue-300 underline underline-offset-2 shrink-0">Open in browser →</a>
                      </div>
                    </div>
                    <div className="text-sm text-white/85 whitespace-pre-wrap leading-relaxed">{t.originalPostText}</div>
                    <div className="text-[11px] text-white/35 mt-2">
                      by <span className="text-white/60 font-medium">@{t.authorHandle}</span>
                      {t.authorFollowers != null && <span> · {formatFollowers(t.authorFollowers)} followers</span>}
                      {t.postedAt && <span> · posted {relativeTime(t.postedAt)}</span>}
                      {t.matchedTrigger && <span> · matched <span className="font-mono text-white/50">"{t.matchedTrigger}"</span></span>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {hasReply ? (
                      <DraftPanel
                        kind="reply"
                        currentAngle={replyAngle}
                        draft={reply}
                        editedBody={reply ? editedBody(t, reply.id) : ''}
                        onAngleChange={(a) => setAngle(t.id, 'reply', a)}
                        onEdit={(v) => reply && setEditedBody(t.id, reply.id, v)}
                        onCopy={() => reply && copy(editedBody(t, reply.id), `reply ${reply.angle}`)}
                        onMarkSent={() => reply && onMarkSent(t, reply)}
                        busy={busy === t.id}
                      />
                    ) : <EmptyKind label="Reply" />}

                    {hasDm && t.allowsDms !== false ? (
                      <DraftPanel
                        kind="dm"
                        currentAngle={dmAngle}
                        draft={dm}
                        editedBody={dm ? editedBody(t, dm.id) : ''}
                        onAngleChange={(a) => setAngle(t.id, 'dm', a)}
                        onEdit={(v) => dm && setEditedBody(t.id, dm.id, v)}
                        onCopy={() => dm && copy(editedBody(t, dm.id), `dm ${dm.angle}`)}
                        onMarkSent={() => dm && onMarkSent(t, dm)}
                        onVerifyDms={() => window.open(`https://x.com/messages/compose?recipient_id=${encodeURIComponent(t.authorId)}`, '_blank')}
                        onMarkDmsClosed={async () => {
                          await updateOutbound(t.id, { allowsDms: false } as any)
                          setThreads((prev) => prev.map((p) => p.id === t.id ? { ...p, allowsDms: false } : p))
                        }}
                        onMarkDmsOpen={async () => {
                          await updateOutbound(t.id, { allowsDms: true } as any)
                          setThreads((prev) => prev.map((p) => p.id === t.id ? { ...p, allowsDms: true } : p))
                        }}
                        allowsDms={t.allowsDms}
                        busy={busy === t.id}
                      />
                    ) : t.allowsDms === false ? (
                      <div className="rounded-lg p-3 border bg-white/[0.01] border-white/[0.04] text-xs text-white/40 italic flex flex-col gap-2">
                        DMs marked closed for @{t.authorHandle}.
                        <button onClick={async () => { await updateOutbound(t.id, { allowsDms: null } as any); setThreads((prev) => prev.map((p) => p.id === t.id ? { ...p, allowsDms: null } : p)) }} className="self-start text-[11px] text-white/60 underline cursor-pointer">undo</button>
                      </div>
                    ) : <EmptyKind label="DM" />}
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-white/[0.05]">
                    <button onClick={() => onSkip(t)} disabled={busy === t.id || t.status === 'skipped'} className="text-white/60 border border-white/15 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-white/[0.05] hover:text-white/85 transition-colors cursor-pointer disabled:opacity-40">Skip whole lead</button>
                    <button onClick={() => onRedraft(t)} disabled={busy === t.id} className="text-white/60 border border-white/15 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-white/[0.05] hover:text-white/85 transition-colors cursor-pointer disabled:opacity-40">Re-draft</button>
                    {t.status === 'partial_sent' && <span className="text-[11px] text-amber-300/80 ml-auto">Some drafts sent — others available</span>}
                    {t.status === 'sent' && <span className="text-[11px] text-emerald-300/80 ml-auto">All sent</span>}
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

function DraftPanel({ kind, currentAngle, draft, editedBody, onAngleChange, onEdit, onCopy, onMarkSent, onVerifyDms, onMarkDmsClosed, onMarkDmsOpen, allowsDms, busy }: {
  kind: OutboundDraftKind
  currentAngle: OutboundAngle
  draft: OutboundDraft | null
  editedBody: string
  onAngleChange: (angle: OutboundAngle) => void
  onEdit: (value: string) => void
  onCopy: () => void
  onMarkSent: () => void
  onVerifyDms?: () => void
  onMarkDmsClosed?: () => void
  onMarkDmsOpen?: () => void
  allowsDms?: boolean | null
  busy: boolean
}) {
  const color = KIND_COLORS[kind]
  const isReply = kind === 'reply'
  const limit = isReply ? REPLY_LIMIT : null
  const charCount = editedBody.length
  const overLimit = limit != null && charCount > limit
  const sentAt = draft?.sentAt
  return (
    <div className="rounded-lg p-3 border bg-white/[0.02] border-white/[0.06] flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ color, backgroundColor: color + '22', border: `1px solid ${color}33` }}>{OUTBOUND_KIND_LABELS[kind]}</span>
          {sentAt && <span className="text-[10px] text-emerald-300/80">sent</span>}
          {kind === 'dm' && allowsDms === null && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded text-amber-300/80 border border-amber-300/30 bg-amber-300/10">DMs unverified</span>
          )}
          {kind === 'dm' && allowsDms === true && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded text-emerald-300/80 border border-emerald-300/30 bg-emerald-300/10">DMs open</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {ANGLES.map((a) => {
            const active = currentAngle === a
            const ac = ANGLE_COLORS[a]
            return (
              <button key={a} onClick={() => onAngleChange(a)} className="text-[11px] font-medium px-2 py-0.5 rounded transition-colors cursor-pointer border" style={active ? { color: ac, backgroundColor: ac + '22', borderColor: ac + '55' } : { color: 'rgba(255,255,255,0.45)', borderColor: 'rgba(255,255,255,0.06)' }}>
                {OUTBOUND_ANGLE_LABELS[a]}
              </button>
            )
          })}
        </div>
      </div>

      {draft ? (
        <>
          <textarea value={editedBody} onChange={(e) => onEdit(e.target.value)} rows={isReply ? 3 : 6} className="w-full bg-transparent text-sm text-white/90 leading-relaxed outline-none resize-y font-sans border border-white/[0.05] rounded p-2" />
          <div className="flex items-center justify-between mt-2 gap-2 flex-wrap">
            <span className={`text-[11px] font-mono ${overLimit ? 'text-red-400' : 'text-white/30'}`}>{charCount}{limit ? `/${limit}` : ''}</span>
            <div className="flex gap-2 flex-wrap">
              {kind === 'dm' && onVerifyDms && (
                <button onClick={onVerifyDms} title="Open the X DM compose to check whether this person accepts DMs" className="text-[11px] font-medium px-2 py-0.5 rounded border border-amber-400/30 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20 transition-colors cursor-pointer">Open in X</button>
              )}
              {kind === 'dm' && allowsDms !== true && onMarkDmsOpen && (
                <button onClick={onMarkDmsOpen} className="text-[11px] font-medium px-2 py-0.5 rounded border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20 transition-colors cursor-pointer">DMs open</button>
              )}
              {kind === 'dm' && onMarkDmsClosed && (
                <button onClick={onMarkDmsClosed} className="text-[11px] font-medium px-2 py-0.5 rounded border border-white/20 bg-white/[0.05] text-white/70 hover:bg-white/[0.12] transition-colors cursor-pointer">DMs closed</button>
              )}
              <button onClick={onCopy} className="text-[11px] font-medium px-2 py-0.5 rounded border border-white/20 bg-white/[0.05] text-white/80 hover:bg-white/[0.12] transition-colors cursor-pointer">Copy</button>
              <button onClick={onMarkSent} disabled={busy || !!sentAt} className="text-[11px] font-medium px-2 py-0.5 rounded border border-emerald-400/40 bg-emerald-400/15 text-emerald-300 hover:bg-emerald-400/25 transition-colors cursor-pointer disabled:opacity-40">{sentAt ? 'Sent ✓' : 'Mark sent'}</button>
            </div>
          </div>
        </>
      ) : (
        <div className="text-xs text-white/30 italic py-3">No {OUTBOUND_ANGLE_LABELS[currentAngle].toLowerCase()} {OUTBOUND_KIND_LABELS[kind].toLowerCase()} draft.</div>
      )}
    </div>
  )
}

function EmptyKind({ label }: { label: string }) {
  return (
    <div className="rounded-lg p-3 border bg-white/[0.01] border-white/[0.04] text-xs text-white/30 italic">
      No {label} drafts (older lead, regenerate to add).
    </div>
  )
}

function ThreadHeader({ thread }: { thread: OutboundThread }) {
  const map: Record<OutboundStatus, { color: string }> = {
    new: { color: '#94a3b8' },
    drafted: { color: '#f59e0b' },
    picked: { color: '#a78bfa' },
    sent: { color: '#10b981' },
    partial_sent: { color: '#22d3ee' },
    skipped: { color: '#64748b' },
  }
  const { color } = map[thread.status]
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ color, backgroundColor: color + '22', border: `1px solid ${color}33` }}>{thread.status.replace('_', ' ')}</span>
      {typeof thread.batchNumber === 'number' && (
        <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded text-white/70 bg-white/[0.06] border border-white/15">batch #{thread.batchNumber}</span>
      )}
      <span className="text-[12px] text-white/55">openclaw lead</span>
      <span className="text-[11px] text-white/30">created {relativeTime(thread.createdAt)}</span>
    </div>
  )
}

function FilterPill({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) {
  const base = 'text-[12px] font-medium px-2.5 py-1 rounded-md transition-colors cursor-pointer border'
  if (active) return <button onClick={onClick} className={`${base} text-white bg-white/[0.12] border-white/30`}>{label}</button>
  return <button onClick={onClick} className={`${base} text-white/45 bg-white/[0.02] border-white/[0.06] hover:text-white/80 hover:bg-white/[0.05]`}>{label}</button>
}

// ---------- Batch section ----------

function DrafterStats() {
  const [stats, setStats] = useState<{ last_hour: number, last_24h: number, by_hour: Array<{ hour: string, n: number }> } | null>(null)
  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const s = await getOutboundStats()
        if (mounted) setStats(s)
      } catch {}
    }
    load()
    const id = setInterval(load, 30_000)
    return () => { mounted = false; clearInterval(id) }
  }, [])
  if (!stats) return null
  // Find max for sparkline scaling.
  const max = Math.max(1, ...stats.by_hour.map((b) => b.n))
  const recent = [...stats.by_hour].slice(0, 12).reverse()
  return (
    <div className="glass glass-border rounded-xl px-4 py-3 flex items-center gap-4 self-start">
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-wider text-white/35">Drafted last hour</span>
        <span className="text-2xl font-semibold tabular-nums">{stats.last_hour}</span>
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-wider text-white/35">Last 24h</span>
        <span className="text-2xl font-semibold tabular-nums">{stats.last_24h}</span>
      </div>
      <div className="flex items-end gap-0.5 h-7" title={recent.map((b) => `${b.hour.slice(11, 13)}h: ${b.n}`).join('  ')}>
        {recent.map((b, i) => (
          <div
            key={i}
            className="w-1.5 rounded-sm bg-emerald-400/70"
            style={{ height: `${Math.max(2, (b.n / max) * 28)}px` }}
          />
        ))}
      </div>
    </div>
  )
}

function BatchSection() {
  const [info, setInfo] = useState<BatchInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    try { setInfo(await getBatchInfo()); setError(null) }
    catch (e) { setError((e as Error).message) }
  }
  useEffect(() => { load(); const id = setInterval(load, 5000); return () => clearInterval(id) }, [])

  const onOpen = async () => {
    setBusy(true)
    try {
      const r = await openNextBatch()
      if (!r.ok) flash(r.reason || 'Open batch failed')
      else flash(`Batch ${r.batch?.number ?? ''} opened`)
      await load()
    } finally { setBusy(false) }
  }

  const onClose = async () => {
    setBusy(true)
    try { await closeCurrentBatch(); flash('Batch closed'); await load() }
    catch (e) { flash(`Close failed: ${(e as Error).message}`) }
    finally { setBusy(false) }
  }

  if (!info) return (
    <div className="glass glass-border rounded-xl p-4 text-[12px] text-white/40">
      {error ? <span>Drafter HTTP not reachable: <code>{error}</code></span> : 'Loading batch status…'}
    </div>
  )

  const { open, progress, todayCount, dailyCap, batchSize } = info
  const slotsLeft = Math.max(0, dailyCap - todayCount)

  return (
    <div className="glass glass-border rounded-xl p-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wider text-white/70">Current batch</div>
          <div className="text-[11px] text-white/40">
            {open
              ? <>Batch <span className="text-white/85 font-mono">#{open.number}</span> open · target {open.size_target} leads · today {todayCount}/{dailyCap}</>
              : <>No open batch. Today {todayCount}/{dailyCap} batches used. Each batch is {batchSize} leads.</>}
          </div>
        </div>
        <div className="flex gap-2">
          {open ? (
            <button onClick={onClose} disabled={busy} className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-white/15 bg-white/[0.05] text-white/85 hover:bg-white/[0.1] cursor-pointer disabled:opacity-40">Close batch</button>
          ) : (
            <button onClick={onOpen} disabled={busy || slotsLeft === 0} className="text-[12px] font-medium px-3 py-1.5 rounded-lg bg-white text-black hover:bg-zinc-200 cursor-pointer disabled:opacity-40">
              {slotsLeft === 0 ? 'Daily cap reached' : 'Open next batch'}
            </button>
          )}
        </div>
      </div>
      {open && progress && (
        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          <BatchStat label="Total" value={progress.total} color="#94a3b8" />
          <BatchStat label="Drafted" value={progress.drafted} color="#f59e0b" />
          <BatchStat label="Sent" value={progress.sent} color="#10b981" />
          <BatchStat label="Skipped" value={progress.skipped} color="#64748b" />
        </div>
      )}
    </div>
  )
}

function BatchStat({ label, value, color }: { label: string, value: number, color: string }) {
  return (
    <div className="rounded-md py-2 px-1" style={{ backgroundColor: color + '11', border: `1px solid ${color}22` }}>
      <div className="text-[10px] uppercase tracking-wider text-white/35">{label}</div>
      <div className="text-base font-semibold text-white/90">{value}</div>
    </div>
  )
}

// ---------- Triggers section ----------

function TriggersSection() {
  const [triggers, setTriggers] = useState<Trigger[]>([])
  const [phrase, setPhrase] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    try { setTriggers(await getTriggers()) } catch (e) { console.warn('triggers load failed:', e) }
  }
  useEffect(() => { load() }, [])

  const onAdd = async () => {
    const p = phrase.trim()
    if (!p) return
    setLoading(true)
    try { await createTrigger({ phrase: p }); setPhrase(''); flash('Trigger added; next discovery cycle picks it up'); await load() }
    catch (e) { flash(`Add failed: ${(e as Error).message}`) }
    finally { setLoading(false) }
  }

  const onToggle = async (t: Trigger) => {
    try { await updateTrigger(t.id, { active: !t.active }); await load() }
    catch (e) { flash(`Toggle failed: ${(e as Error).message}`) }
  }

  const onDelete = async (t: Trigger) => {
    try { await deleteTrigger(t.id); await load(); flash(`Deleted "${t.phrase}"`) }
    catch (e) { flash(`Delete failed: ${(e as Error).message}`) }
  }

  const active = triggers.filter((t) => t.active).length
  return (
    <div className="glass glass-border rounded-xl">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-4 py-2 text-left">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-white/70">Triggers</span>
          <span className="text-[11px] text-white/40">{active} active · {triggers.length} total · runs every 20 min on openclaw-vm</span>
        </div>
        <span className="text-white/40 text-sm">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div className="flex gap-2">
            <input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onAdd() }}
              placeholder='New trigger phrase, e.g. "cursor hallucinated my imports"'
              className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-white/20 text-white placeholder:text-white/20"
            />
            <button onClick={onAdd} disabled={loading || !phrase.trim()} className="bg-white text-black px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-zinc-200 transition-colors cursor-pointer disabled:opacity-40">Add</button>
          </div>
          <div className="space-y-1">
            {triggers.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 text-sm py-1 px-2 rounded hover:bg-white/[0.03]">
                <div className="flex items-center gap-2 min-w-0">
                  <button onClick={() => onToggle(t)} title={t.active ? 'Deactivate' : 'Activate'} className={`w-3 h-3 rounded-full border ${t.active ? 'bg-emerald-400 border-emerald-400' : 'bg-transparent border-white/30'} cursor-pointer`} />
                  <span className={`font-mono truncate ${t.active ? 'text-white/85' : 'text-white/35 line-through'}`}>{t.phrase}</span>
                </div>
                <button onClick={() => onDelete(t)} className="text-[11px] text-white/30 hover:text-red-400 transition-colors cursor-pointer">Delete</button>
              </div>
            ))}
            {triggers.length === 0 && <div className="text-[11px] text-white/30 italic">No triggers yet.</div>}
          </div>
        </div>
      )}
    </div>
  )
}
