import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { MediaClips } from './MediaClips'
import { MediaBrolls } from './MediaBrolls'

type SubTab = 'clips' | 'brolls'

const SUB_TABS: { key: SubTab; label: string; sub: string }[] = [
  { key: 'clips', label: 'Clips', sub: 'Raw uploads + project sources' },
  { key: 'brolls', label: 'B-rolls', sub: '100-shot personal library' },
]

function parseSubTabHash(): SubTab {
  const m = window.location.hash.match(/^#videos\/(clips|brolls)$/)
  return (m?.[1] as SubTab) || 'clips'
}

export function Videos() {
  const [tab, setTab] = useState<SubTab>(() => parseSubTabHash())

  const setTabAndHash = (t: SubTab) => {
    setTab(t)
    window.location.hash = t === 'clips' ? 'videos' : `videos/${t}`
  }

  useEffect(() => {
    const onHash = () => setTab(parseSubTabHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Media</h1>
          <p className="text-sm text-white/30 mt-1">
            {SUB_TABS.find((s) => s.key === tab)?.sub}
          </p>
        </div>
        <div className="flex rounded-xl bg-white/[0.04] border border-white/[0.06] p-1">
          {SUB_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTabAndHash(key)}
              className={`relative px-4 py-1.5 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
                tab === key ? 'text-white' : 'text-white/50 hover:text-white/80'
              }`}
            >
              {tab === key && (
                <motion.div
                  layoutId="media-subtab-active"
                  className="absolute inset-0 rounded-lg bg-white/[0.10] border border-white/[0.06]"
                  transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
                />
              )}
              <span className="relative z-10">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {tab === 'clips' && <MediaClips />}
      {tab === 'brolls' && <MediaBrolls />}
    </div>
  )
}
