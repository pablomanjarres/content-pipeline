import { useState, useEffect, useCallback } from 'react'
import { Dashboard } from './pages/Dashboard'
import { Pipeline } from './pages/Pipeline'
import { Ideas } from './pages/Ideas'
import { VideoDetail } from './pages/VideoDetail'

type Page = 'dashboard' | 'pipeline' | 'ideas' | 'video-detail'

function parseHash(): { page: Page; videoId: string | null } {
  const hash = window.location.hash.slice(1) || 'dashboard'
  if (hash.startsWith('video/')) {
    return { page: 'video-detail', videoId: hash.slice(6) }
  }
  if (['dashboard', 'pipeline', 'ideas'].includes(hash)) {
    return { page: hash as Page, videoId: null }
  }
  return { page: 'dashboard', videoId: null }
}

export default function App() {
  const [page, setPageState] = useState<Page>(() => parseHash().page)
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(() => parseHash().videoId)

  const setPage = useCallback((p: Page) => {
    setPageState(p)
    if (p !== 'video-detail') {
      window.location.hash = p
    }
  }, [])

  const openVideo = useCallback((id: string) => {
    setSelectedVideoId(id)
    setPageState('video-detail')
    window.location.hash = `video/${id}`
  }, [])

  useEffect(() => {
    const onHashChange = () => {
      const { page, videoId } = parseHash()
      setPageState(page)
      setSelectedVideoId(videoId)
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
            {(['dashboard', 'pipeline', 'ideas'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  (page === p || (p === 'pipeline' && page === 'video-detail'))
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                {p === 'dashboard' ? 'Overview' : p === 'pipeline' ? 'Pipeline' : 'Ideas'}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {page === 'dashboard' && <Dashboard onOpenVideo={openVideo} onNavigate={setPage} />}
        {page === 'pipeline' && <Pipeline onOpenVideo={openVideo} />}
        {page === 'ideas' && <Ideas onOpenVideo={openVideo} />}
        {page === 'video-detail' && selectedVideoId && (
          <VideoDetail id={selectedVideoId} onBack={() => setPage('pipeline')} />
        )}
      </main>
    </div>
  )
}
