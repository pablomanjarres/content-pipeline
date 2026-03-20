import { useEffect, useState } from 'react'
import { createAction, getActions, deleteAction, type Action } from '../lib/api'

interface Props {
  videoId: string
  videoTitle: string
  compact?: boolean
}

const ACTIONS = [
  { type: 'write-hooks', label: 'Write Hooks', icon: '🎣', desc: 'Generate 3-5 punchy opening hooks' },
  { type: 'write-script', label: 'Write Script', icon: '📝', desc: 'Generate full script (Hook → Context → Proof → Payoff → CTA)' },
  { type: 'write-captions', label: 'Write Captions', icon: '💬', desc: 'Generate captions for all platforms (video + posts)' },
  { type: 'compress-clips', label: 'Compress Clips', icon: '🎬', desc: 'Concatenate linked clips into a single video via ffmpeg' },
  { type: 'suggest-edits', label: 'Suggest Edits', icon: '✂️', desc: 'Review content and suggest improvements' },
  { type: 'remotion-demo', label: 'Generate Demo', icon: '🎥', desc: 'Create a Remotion video demo with animations and transitions' },
] as const

export function ActionButtons({ videoId, videoTitle, compact }: Props) {
  const [confirming, setConfirming] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [queue, setQueue] = useState<Action[]>([])

  const loadQueue = () => {
    getActions().then(all => setQueue(all.filter(a => a.videoId === videoId && a.status === 'pending')))
  }

  useEffect(() => { loadQueue() }, [videoId])

  const send = async (type: string) => {
    try {
      setError(null)
      await createAction({ type, videoId, videoTitle })
      setSent(type)
      setConfirming(null)
      loadQueue()
      setTimeout(() => setSent(null), 2000)
    } catch {
      setError('Failed to queue')
      setTimeout(() => setError(null), 2000)
    }
  }

  const handleDelete = async (id: string) => {
    await deleteAction(id)
    loadQueue()
  }

  const actionLabel = (type: string) => ACTIONS.find(a => a.type === type)?.label || type
  const actionIcon = (type: string) => ACTIONS.find(a => a.type === type)?.icon || '?'

  if (compact) {
    const quickActions = ACTIONS.filter(a => ['write-hooks', 'write-script', 'write-captions'].includes(a.type))
    return (
      <div className="flex gap-1.5 items-center">
        {quickActions.map(a => (
          <button
            key={a.type}
            onClick={e => { e.stopPropagation(); send(a.type) }}
            title={a.label}
            className={`text-[10px] px-2 py-1 rounded-md transition-colors ${
              sent === a.type
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-white/[0.04] text-white/30 hover:text-white/60 hover:bg-white/[0.08]'
            }`}
          >
            {sent === a.type ? '✓' : a.icon}
          </button>
        ))}
        {queue.length > 0 && (
          <span className="text-[9px] text-amber-400/70">{queue.length}q</span>
        )}
      </div>
    )
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs text-zinc-500">Claude Actions</label>
        {queue.length > 0 && (
          <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">
            {queue.length} pending
          </span>
        )}
      </div>
      {error && <div className="text-xs text-red-400 mb-2">{error}</div>}

      <div className="space-y-1.5">
        {ACTIONS.map(a => (
          <div key={a.type}>
            {confirming === a.type ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded bg-zinc-800 border border-zinc-700">
                <span className="text-xs text-zinc-300 flex-1">Queue "{a.label}"?</span>
                <button
                  onClick={() => send(a.type)}
                  className="text-xs bg-emerald-600 text-white px-2 py-0.5 rounded hover:bg-emerald-500"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirming(null)}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirming(a.type)}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center gap-2 ${
                  sent === a.type
                    ? 'bg-emerald-900/30 text-emerald-400'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                <span>{a.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm">{sent === a.type ? `${a.label} queued` : a.label}</div>
                  <div className="text-[10px] text-zinc-600">{a.desc}</div>
                </div>
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Pending queue for this video */}
      {queue.length > 0 && (
        <div className="mt-3 pt-3 border-t border-zinc-800">
          <label className="text-[10px] text-zinc-600 block mb-1.5">Queued for this video</label>
          <div className="space-y-1">
            {queue.map(action => (
              <div key={action.id} className="flex items-center gap-2 text-xs text-zinc-400 bg-zinc-800/50 rounded px-2 py-1.5">
                <span>{actionIcon(action.type)}</span>
                <span className="flex-1">{actionLabel(action.type)}</span>
                <span className="text-[10px] text-zinc-600">
                  {new Date(action.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <button
                  onClick={() => handleDelete(action.id)}
                  className="text-zinc-600 hover:text-red-400 transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-zinc-700 mt-2">Run /content-pipeline to process queued actions.</p>
    </div>
  )
}
