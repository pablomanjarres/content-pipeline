import { useEffect, useMemo, useState } from 'react'
import { getSent, type SentItem } from '../lib/api'

const PLATFORM_FILTERS: Array<{ value: 'all' | 'x' | 'linkedin' | 'reddit'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'x', label: 'X' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'reddit', label: 'Reddit' },
]

const KIND_LABELS: Record<SentItem['kind'], string> = {
  reply: 'Reply',
  dm: 'DM',
  repost: 'Repost',
}

const PLATFORM_LABELS: Record<SentItem['platform'], string> = {
  x: 'X',
  linkedin: 'LinkedIn',
  reddit: 'Reddit',
}

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

export function Sent() {
  const [items, setItems] = useState<SentItem[]>([])
  const [platform, setPlatform] = useState<'all' | 'x' | 'linkedin' | 'reddit'>('all')
  const [kindFilter, setKindFilter] = useState<'all' | 'reply' | 'dm'>('all')
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    try {
      setItems(await getSent())
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    let list = items
    if (platform !== 'all') list = list.filter((it) => it.platform === platform)
    if (kindFilter !== 'all') list = list.filter((it) => it.kind === kindFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((it) =>
        (it.authorHandle || '').toLowerCase().includes(q)
        || (it.message || '').toLowerCase().includes(q)
        || (it.contextText || '').toLowerCase().includes(q))
    }
    return list
  }, [items, platform, kindFilter, search])

  const counts = useMemo(() => {
    const platforms: Record<string, number> = { all: items.length, x: 0, linkedin: 0, reddit: 0 }
    const kinds: Record<string, number> = { all: items.length, reply: 0, dm: 0 }
    for (const it of items) {
      platforms[it.platform] = (platforms[it.platform] || 0) + 1
      if (it.kind === 'reply' || it.kind === 'dm') {
        kinds[it.kind] = (kinds[it.kind] || 0) + 1
      }
    }
    return { platforms, kinds }
  }, [items])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sent <span className="font-serif italic font-normal text-white/70">Replies + DMs</span></h1>
        <p className="text-sm text-white/30 mt-1">Each row is one send. Includes drafter-managed sends (per-draft sentAt) and manually-logged sends. Newest first.</p>
      </div>

      <div className="glass glass-border rounded-xl p-4 flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-white/35 mr-1">Source</span>
        {PLATFORM_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setPlatform(value)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
              platform === value ? 'bg-white/[0.08] text-white border border-white/[0.12]' : 'text-white/40 hover:text-white/70'
            }`}
          >
            {label} <span className="text-white/30 ml-1">{counts.platforms[value] ?? 0}</span>
          </button>
        ))}
        <span className="text-[10px] uppercase tracking-wider text-white/35 mx-2">Kind</span>
        {(['all', 'reply', 'dm'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKindFilter(k)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
              kindFilter === k ? 'bg-white/[0.08] text-white border border-white/[0.12]' : 'text-white/40 hover:text-white/70'
            }`}
          >
            {k === 'all' ? 'All' : k.toUpperCase()} <span className="text-white/30 ml-1">{counts.kinds[k] ?? 0}</span>
          </button>
        ))}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search handle, message, original post..."
          className="ml-auto px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[12px] text-white placeholder-white/30 focus:outline-none focus:border-white/[0.16] w-full md:w-72"
        />
      </div>

      {error && (
        <div className="glass glass-border rounded-xl p-4 text-[13px] text-amber-300/90">{error}</div>
      )}

      {filtered.length === 0 ? (
        <div className="glass glass-border rounded-xl p-8 text-center text-sm text-white/30">
          {items.length === 0 ? 'Nothing sent yet.' : 'Nothing matches that filter.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filtered.map((it) => (
            <div key={it.id} className="glass glass-border rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider flex-wrap">
                <span className="text-white/50">{PLATFORM_LABELS[it.platform]}</span>
                <span className="text-white/20">·</span>
                <span className="text-white/70">{KIND_LABELS[it.kind]}</span>
                <span className="text-white/20">·</span>
                <span className="text-white/60">@{it.authorHandle || 'unknown'}</span>
                {it.threadStatus === 'partial_sent' && (
                  <>
                    <span className="text-white/20">·</span>
                    <span className="text-amber-300/80">partial thread</span>
                  </>
                )}
                <span className="text-white/20">·</span>
                <span className="text-white/40">{relativeTime(it.sentAt)}</span>
                {it.contextUrl && (
                  <>
                    <span className="text-white/20">·</span>
                    <a href={it.contextUrl} target="_blank" rel="noreferrer" className="text-white/50 hover:text-white underline underline-offset-2">original</a>
                  </>
                )}
                <span className="text-white/20">·</span>
                <span className="text-white/30 text-[10px]">{it.origin === 'outbound' ? 'drafter' : 'manual'}</span>
              </div>
              {it.contextText && (
                <p className="text-[12px] text-white/40 italic line-clamp-2">{it.contextText}</p>
              )}
              <p className="text-[14px] text-white/85 whitespace-pre-wrap">{it.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
