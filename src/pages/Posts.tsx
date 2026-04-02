import { useEffect, useState } from 'react'
import { getPosts, createPost, updatePostStatus, deletePost } from '../lib/api'
import { POST_STATUS_ORDER, POST_STATUS_LABELS, POST_STATUS_COLORS, PLATFORM_LABELS, CATEGORY_COLORS, type Post, type PostStatus, type PostPlatform, type Category } from '../lib/types'

interface Props {
  onOpenPost: (id: string) => void
}

export function Posts({ onOpenPost }: Props) {
  const [posts, setPosts] = useState<Post[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newPlatform, setNewPlatform] = useState<PostPlatform>('linkedin')
  const [newCategory, setNewCategory] = useState<Category>('building')
  const [dragId, setDragId] = useState<string | null>(null)

  const load = () => getPosts().then(setPosts)
  useEffect(() => { load() }, [])

  const handleAdd = async () => {
    if (!newTitle.trim()) return
    await createPost({ title: newTitle.trim(), platform: newPlatform, category: newCategory })
    setNewTitle('')
    setShowAdd(false)
    load()
  }

  const handleDrop = async (status: PostStatus) => {
    if (!dragId) return
    await updatePostStatus(dragId, status)
    setDragId(null)
    load()
  }

  const handleDelete = async (id: string) => {
    await deletePost(id)
    load()
  }

  const movePost = async (id: string, direction: 'next' | 'prev') => {
    const post = posts.find(p => p.id === id)
    if (!post) return
    const idx = POST_STATUS_ORDER.indexOf(post.status)
    const newIdx = direction === 'next' ? idx + 1 : idx - 1
    if (newIdx < 0 || newIdx >= POST_STATUS_ORDER.length) return
    await updatePostStatus(id, POST_STATUS_ORDER[newIdx])
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Posts</h1>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="bg-white text-black px-3 py-1.5 rounded-md text-sm font-medium hover:bg-zinc-200 transition-colors"
        >
          + New Post
        </button>
      </div>

      {showAdd && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs text-zinc-500 block mb-1">Title</label>
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="Post title..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm outline-none focus:border-zinc-500"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Platform</label>
            <select
              value={newPlatform}
              onChange={e => setNewPlatform(e.target.value as PostPlatform)}
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm outline-none"
            >
              <option value="linkedin">LinkedIn</option>
              <option value="x">X</option>
              <option value="reddit">Reddit</option>
            </select>
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
              <option value="gtm">GTM</option>
            </select>
          </div>
          <button onClick={handleAdd} className="bg-emerald-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-emerald-500">
            Add
          </button>
        </div>
      )}

      {/* Kanban Board */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {POST_STATUS_ORDER.map(status => {
          const columnPosts = posts.filter(p => p.status === status)
          return (
            <div
              key={status}
              className="min-w-[220px] flex-1"
              onDragOver={e => e.preventDefault()}
              onDrop={() => handleDrop(status)}
            >
              <div className="flex items-center gap-2 mb-2 px-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: POST_STATUS_COLORS[status] }} />
                <span className="text-sm font-medium text-zinc-400">{POST_STATUS_LABELS[status]}</span>
                <span className="text-xs text-zinc-600 ml-auto">{columnPosts.length}</span>
              </div>
              <div className="space-y-2 min-h-[100px] bg-zinc-900/50 rounded-lg p-2 border border-zinc-800/50">
                {columnPosts.map(post => (
                  <div
                    key={post.id}
                    draggable
                    onDragStart={() => setDragId(post.id)}
                    className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-zinc-600 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        onClick={() => onOpenPost(post.id)}
                        className="text-sm font-medium text-left hover:text-white transition-colors truncate flex-1"
                      >
                        {post.title}
                      </button>
                      <button
                        onClick={() => handleDelete(post.id)}
                        className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">
                        {PLATFORM_LABELS[post.platform]}
                      </span>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded capitalize"
                        style={{ backgroundColor: CATEGORY_COLORS[post.category] + '22', color: CATEGORY_COLORS[post.category] }}
                      >
                        {post.category}
                      </span>
                    </div>
                    <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {POST_STATUS_ORDER.indexOf(status) > 0 && (
                        <button onClick={() => movePost(post.id, 'prev')} className="text-[10px] text-zinc-500 hover:text-white">← Back</button>
                      )}
                      {POST_STATUS_ORDER.indexOf(status) < POST_STATUS_ORDER.length - 1 && (
                        <button onClick={() => movePost(post.id, 'next')} className="text-[10px] text-zinc-500 hover:text-white ml-auto">Next →</button>
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
