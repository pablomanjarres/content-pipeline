import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  algoliaSearch,
  algoliaReindex,
  type AlgoliaIndexName,
  type AlgoliaSearchResult,
} from '../lib/api'

// Federated Algolia search across leads + Mars DMs + voice anchors.
// Server-side only. Lives next to RagButton in the top nav.
// "Mars" button is semantic (mars-rag), "Search" is exact-match (Algolia).
const SOURCES: Array<{ key: AlgoliaIndexName; label: string }> = [
  { key: 'leads_index', label: 'Leads' },
  { key: 'dms_index', label: 'DMs' },
  { key: 'voice_anchors_index', label: 'Voice' },
]

function preview(hit: Record<string, any>): { title: string; body: string; path?: string } {
  if (hit.source === 'supabase/leads') {
    return {
      title: `@${hit.authorHandle || 'unknown'}`,
      body: String(hit.postText || '').slice(0, 240),
      path: hit.postId,
    }
  }
  return {
    title: hit.title || hit.path || hit.objectID,
    body: hit.snippet || (hit.body ? String(hit.body).slice(0, 240) : ''),
    path: hit.path,
  }
}

export function SearchButton() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<AlgoliaSearchResult | null>(null)
  const [source, setSource] = useState<AlgoliaIndexName>('leads_index')
  const [error, setError] = useState<string | null>(null)
  const [reindexing, setReindexing] = useState(false)

  const run = async (q: string = query, idx: AlgoliaIndexName = source) => {
    if (!q.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await algoliaSearch(idx, q.trim())
      setResults(r)
    } catch (e) {
      setError((e as Error).message)
      setResults(null)
    } finally {
      setBusy(false)
    }
  }

  const reindex = async () => {
    setReindexing(true)
    setError(null)
    try {
      const r = await algoliaReindex()
      setError(`Reindexed: ${r.indexed.leads} leads, ${r.indexed.dms} dms, ${r.indexed.voice_anchors} voice. Try a search.`)
    } catch (e) {
      setError(`Reindex failed: ${(e as Error).message}`)
    } finally {
      setReindexing(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors flex items-center gap-1.5"
        title="Search leads, DMs, and voice anchors (Algolia)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
        Search
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="fixed top-14 right-3 md:right-6 z-[60] w-[min(92vw,560px)] bg-[#0e1014] border border-white/[0.12] rounded-xl shadow-2xl p-3 space-y-3"
          >
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') run() }}
                placeholder="Search leads, DMs, voice anchors..."
                className="flex-1 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[13px] text-white placeholder-white/30 focus:outline-none focus:border-white/[0.16]"
              />
              <button
                onClick={() => run()}
                disabled={busy || !query.trim()}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white/[0.08] hover:bg-white/[0.12] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {busy ? '...' : 'Go'}
              </button>
              <button
                onClick={() => { setOpen(false); setQuery(''); setResults(null); setError(null) }}
                className="px-2 py-1.5 rounded-lg text-[12px] text-white/40 hover:text-white hover:bg-white/[0.06]"
              >
                ✕
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              {SOURCES.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => { setSource(key); if (query.trim()) run(query, key) }}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    source === key
                      ? 'bg-white/[0.08] text-white border border-white/[0.12]'
                      : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  {label}
                </button>
              ))}
              <button
                onClick={reindex}
                disabled={reindexing}
                className="ml-auto px-2.5 py-1 rounded-md text-[11px] font-medium text-white/40 hover:text-white hover:bg-white/[0.06] disabled:opacity-40"
                title="Rebuild Algolia indices from Supabase + Mars"
              >
                {reindexing ? 'Reindexing...' : 'Reindex'}
              </button>
            </div>
            {error && (
              <div className="text-[12px] text-amber-300/90 px-1">{error}</div>
            )}
            {!error && results && results.hits.length === 0 && (
              <div className="text-[12px] text-white/40 px-1">No hits in {source}.</div>
            )}
            {results && results.hits.length > 0 && (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {results.hits.map((h) => {
                  const p = preview(h)
                  return (
                    <div key={h.objectID} className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
                      <div className="text-[12px] font-medium text-white/85 truncate">{p.title}</div>
                      {p.path && (
                        <div className="text-[11px] text-white/30 mb-1.5 truncate font-mono">{p.path}</div>
                      )}
                      <p className="text-[12px] text-white/70 whitespace-pre-wrap line-clamp-4">{p.body}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
