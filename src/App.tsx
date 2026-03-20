import { useState } from 'react'
import { Dashboard } from './pages/Dashboard'
import { Pipeline } from './pages/Pipeline'
import { Ideas } from './pages/Ideas'
import { VideoDetail } from './pages/VideoDetail'

type Page = 'dashboard' | 'pipeline' | 'ideas' | 'video-detail'

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null)

  const openVideo = (id: string) => {
    setSelectedVideoId(id)
    setPage('video-detail')
  }

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
                  page === p ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
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
