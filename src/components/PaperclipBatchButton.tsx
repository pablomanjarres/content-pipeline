import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

interface PaperclipConfigResp {
  apiBase: string
  hasToken: boolean
  weeklyBatchRoutineId: string | null
}

export function PaperclipBatchButton() {
  const [hasToken, setHasToken] = useState<boolean | null>(null)
  const [apiBase, setApiBase] = useState('http://openclaw-vm:3100')
  const [showConfig, setShowConfig] = useState(false)
  const [tokenInput, setTokenInput] = useState('')
  const [apiBaseInput, setApiBaseInput] = useState('http://openclaw-vm:3100')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/paperclip/config')
      .then((r) => r.json())
      .then((c: PaperclipConfigResp) => {
        setHasToken(c.hasToken)
        setApiBase(c.apiBase)
        setApiBaseInput(c.apiBase)
      })
      .catch(() => setHasToken(false))
  }, [])

  const saveConfig = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const r = await fetch('/api/paperclip/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiBase: apiBaseInput.trim(),
          token: tokenInput.trim() || undefined,
        }),
      })
      const out = await r.json()
      setHasToken(Boolean(out.hasToken))
      setApiBase(apiBaseInput.trim())
      setShowConfig(false)
      setTokenInput('')
      setStatus({ kind: 'ok', text: 'Saved.' })
    } catch (e) {
      setStatus({ kind: 'error', text: e instanceof Error ? e.message : 'Failed to save.' })
    } finally {
      setBusy(false)
    }
  }

  const trigger = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const r = await fetch('/api/paperclip/trigger-weekly-batch', { method: 'POST' })
      const out = await r.json()
      if (out.error) {
        setStatus({ kind: 'error', text: out.error })
      } else {
        const id = typeof out.id === 'string' ? out.id.slice(0, 8) : 'queued'
        setStatus({ kind: 'ok', text: `Fired. Run ${id}. Researcher is proposing 14 ideas — open Paperclip to curate.` })
      }
    } catch (e) {
      setStatus({ kind: 'error', text: e instanceof Error ? e.message : 'Failed to trigger.' })
    } finally {
      setBusy(false)
    }
  }

  if (hasToken === null) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 md:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-white/40 mb-1">Paperclip</div>
          <div className="text-sm font-medium">Weekly content batch</div>
          <div className="text-[12px] text-white/50 mt-0.5 truncate">
            Researcher reads Mars + viral intel + last 30d of CP, drops 14 child issues to curate.
          </div>
        </div>

        {!showConfig && hasToken && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={trigger}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-white text-black text-sm font-medium hover:bg-white/90 disabled:opacity-50 disabled:cursor-wait"
            >
              {busy ? 'Triggering…' : 'Run batch'}
            </button>
            <button
              onClick={() => setShowConfig(true)}
              className="px-2 py-1.5 rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/5 text-sm"
              title="Settings"
            >
              ⚙
            </button>
          </div>
        )}

        {!hasToken && !showConfig && (
          <button
            onClick={() => setShowConfig(true)}
            className="px-3 py-1.5 rounded-lg border border-white/10 text-white/80 hover:bg-white/5 text-sm shrink-0"
          >
            Connect Paperclip
          </button>
        )}
      </div>

      {showConfig && (
        <div className="mt-3 grid gap-2">
          <label className="text-[12px] text-white/60">
            API base
            <input
              value={apiBaseInput}
              onChange={(e) => setApiBaseInput(e.target.value)}
              className="mt-1 w-full px-2 py-1.5 rounded-md bg-white/5 border border-white/10 text-sm font-mono"
              placeholder="http://openclaw-vm:3100"
            />
          </label>
          <label className="text-[12px] text-white/60">
            Token
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              className="mt-1 w-full px-2 py-1.5 rounded-md bg-white/5 border border-white/10 text-sm font-mono"
              placeholder={hasToken ? '(stored — leave blank to keep)' : 'pcp_board_…'}
              autoComplete="off"
            />
          </label>
          <div className="flex gap-2 mt-1">
            <button
              onClick={saveConfig}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-white text-black text-sm font-medium hover:bg-white/90 disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => {
                setShowConfig(false)
                setTokenInput('')
              }}
              className="px-3 py-1.5 rounded-lg border border-white/10 text-white/70 hover:bg-white/5 text-sm"
            >
              Cancel
            </button>
          </div>
          <div className="text-[11px] text-white/40">
            Token comes from Paperclip's CLI auth. On the VM: <span className="font-mono">jq -r &apos;.credentials | to_entries[0].value.token&apos; ~/.paperclip/auth.json</span>
          </div>
        </div>
      )}

      {status && (
        <div
          className={`mt-3 text-[12px] ${status.kind === 'ok' ? 'text-emerald-300/80' : 'text-rose-300/80'}`}
        >
          {status.text}
        </div>
      )}

      <div className="mt-2 text-[11px] text-white/30 truncate">
        {apiBase} {hasToken ? '· token saved' : '· not configured'}
      </div>
    </motion.div>
  )
}
