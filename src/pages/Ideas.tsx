import { useEffect, useState } from 'react'
import { getIdeas, createIdea, convertIdea, deleteIdea } from '../lib/api'
import type { Idea, Category } from '../lib/types'

interface Props {
  onOpenVideo: (id: string) => void
}

export function Ideas({ onOpenVideo }: Props) {
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [hook, setHook] = useState('')
  const [category, setCategory] = useState<Category>('building')

  const load = () => getIdeas().then(setIdeas)
  useEffect(() => { load() }, [])

  const handleAdd = async () => {
    if (!title.trim()) return
    await createIdea({ title: title.trim(), description, hook, category })
    setTitle('')
    setDescription('')
    setHook('')
    setShowAdd(false)
    load()
  }

  const handleConvert = async (id: string) => {
    const video = await convertIdea(id)
    onOpenVideo(video.id)
  }

  const handleDelete = async (id: string) => {
    await deleteIdea(id)
    load()
  }

  const unconverted = ideas.filter(i => !i.convertedToVideoId)
  const converted = ideas.filter(i => i.convertedToVideoId)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Ideas</h1>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="bg-white text-black px-3 py-1.5 rounded-md text-sm font-medium hover:bg-zinc-200 transition-colors"
        >
          + New Idea
        </button>
      </div>

      {showAdd && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-4 space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-zinc-500 block mb-1">Title</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Video idea..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm outline-none focus:border-zinc-500"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value as Category)}
                className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm outline-none"
              >
                <option value="building">Building</option>
                <option value="studying">Studying</option>
                <option value="workout">Workout</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Hook</label>
            <input
              value={hook}
              onChange={e => setHook(e.target.value)}
              placeholder="Opening hook line..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm outline-none focus:border-zinc-500"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Notes</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Description, angles, notes..."
              rows={2}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm outline-none focus:border-zinc-500 resize-none"
            />
          </div>
          <button onClick={handleAdd} className="bg-emerald-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-emerald-500">
            Save Idea
          </button>
        </div>
      )}

      {unconverted.length === 0 && !showAdd && (
        <p className="text-zinc-500 text-sm">No ideas yet. Capture one!</p>
      )}

      <div className="space-y-2">
        {unconverted.map(idea => (
          <div key={idea.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 group">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="font-medium">{idea.title}</div>
                {idea.hook && <div className="text-sm text-amber-400 mt-1">🎣 {idea.hook}</div>}
                {idea.description && <div className="text-sm text-zinc-400 mt-1">{idea.description}</div>}
                <div className="flex items-center gap-2 mt-2">
                  {idea.category && (
                    <span className="text-xs text-zinc-500 capitalize">{idea.category}</span>
                  )}
                  <span className="text-xs text-zinc-600">
                    {new Date(idea.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 ml-3">
                <button
                  onClick={() => handleConvert(idea.id)}
                  className="text-xs bg-emerald-600/20 text-emerald-400 px-2.5 py-1 rounded hover:bg-emerald-600/30 transition-colors"
                >
                  → Video
                </button>
                <button
                  onClick={() => handleDelete(idea.id)}
                  className="text-xs text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {converted.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm text-zinc-500 mb-2">Converted ({converted.length})</h3>
          <div className="space-y-1">
            {converted.map(idea => (
              <div key={idea.id} className="text-sm text-zinc-600 flex items-center gap-2">
                <span>✓</span>
                <span className="line-through">{idea.title}</span>
                <button
                  onClick={() => idea.convertedToVideoId && onOpenVideo(idea.convertedToVideoId)}
                  className="text-xs text-zinc-500 hover:text-white"
                >
                  View →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
