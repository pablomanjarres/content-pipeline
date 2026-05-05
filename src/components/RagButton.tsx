import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { searchMars, type RagResult } from '../lib/api'

// "RAG Mars vault" button + popover. Lives in the top nav.
// Calls /api/rag/search which proxies to the local mars-rag server (127.0.0.1:7374).
// Requires mars-rag-server launchd service to be running on the Mac mini.
export function RagButton() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<RagResult[]>([])
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    if (!query.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await searchMars(query.trim(), 8)
      setResults(r.results || [])
    } catch (e) {
      setError((e as Error).message || 'search failed')
      setResults([])
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors flex items-center gap-1.5"
        title="Search the Mars Obsidian vault"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        Mars
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="fixed top-14 right-3 md:right-6 z-[60] w-[min(92vw,520px)] bg-[#0e1014] border border-white/[0.12] rounded-xl shadow-2xl p-3 space-y-3"
          >
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') run() }}
                placeholder="Search Mars vault..."
                className="flex-1 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[13px] text-white placeholder-white/30 focus:outline-none focus:border-white/[0.16]"
              />
              <button
                onClick={run}
                disabled={busy || !query.trim()}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white/[0.08] hover:bg-white/[0.12] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {busy ? '...' : 'Go'}
              </button>
              <button
                onClick={() => { setOpen(false); setQuery(''); setResults([]); setError(null) }}
                className="px-2 py-1.5 rounded-lg text-[12px] text-white/40 hover:text-white hover:bg-white/[0.06]"
              >
                ✕
              </button>
            </div>
            {error && (
              <div className="text-[12px] text-amber-300/90 px-1">
                {error}. Make sure mars-rag-server is running (launchctl list | grep mars-rag).
              </div>
            )}
            {!error && results.length === 0 && !busy && query.trim() && (
              <div className="text-[12px] text-white/40 px-1">No results.</div>
            )}
            {results.length > 0 && (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {results.map((r, i) => (
                  <div key={i} className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[12px] font-medium text-white/85 truncate">{r.title || r.path}</span>
                      <span className="text-[10px] text-white/30 tabular-nums">{r.score.toFixed(3)}</span>
                    </div>
                    <div className="text-[11px] text-white/30 mb-1.5 truncate font-mono">{r.path}</div>
                    <p className="text-[12px] text-white/70 whitespace-pre-wrap line-clamp-4">{r.snippet}</p>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
