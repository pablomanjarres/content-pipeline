import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Dashboard } from './pages/Dashboard'
import { Pipeline } from './pages/Pipeline'
import { Ideas } from './pages/Ideas'
import { Posts } from './pages/Posts'
import { VideoDetail } from './pages/VideoDetail'
import { PostDetail } from './pages/PostDetail'
import { Strategy } from './pages/Strategy'

type Page = 'dashboard' | 'pipeline' | 'ideas' | 'posts' | 'strategy' | 'video-detail' | 'post-detail'

const NAV_ITEMS: { key: Page; label: string }[] = [
  { key: 'dashboard', label: 'Overview' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'ideas', label: 'Ideas' },
  { key: 'strategy', label: 'Strategy' },
]

function parseHash(): { page: Page; itemId: string | null } {
  const hash = window.location.hash.slice(1) || 'dashboard'
  if (hash.startsWith('video/')) return { page: 'video-detail', itemId: hash.slice(6) }
  if (hash.startsWith('post/')) return { page: 'post-detail', itemId: hash.slice(5) }
  if (['dashboard', 'pipeline', 'ideas', 'posts', 'strategy'].includes(hash)) return { page: hash as Page, itemId: null }
  return { page: 'dashboard', itemId: null }
}

export default function App() {
  const [page, setPageState] = useState<Page>(() => parseHash().page)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(() => parseHash().itemId)

  const setPage = useCallback((p: Page) => {
    setPageState(p)
    if (p !== 'video-detail' && p !== 'post-detail') window.location.hash = p
  }, [])

  const openVideo = useCallback((id: string) => {
    setSelectedItemId(id)
    setPageState('video-detail')
    window.location.hash = `video/${id}`
  }, [])

  const openPost = useCallback((id: string) => {
    setSelectedItemId(id)
    setPageState('post-detail')
    window.location.hash = `post/${id}`
  }, [])

  useEffect(() => {
    const onHashChange = () => {
      const { page, itemId } = parseHash()
      setPageState(page)
      setSelectedItemId(itemId)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const isActive = (key: Page) =>
    page === key || (key === 'pipeline' && page === 'video-detail') || (key === 'posts' && page === 'post-detail')

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 glass-strong">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-10">
            <span className="font-semibold text-lg tracking-tight">
              Content <span className="font-serif italic font-normal text-white/70">Pipeline</span>
            </span>
            <div className="flex gap-0.5">
              {NAV_ITEMS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setPage(key)}
                  className={`relative px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200 ${
                    isActive(key)
                      ? 'text-white'
                      : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  {isActive(key) && (
                    <motion.div
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-lg bg-white/[0.08] border border-white/[0.06]"
                      transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }}
                    />
                  )}
                  <span className="relative z-10">{label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="text-[11px] text-white/30 font-medium tracking-wide uppercase">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {page === 'dashboard' && <Dashboard onOpenVideo={openVideo} onOpenPost={openPost} onNavigate={setPage} />}
            {page === 'pipeline' && <Pipeline onOpenVideo={openVideo} onOpenPost={openPost} />}
            {page === 'posts' && <Posts onOpenPost={openPost} />}
            {page === 'ideas' && <Ideas onOpenVideo={openVideo} />}
            {page === 'strategy' && <Strategy />}
            {page === 'video-detail' && selectedItemId && (
              <VideoDetail id={selectedItemId} onBack={() => setPage('dashboard')} />
            )}
            {page === 'post-detail' && selectedItemId && (
              <PostDetail id={selectedItemId} onBack={() => setPage('dashboard')} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
