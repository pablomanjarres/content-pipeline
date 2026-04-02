import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Dashboard } from './pages/Dashboard'
import { Pipeline } from './pages/Pipeline'
import { Ideas } from './pages/Ideas'
import { Posts } from './pages/Posts'
import { VideoDetail } from './pages/VideoDetail'
import { PostDetail } from './pages/PostDetail'
import { Strategy } from './pages/Strategy'
import { ContentEngine } from './pages/ContentEngine'
import { Videos } from './pages/Videos'
import { Templates } from './pages/Templates'

type Page = 'dashboard' | 'pipeline' | 'videos' | 'ideas' | 'posts' | 'strategy' | 'engine' | 'templates' | 'video-detail' | 'post-detail'

const NAV_ITEMS: { key: Page; label: string }[] = [
  { key: 'dashboard', label: 'Overview' },
  { key: 'videos', label: 'Media' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'ideas', label: 'Ideas' },
  { key: 'engine', label: 'Engine' },
  { key: 'templates', label: 'Templates' },
]

function parseHash(): { page: Page; itemId: string | null } {
  const hash = window.location.hash.slice(1) || 'dashboard'
  if (hash.startsWith('video/')) return { page: 'video-detail', itemId: hash.slice(6) }
  if (hash.startsWith('post/')) return { page: 'post-detail', itemId: hash.slice(5) }
  if (['dashboard', 'pipeline', 'videos', 'ideas', 'posts', 'strategy', 'engine', 'templates'].includes(hash)) return { page: hash as Page, itemId: null }
  return { page: 'dashboard', itemId: null }
}

const isElectron = typeof window !== 'undefined' && navigator.userAgent.includes('Electron')

export default function App() {
  const [page, setPageState] = useState<Page>(() => parseHash().page)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(() => parseHash().itemId)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const mobileNavRef = useRef<HTMLDivElement>(null)

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
    page === key || (key === 'videos' && page === 'video-detail') || (key === 'posts' && page === 'post-detail')

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Nav — draggable for Electron title bar */}
      <nav
        className="sticky top-0 z-50 bg-black border-b border-white/[0.06]"
        style={{
          ...(isElectron ? { WebkitAppRegion: 'drag' } : {}),
          paddingTop: 'env(safe-area-inset-top)',
        } as any}
      >
        <div className={`w-full max-w-[1400px] mx-auto px-3 md:px-6 h-14 flex items-center justify-between ${isElectron ? 'pl-20 md:pl-24' : ''}`}>
          <div className="flex items-center gap-4 md:gap-10" style={isElectron ? { WebkitAppRegion: 'no-drag' } as any : undefined}>
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white pl-[2px]">
                <svg width="10" height="12" viewBox="0 0 10 12" fill="none">
                  <path d="M0 0.5L10 6L0 11.5Z" fill="black" fillOpacity=".85"/>
                </svg>
              </div>
              <span className="hidden sm:inline font-semibold text-lg tracking-tight">
                Content <span className="font-serif italic font-normal text-white/70">Pipeline</span>
              </span>
            </div>
            {/* Desktop nav */}
            <div className="hidden md:flex gap-0.5">
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
          <div className="flex items-center gap-3" style={isElectron ? { WebkitAppRegion: 'no-drag' } as any : undefined}>
            <div className="hidden sm:block text-[11px] text-white/30 font-medium tracking-wide uppercase">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </div>
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
              className="md:hidden p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {mobileNavOpen ? (
                  <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
                ) : (
                  <><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></>
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile nav overlay */}
        <AnimatePresence>
          {mobileNavOpen && (
            <motion.div
              ref={mobileNavRef}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="md:hidden absolute top-14 left-0 right-0 bg-black border-b border-white/[0.06] px-4 py-3 space-y-1"
              style={isElectron ? { WebkitAppRegion: 'no-drag' } as any : undefined}
            >
              {NAV_ITEMS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => { setPage(key); setMobileNavOpen(false) }}
                  className={`block w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive(key)
                      ? 'text-white bg-white/[0.08]'
                      : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Content */}
      <main className="w-full max-w-[1400px] mx-auto px-3 md:px-6 py-4 md:py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            {page === 'dashboard' && <Dashboard onOpenVideo={openVideo} onOpenPost={openPost} onNavigate={setPage} />}
            {page === 'videos' && <Videos />}
            {page === 'pipeline' && <Pipeline onOpenVideo={openVideo} onOpenPost={openPost} />}
            {page === 'posts' && <Posts onOpenPost={openPost} />}
            {page === 'ideas' && <Ideas onOpenVideo={openVideo} />}
            {page === 'strategy' && <Strategy />}
            {page === 'engine' && <ContentEngine />}
            {page === 'templates' && <Templates />}
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
