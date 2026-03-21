import { useState } from 'react'
import type { GeneratedContent } from '../lib/types'

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  x: 'X (Twitter)',
  script: 'Video Script',
}

const PLATFORM_COLORS: Record<string, string> = {
  linkedin: '#0a66c2',
  x: '#1d9bf0',
  script: '#10b981',
}

interface Props {
  content: GeneratedContent
  index: number
  onApply: (index: number) => void
  onCopy: (text: string) => void
  applied?: boolean
}

export function GenerationCard({ content, index, onApply, onCopy, applied }: Props) {
  const [copied, setCopied] = useState(false)
  const color = PLATFORM_COLORS[content.platform] || '#8b5cf6'

  const fullText = [content.hook, content.body, content.cta].filter(Boolean).join('\n\n')
  const hashtagText = content.hashtags.length > 0 ? '\n\n' + content.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ') : ''

  const handleCopy = () => {
    onCopy(fullText + hashtagText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: color }} />
          <span className="text-sm font-medium">{PLATFORM_LABELS[content.platform] || content.platform}</span>
        </div>
        {applied && (
          <span className="text-[11px] text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded">Applied</span>
        )}
      </div>

      <div className="p-4 space-y-3">
        {content.hook && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Hook</div>
            <p className="text-sm text-white/90 font-medium">{content.hook}</p>
          </div>
        )}
        {content.body && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Body</div>
            <p className="text-sm text-white/70 whitespace-pre-wrap leading-relaxed">{content.body}</p>
          </div>
        )}
        {content.cta && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">CTA</div>
            <p className="text-sm text-white/70">{content.cta}</p>
          </div>
        )}
        {content.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {content.hashtags.map((h, i) => (
              <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.04] text-white/40">
                {h.startsWith('#') ? h : `#${h}`}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-2.5 border-t border-zinc-800 flex gap-2">
        {!applied && (
          <button
            onClick={() => onApply(index)}
            className="text-xs px-3 py-1.5 rounded-md font-medium transition-colors"
            style={{ background: `${color}20`, color }}
          >
            Apply to Pipeline
          </button>
        )}
        <button
          onClick={handleCopy}
          className="text-xs px-3 py-1.5 rounded-md bg-white/[0.04] text-white/50 hover:text-white/80 hover:bg-white/[0.08] transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  )
}
