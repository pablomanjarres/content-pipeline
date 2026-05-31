import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Dashboard } from './pages/Dashboard'
import { Posts } from './pages/Posts'
import { VideoDetail } from './pages/VideoDetail'
import { PostDetail } from './pages/PostDetail'
import { Strategy } from './pages/Strategy'
import { Videos } from './pages/Videos'
import { Templates } from './pages/Templates'
import { Ideas } from './pages/Ideas'
import { Outbound } from './pages/Outbound'
import { Sent } from './pages/Sent'
import { Shorts } from './pages/Shorts'
import { Watchlist } from './pages/Watchlist'
import { Ops } from './pages/Ops'
import { RagButton } from './components/RagButton'
import { SearchButton } from './components/SearchButton'
import { useIsMobile } from './lib/useIsMobile'

type Page = 'dashboard' | 'videos' | 'posts' | 'strategy' | 'templates' | 'ideas' | 'outbound' | 'sent' | 'shorts' | 'watchlist' | 'ops' | 'video-detail' | 'post-detail'

// Outbound = openclaw-generated drafts pending review.
// Sent = the audit trail of replies/DMs already sent (includes partial + manual sent-dms).
// Shorts = daily finished short-video slots from the weekly tracker.
// Watchlist = tiered handles the radar polls for new posts.
const NAV_ITEMS: { key: Page; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Overview', icon: 'grid' },
  { key: 'videos', label: 'Media', icon: 'play' },
  { key: 'shorts', label: 'Shorts', icon: 'spark' },
  { key: 'ideas', label: 'Ideas', icon: 'image' },
  { key: 'templates', label: 'Templates', icon: 'doc' },
  { key: 'outbound', label: 'Outbound', icon: 'reply' },
  { key: 'watchlist', label: 'Watchlist', icon: 'eye' },
  { key: 'sent', label: 'Sent', icon: 'check' },
  { key: 'ops', label: 'Ops', icon: 'power' },
]

function NavIcon({ icon, size = 20 }: { icon: string; size?: number }) {
  const s = String(size)
  const props = { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.8', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (icon) {
    case 'grid': return <svg {...props}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
    case 'play': return <svg {...props}><polygon points="5,3 19,12 5,21" fill="currentColor" stroke="none" opacity="0.9"/></svg>
    case 'doc': return <svg {...props}><path d="M14,2H6a2,2 0 0 0-2,2V20a2,2 0 0 0 2,2H18a2,2 0 0 0 2-2V8Z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
    case 'film': return <svg {...props}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="16" x2="21" y2="16"/><line x1="8" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="16" y2="21"/></svg>
    case 'message': return <svg {...props}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="14" y2="13"/></svg>
    case 'reply': return <svg {...props}><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
    case 'image': return <svg {...props}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
    case 'check': return <svg {...props}><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>
    case 'spark': return <svg {...props}><path d="M12 2v6"/><path d="M12 16v6"/><path d="M2 12h6"/><path d="M16 12h6"/><path d="M5 5l3 3"/><path d="M16 16l3 3"/><path d="M5 19l3-3"/><path d="M16 8l3-3"/></svg>
    case 'eye': return <svg {...props}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
    case 'power': return <svg {...props}><path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/></svg>
    default: return null
  }
}

function parseHash(): { page: Page; itemId: string | null } {
  const hash = window.location.hash.slice(1) || 'dashboard'
  if (hash.startsWith('video/')) return { page: 'video-detail', itemId: hash.slice(6) }
  if (hash.startsWith('post/')) return { page: 'post-detail', itemId: hash.slice(5) }
  if (hash === 'videos' || hash.startsWith('videos/')) return { page: 'videos', itemId: null }
  if (['dashboard', 'posts', 'strategy', 'templates', 'ideas', 'outbound', 'sent', 'shorts', 'watchlist', 'ops'].includes(hash)) return { page: hash as Page, itemId: null }
  return { page: 'dashboard', itemId: null }
}

const isElectron = typeof window !== 'undefined' && navigator.userAgent.includes('Electron')

export default function App() {
  const [page, setPageState] = useState<Page>(() => parseHash().page)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(() => parseHash().itemId)
  const isMobile = useIsMobile()
  const showBottomTabs = isMobile && !isElectron
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

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
    <div className="min-h-screen bg-[#08090b] text-white">
      {/* Top Nav — desktop + Electron mobile */}
      <nav
        className={`sticky top-0 z-50 bg-[#08090b]/95 border-b border-white/[0.1] ${showBottomTabs ? 'border-b-0' : ''}`}
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
                Content <span className="font-serif italic font-normal text-white/70">Studio</span>
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
            <SearchButton />
            <RagButton />
            <div className="hidden sm:block text-[11px] text-white/30 font-medium tracking-wide uppercase">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </div>
            {/* Hamburger — only for non-bottom-tab mobile (Electron small windows) */}
            {!showBottomTabs && (
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
            )}
          </div>
        </div>

        {/* Hamburger overlay — Electron only fallback */}
        <AnimatePresence>
          {mobileNavOpen && !showBottomTabs && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="md:hidden absolute top-14 left-0 right-0 bg-[#08090b] border-b border-white/[0.1] px-4 py-3 space-y-1"
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
      <main className={`w-full max-w-[1400px] mx-auto px-3 md:px-6 py-4 md:py-8 ${showBottomTabs ? 'pb-24' : ''}`}>
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
            {page === 'posts' && <Posts onOpenPost={openPost} />}
            {page === 'strategy' && <Strategy />}
            {page === 'templates' && <Templates />}
            {page === 'ideas' && <Ideas onOpenVideo={openVideo} />}
            {page === 'outbound' && <Outbound />}
            {page === 'sent' && <Sent />}
            {page === 'shorts' && <Shorts onOpenVideo={openVideo} />}
            {page === 'watchlist' && <Watchlist />}
            {page === 'ops' && <Ops />}
            {page === 'video-detail' && selectedItemId && (
              <VideoDetail id={selectedItemId} onBack={() => setPage('dashboard')} />
            )}
            {page === 'post-detail' && selectedItemId && (
              <PostDetail id={selectedItemId} onBack={() => setPage('dashboard')} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom Tab Bar — mobile browser only */}
      {showBottomTabs && (
        <nav
          className="fixed bottom-0 left-0 right-0 z-50 bg-[#08090b]/95 backdrop-blur-lg border-t border-white/[0.12]"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex justify-around items-center h-16 max-w-[500px] mx-auto">
            {NAV_ITEMS.map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setPage(key)}
                className={`flex flex-col items-center gap-0.5 px-2 py-1.5 min-w-[56px] transition-colors ${
                  isActive(key) ? 'text-white' : 'text-white/35'
                }`}
              >
                <NavIcon icon={icon} size={22} />
                <span className="text-[10px] font-medium leading-tight">{label}</span>
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}
