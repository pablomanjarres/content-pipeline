import { useState, useEffect, useCallback } from 'react'
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
  { key: 'posts', label: 'Posts' },
  { key: 'ideas', label: 'Ideas' },
  { key: 'strategy', label: 'Strategy' },
]

function parseHash(): { page: Page; itemId: string | null } {
  const hash = window.location.hash.slice(1) || 'dashboard'
  if (hash.startsWith('video/')) {
    return { page: 'video-detail', itemId: hash.slice(6) }
  }
  if (hash.startsWith('post/')) {
    return { page: 'post-detail', itemId: hash.slice(5) }
  }
  if (['dashboard', 'pipeline', 'ideas', 'posts', 'strategy'].includes(hash)) {
    return { page: hash as Page, itemId: null }
  }
  return { page: 'dashboard', itemId: null }
}

export default function App() {
  const [page, setPageState] = useState<Page>(() => parseHash().page)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(() => parseHash().itemId)

  const setPage = useCallback((p: Page) => {
    setPageState(p)
    if (p !== 'video-detail' && p !== 'post-detail') {
      window.location.hash = p
    }
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

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Nav */}
      <nav className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-6">
          <span className="font-bold text-lg tracking-tight">Content Pipeline</span>
          <div className="flex gap-1 ml-4">
            {NAV_ITEMS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPage(key)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  (page === key || (key === 'pipeline' && page === 'video-detail') || (key === 'posts' && page === 'post-detail'))
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {page === 'dashboard' && <Dashboard onOpenVideo={openVideo} onOpenPost={openPost} onNavigate={setPage} />}
        {page === 'pipeline' && <Pipeline onOpenVideo={openVideo} />}
        {page === 'posts' && <Posts onOpenPost={openPost} />}
        {page === 'ideas' && <Ideas onOpenVideo={openVideo} />}
        {page === 'strategy' && <Strategy />}
        {page === 'video-detail' && selectedItemId && (
          <VideoDetail id={selectedItemId} onBack={() => setPage('pipeline')} />
        )}
        {page === 'post-detail' && selectedItemId && (
          <PostDetail id={selectedItemId} onBack={() => setPage('posts')} />
        )}
      </main>
    </div>
  )
}
