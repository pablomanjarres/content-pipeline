import { useEffect, useMemo, useState } from 'react'
import {
  getWatchlistHandles,
  createWatchlistHandle,
  updateWatchlistHandle,
  deleteWatchlistHandle,
  getWatchlistStats,
  type WatchlistHandle,
  type WatchlistTier,
  type WatchlistStats,
} from '../lib/api'

const TIERS: WatchlistTier[] = ['T1', 'T2', 'T3']
const TIER_LABEL: Record<WatchlistTier, string> = {
  T1: 'Tier 1 — direct ICP',
  T2: 'Tier 2 — adjacent',
  T3: 'Tier 3 — broader tech',
}
const TIER_COLOR: Record<WatchlistTier, string> = {
  T1: '#34d399',
  T2: '#60a5fa',
  T3: '#9ca3af',
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'never'
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

function flash(msg: string) {
  const el = document.createElement('div')
  el.textContent = msg
  el.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white/[0.92] text-black text-[13px] font-medium px-4 py-2 rounded-lg shadow-xl'
  document.body.appendChild(el)
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s' }, 1400)
  setTimeout(() => { el.remove() }, 1800)
}

interface NewHandleDraft {
  name: string
  x_handle: string
  linkedin_url: string
  tier: WatchlistTier
  notes: string
}

const EMPTY_DRAFT: NewHandleDraft = { name: '', x_handle: '', linkedin_url: '', tier: 'T1', notes: '' }

export function Watchlist() {
  const [handles, setHandles] = useState<WatchlistHandle[]>([])
  const [stats, setStats] = useState<WatchlistStats | null>(null)
  const [filterTier, setFilterTier] = useState<WatchlistTier | 'all'>('all')
  const [filterEnabled, setFilterEnabled] = useState<'all' | 'enabled' | 'disabled'>('all')
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<NewHandleDraft>(EMPTY_DRAFT)
  const [busy, setBusy] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [edits, setEdits] = useState<Partial<WatchlistHandle>>({})

  const load = async () => {
    try {
      const [h, s] = await Promise.all([getWatchlistHandles(), getWatchlistStats()])
      setHandles(h)
      setStats(s)
    } catch (e) {
      flash(`load failed: ${(e as Error).message}`)
    }
  }
  useEffect(() => { load(); const id = setInterval(load, 30000); return () => clearInterval(id) }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return handles.filter((h) => {
      if (filterTier !== 'all' && h.tier !== filterTier) return false
      if (filterEnabled === 'enabled' && !h.enabled) return false
      if (filterEnabled === 'disabled' && h.enabled) return false
      if (q) {
        const blob = `${h.name} ${h.x_handle ?? ''} ${h.linkedin_url ?? ''} ${h.notes ?? ''}`.toLowerCase()
        if (!blob.includes(q)) return false
      }
      return true
    })
  }, [handles, filterTier, filterEnabled, search])

  const onCreate = async () => {
    if (!draft.name.trim()) { flash('name required'); return }
    if (!draft.x_handle.trim() && !draft.linkedin_url.trim()) {
      flash('need x_handle or linkedin_url'); return
    }
    setBusy('create')
    try {
      await createWatchlistHandle({
        name: draft.name.trim(),
        x_handle: draft.x_handle.trim() || null,
        linkedin_url: draft.linkedin_url.trim() || null,
        tier: draft.tier,
        notes: draft.notes.trim() || null,
        enabled: true,
      })
      setDraft(EMPTY_DRAFT)
      await load()
      flash('added')
    } catch (e) {
      flash((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const onToggleEnabled = async (h: WatchlistHandle) => {
    setBusy(h.id)
    try {
      await updateWatchlistHandle(h.id, { enabled: !h.enabled })
      await load()
    } catch (e) {
      flash((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const startEdit = (h: WatchlistHandle) => {
    setEditingId(h.id)
    setEdits({
      name: h.name,
      x_handle: h.x_handle ?? '',
      linkedin_url: h.linkedin_url ?? '',
      tier: h.tier,
      notes: h.notes ?? '',
    })
  }

  const commitEdit = async () => {
    if (!editingId) return
    setBusy(editingId)
    try {
      await updateWatchlistHandle(editingId, {
        name: (edits.name as string)?.trim(),
        x_handle: ((edits.x_handle as string) ?? '').trim() || null,
        linkedin_url: ((edits.linkedin_url as string) ?? '').trim() || null,
        tier: edits.tier as WatchlistTier,
        notes: ((edits.notes as string) ?? '').trim() || null,
      })
      setEditingId(null)
      setEdits({})
      await load()
      flash('saved')
    } catch (e) {
      flash((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const onDelete = async (h: WatchlistHandle) => {
    if (!confirm(`Delete ${h.name}?`)) return
    setBusy(h.id)
    try {
      await deleteWatchlistHandle(h.id)
      await load()
      flash('deleted')
    } catch (e) {
      flash((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-2xl font-semibold text-white">Watchlist</h1>
        <p className="text-xs text-white/40">{handles.length} handles · radar polls per-tier on cadence</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {TIERS.map((t) => {
          const s = stats?.[t]
          return (
            <div key={t} className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: TIER_COLOR[t] }} />
                <div className="text-xs text-white/60 uppercase tracking-wide">{TIER_LABEL[t]}</div>
              </div>
              <div className="text-2xl font-semibold text-white mt-2">
                {s?.enabled ?? 0}<span className="text-white/40 text-base"> / {s?.total ?? 0}</span>
              </div>
              <div className="text-[11px] text-white/40 mt-1">
                X polled {relativeTime(s?.mostRecentXPoll ?? null)} · LI {relativeTime(s?.mostRecentLiPoll ?? null)}
              </div>
            </div>
          )
        })}
      </div>

      {/* Add form */}
      <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-4 mb-6">
        <div className="text-xs text-white/60 mb-2 uppercase tracking-wide">Add handle</div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
          <input
            className="md:col-span-3 bg-black/20 border border-white/[0.08] rounded px-3 py-2 text-sm text-white placeholder-white/30"
            placeholder="Name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <input
            className="md:col-span-2 bg-black/20 border border-white/[0.08] rounded px-3 py-2 text-sm text-white placeholder-white/30"
            placeholder="x_handle (no @)"
            value={draft.x_handle}
            onChange={(e) => setDraft({ ...draft, x_handle: e.target.value })}
          />
          <input
            className="md:col-span-3 bg-black/20 border border-white/[0.08] rounded px-3 py-2 text-sm text-white placeholder-white/30"
            placeholder="linkedin.com/in/..."
            value={draft.linkedin_url}
            onChange={(e) => setDraft({ ...draft, linkedin_url: e.target.value })}
          />
          <select
            className="md:col-span-1 bg-black/20 border border-white/[0.08] rounded px-2 py-2 text-sm text-white"
            value={draft.tier}
            onChange={(e) => setDraft({ ...draft, tier: e.target.value as WatchlistTier })}
          >
            {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            className="md:col-span-2 bg-black/20 border border-white/[0.08] rounded px-3 py-2 text-sm text-white placeholder-white/30"
            placeholder="notes"
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
          <button
            className="md:col-span-1 bg-white/[0.10] hover:bg-white/[0.16] disabled:opacity-50 rounded px-3 py-2 text-sm text-white"
            onClick={onCreate}
            disabled={busy === 'create'}
          >
            {busy === 'create' ? '...' : 'Add'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex gap-1 bg-white/[0.03] border border-white/[0.06] rounded p-1">
          {(['all', ...TIERS] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilterTier(t as WatchlistTier | 'all')}
              className={`px-3 py-1 text-xs rounded ${filterTier === t ? 'bg-white/[0.10] text-white' : 'text-white/50 hover:text-white/80'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-white/[0.03] border border-white/[0.06] rounded p-1">
          {(['all', 'enabled', 'disabled'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterEnabled(s)}
              className={`px-3 py-1 text-xs rounded ${filterEnabled === s ? 'bg-white/[0.10] text-white' : 'text-white/50 hover:text-white/80'}`}
            >
              {s}
            </button>
          ))}
        </div>
        <input
          className="flex-1 min-w-[200px] bg-black/20 border border-white/[0.08] rounded px-3 py-1 text-sm text-white placeholder-white/30"
          placeholder="search name / handle / notes"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/[0.06] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.04] text-white/50">
            <tr>
              <th className="text-left px-3 py-2 font-medium w-[24%]">Name</th>
              <th className="text-left px-3 py-2 font-medium w-[14%]">X</th>
              <th className="text-left px-3 py-2 font-medium w-[20%]">LinkedIn</th>
              <th className="text-left px-3 py-2 font-medium w-[8%]">Tier</th>
              <th className="text-left px-3 py-2 font-medium">Notes</th>
              <th className="text-right px-3 py-2 font-medium w-[15%]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((h) => {
              const editing = editingId === h.id
              return (
                <tr key={h.id} className={`border-t border-white/[0.04] ${h.enabled ? '' : 'opacity-40'}`}>
                  <td className="px-3 py-2 text-white">
                    {editing ? (
                      <input
                        className="bg-black/20 border border-white/[0.08] rounded px-2 py-1 text-sm text-white w-full"
                        value={(edits.name as string) ?? ''}
                        onChange={(e) => setEdits({ ...edits, name: e.target.value })}
                      />
                    ) : h.name}
                  </td>
                  <td className="px-3 py-2 text-white/70">
                    {editing ? (
                      <input
                        className="bg-black/20 border border-white/[0.08] rounded px-2 py-1 text-sm text-white w-full"
                        value={(edits.x_handle as string) ?? ''}
                        onChange={(e) => setEdits({ ...edits, x_handle: e.target.value })}
                      />
                    ) : (
                      h.x_handle ? (
                        <a href={`https://x.com/${h.x_handle}`} target="_blank" rel="noreferrer" className="text-blue-300 hover:text-blue-200">
                          @{h.x_handle}
                        </a>
                      ) : <span className="text-white/30">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-white/70 truncate">
                    {editing ? (
                      <input
                        className="bg-black/20 border border-white/[0.08] rounded px-2 py-1 text-sm text-white w-full"
                        value={(edits.linkedin_url as string) ?? ''}
                        onChange={(e) => setEdits({ ...edits, linkedin_url: e.target.value })}
                      />
                    ) : (
                      h.linkedin_url ? (
                        <a href={h.linkedin_url} target="_blank" rel="noreferrer" className="text-blue-300 hover:text-blue-200 text-xs">
                          {h.linkedin_url.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, '/in/')}
                        </a>
                      ) : <span className="text-white/30">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editing ? (
                      <select
                        className="bg-black/20 border border-white/[0.08] rounded px-2 py-1 text-sm text-white"
                        value={(edits.tier as WatchlistTier) ?? h.tier}
                        onChange={(e) => setEdits({ ...edits, tier: e.target.value as WatchlistTier })}
                      >
                        {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: `${TIER_COLOR[h.tier]}22`, color: TIER_COLOR[h.tier] }}>
                        {h.tier}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-white/60 text-xs">
                    {editing ? (
                      <input
                        className="bg-black/20 border border-white/[0.08] rounded px-2 py-1 text-sm text-white w-full"
                        value={(edits.notes as string) ?? ''}
                        onChange={(e) => setEdits({ ...edits, notes: e.target.value })}
                      />
                    ) : (h.notes ?? <span className="text-white/30">—</span>)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      {editing ? (
                        <>
                          <button
                            className="px-2 py-1 text-xs text-emerald-300 hover:text-emerald-200"
                            onClick={commitEdit}
                            disabled={busy === h.id}
                          >save</button>
                          <button
                            className="px-2 py-1 text-xs text-white/50 hover:text-white/80"
                            onClick={() => { setEditingId(null); setEdits({}) }}
                          >cancel</button>
                        </>
                      ) : (
                        <>
                          <button
                            className="px-2 py-1 text-xs text-white/60 hover:text-white"
                            onClick={() => onToggleEnabled(h)}
                            disabled={busy === h.id}
                            title={h.enabled ? 'disable polling' : 'enable polling'}
                          >{h.enabled ? 'on' : 'off'}</button>
                          <button
                            className="px-2 py-1 text-xs text-white/60 hover:text-white"
                            onClick={() => startEdit(h)}
                          >edit</button>
                          <button
                            className="px-2 py-1 text-xs text-red-300/70 hover:text-red-300"
                            onClick={() => onDelete(h)}
                            disabled={busy === h.id}
                          >del</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-white/40 text-sm">
                  no handles match. add one above or relax the filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
