import { useEffect, useState } from 'react'
import { getVideos, createVideo, updateVideoStatus, deleteVideo } from '../lib/api'
import { STATUS_ORDER, STATUS_LABELS, STATUS_COLORS, CATEGORY_COLORS, type Video, type Status, type Category } from '../lib/types'
import { ActionButtons } from '../components/ActionButtons'

interface Props {
  onOpenVideo: (id: string) => void
}

export function Pipeline({ onOpenVideo }: Props) {
  const [videos, setVideos] = useState<Video[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newCategory, setNewCategory] = useState<Category>('building')
  const [dragId, setDragId] = useState<string | null>(null)

  const load = () => getVideos().then(setVideos)
  useEffect(() => { load() }, [])

  const handleAdd = async () => {
    if (!newTitle.trim()) return
    await createVideo({ title: newTitle.trim(), category: newCategory })
    setNewTitle('')
    setShowAdd(false)
    load()
  }

  const handleDrop = async (status: Status) => {
    if (!dragId) return
    await updateVideoStatus(dragId, status)
    setDragId(null)
    load()
  }

  const handleDelete = async (id: string) => {
    await deleteVideo(id)
    load()
  }

  const moveVideo = async (id: string, direction: 'next' | 'prev') => {
    const video = videos.find(v => v.id === id)
    if (!video) return
    const idx = STATUS_ORDER.indexOf(video.status)
    const newIdx = direction === 'next' ? idx + 1 : idx - 1
    if (newIdx < 0 || newIdx >= STATUS_ORDER.length) return
    await updateVideoStatus(id, STATUS_ORDER[newIdx])
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Pipeline</h1>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="bg-white text-black px-3 py-1.5 rounded-md text-sm font-medium hover:bg-zinc-200 transition-colors"
        >
          + New Video
        </button>
      </div>

      {showAdd && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-4 flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs text-zinc-500 block mb-1">Title</label>
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="Video title..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm outline-none focus:border-zinc-500"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Category</label>
            <select
              value={newCategory}
              onChange={e => setNewCategory(e.target.value as Category)}
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm outline-none"
            >
              <option value="building">Building</option>
              <option value="studying">Studying</option>
              <option value="workout">Workout</option>
            </select>
          </div>
          <button onClick={handleAdd} className="bg-emerald-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-emerald-500">
            Add
          </button>
        </div>
      )}

      {/* Kanban Board */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {STATUS_ORDER.map(status => {
          const columnVideos = videos.filter(v => v.status === status)
          return (
            <div
              key={status}
              className="min-w-[180px] flex-1"
              onDragOver={e => e.preventDefault()}
              onDrop={() => handleDrop(status)}
            >
              <div className="flex items-center gap-2 mb-2 px-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] }} />
                <span className="text-sm font-medium text-zinc-400">{STATUS_LABELS[status]}</span>
                <span className="text-xs text-zinc-600 ml-auto">{columnVideos.length}</span>
              </div>
              <div className="space-y-2 min-h-[100px] bg-zinc-900/50 rounded-lg p-2 border border-zinc-800/50">
                {columnVideos.map(video => (
                  <div
                    key={video.id}
                    draggable
                    onDragStart={() => setDragId(video.id)}
                    className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-zinc-600 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        onClick={() => onOpenVideo(video.id)}
                        className="text-sm font-medium text-left hover:text-white transition-colors truncate flex-1"
                      >
                        {video.title}
                      </button>
                      <button
                        onClick={() => handleDelete(video.id)}
                        className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded capitalize"
                        style={{ backgroundColor: CATEGORY_COLORS[video.category] + '22', color: CATEGORY_COLORS[video.category] }}
                      >
                        {video.category}
                      </span>
                      {video.hook && <span className="text-[10px] text-zinc-600">🎣</span>}
                      {video.script && <span className="text-[10px] text-zinc-600">📝</span>}
                    </div>
                    <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ActionButtons videoId={video.id} videoTitle={video.title} compact />
                    </div>
                    <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {STATUS_ORDER.indexOf(status) > 0 && (
                        <button onClick={() => moveVideo(video.id, 'prev')} className="text-[10px] text-zinc-500 hover:text-white">← Back</button>
                      )}
                      {STATUS_ORDER.indexOf(status) < STATUS_ORDER.length - 1 && (
                        <button onClick={() => moveVideo(video.id, 'next')} className="text-[10px] text-zinc-500 hover:text-white ml-auto">Next →</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
