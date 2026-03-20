import { useState } from 'react'
import { createAction } from '../lib/api'

interface Props {
  videoId: string
  videoTitle: string
  compact?: boolean
}

const ACTIONS = [
  { type: 'write-hooks', label: 'Write Hooks', icon: '🎣', desc: 'Generate 3-5 punchy opening hooks' },
  { type: 'write-script', label: 'Write Script', icon: '📝', desc: 'Generate full script (Hook → Context → Proof → Payoff → CTA)' },
  { type: 'write-captions', label: 'Write Captions', icon: '💬', desc: 'Generate platform captions for IG, TikTok, YT' },
  { type: 'compress-clips', label: 'Compress Clips', icon: '🎬', desc: 'Concatenate linked clips into a single video via ffmpeg' },
  { type: 'suggest-edits', label: 'Suggest Edits', icon: '✂️', desc: 'Review content and suggest improvements' },
  { type: 'remotion-demo', label: 'Generate Demo', icon: '🎥', desc: 'Create a Remotion video demo with animations and transitions' },
] as const

export function ActionButtons({ videoId, videoTitle, compact }: Props) {
  const [sent, setSent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const send = async (type: string) => {
    try {
      setError(null)
      await createAction({ type, videoId, videoTitle })
      setSent(type)
      setTimeout(() => setSent(null), 2000)
    } catch {
      setError('Failed to queue')
      setTimeout(() => setError(null), 2000)
    }
  }

  if (compact) {
    return (
      <div className="flex gap-1">
        {ACTIONS.map(a => (
          <button
            key={a.type}
            onClick={e => { e.stopPropagation(); send(a.type) }}
            title={a.label}
            className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
              sent === a.type
                ? 'bg-emerald-900/50 text-emerald-400'
                : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            {sent === a.type ? '✓' : a.icon}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <label className="text-xs text-zinc-500 block mb-2">Claude Actions</label>
      {error && <div className="text-xs text-red-400 mb-2">{error}</div>}
      <div className="space-y-1.5">
        {ACTIONS.map(a => (
          <button
            key={a.type}
            onClick={() => send(a.type)}
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
        ))}
      </div>
      <p className="text-[10px] text-zinc-700 mt-2">Actions queue for Claude Code. Run /content-pipeline to process.</p>
    </div>
  )
}
