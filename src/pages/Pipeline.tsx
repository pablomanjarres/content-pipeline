import { useEffect, useState } from 'react'
import { getVideos, createVideo, updateVideoStatus, deleteVideo, getPosts, createPost, updatePostStatus, deletePost } from '../lib/api'
import { STATUS_ORDER, STATUS_LABELS, STATUS_COLORS, CATEGORY_COLORS, POST_STATUS_ORDER, POST_STATUS_LABELS, POST_STATUS_COLORS, PLATFORM_LABELS, type Video, type Post, type Status, type PostStatus, type PostPlatform, type Category } from '../lib/types'
import { ActionButtons } from '../components/ActionButtons'

interface Props {
  onOpenVideo: (id: string) => void
  onOpenPost: (id: string) => void
}

export function Pipeline({ onOpenVideo, onOpenPost }: Props) {
  const [videos, setVideos] = useState<Video[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [showAddVideo, setShowAddVideo] = useState(false)
  const [showAddPost, setShowAddPost] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newCategory, setNewCategory] = useState<Category>('building')
  const [newPlatform, setNewPlatform] = useState<PostPlatform>('linkedin')
  const [dragVideoId, setDragVideoId] = useState<string | null>(null)
  const [dragPostId, setDragPostId] = useState<string | null>(null)

  const loadVideos = () => getVideos().then(setVideos)
  const loadPosts = () => getPosts().then(setPosts)
  useEffect(() => { loadVideos(); loadPosts() }, [])

  // Video handlers
  const handleAddVideo = async () => {
    if (!newTitle.trim()) return
    await createVideo({ title: newTitle.trim(), category: newCategory })
    setNewTitle(''); setShowAddVideo(false); loadVideos()
  }
  const handleDropVideo = async (status: Status) => {
    if (!dragVideoId) return
    await updateVideoStatus(dragVideoId, status)
    setDragVideoId(null); loadVideos()
  }
  const handleDeleteVideo = async (id: string) => { await deleteVideo(id); loadVideos() }
  const moveVideo = async (id: string, direction: 'next' | 'prev') => {
    const video = videos.find(v => v.id === id)
    if (!video) return
    const idx = STATUS_ORDER.indexOf(video.status)
    const newIdx = direction === 'next' ? idx + 1 : idx - 1
    if (newIdx < 0 || newIdx >= STATUS_ORDER.length) return
    await updateVideoStatus(id, STATUS_ORDER[newIdx]); loadVideos()
  }

  // Post handlers
  const handleAddPost = async () => {
    if (!newTitle.trim()) return
    await createPost({ title: newTitle.trim(), platform: newPlatform, category: newCategory })
    setNewTitle(''); setShowAddPost(false); loadPosts()
  }
  const handleDropPost = async (status: PostStatus) => {
    if (!dragPostId) return
    await updatePostStatus(dragPostId, status)
    setDragPostId(null); loadPosts()
  }
  const handleDeletePost = async (id: string) => { await deletePost(id); loadPosts() }
  const movePost = async (id: string, direction: 'next' | 'prev') => {
    const post = posts.find(p => p.id === id)
    if (!post) return
    const idx = POST_STATUS_ORDER.indexOf(post.status)
    const newIdx = direction === 'next' ? idx + 1 : idx - 1
    if (newIdx < 0 || newIdx >= POST_STATUS_ORDER.length) return
    await updatePostStatus(id, POST_STATUS_ORDER[newIdx]); loadPosts()
  }

  return (
    <div className="space-y-8">
      {/* Video Pipeline */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Videos</h2>
          <button
            onClick={() => { setShowAddVideo(!showAddVideo); setShowAddPost(false) }}
            className="bg-white text-black px-3 py-1.5 rounded-md text-sm font-medium hover:bg-zinc-200 transition-colors"
          >
            + New Video
          </button>
        </div>

        {showAddVideo && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-4 flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs text-zinc-500 block mb-1">Title</label>
              <input
                value={newTitle} onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddVideo()}
                placeholder="Video title..." autoFocus
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Category</label>
              <select value={newCategory} onChange={e => setNewCategory(e.target.value as Category)}
                className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm outline-none">
                <option value="building">Building</option>
                <option value="studying">Studying</option>
                <option value="workout">Workout</option>
              </select>
            </div>
            <button onClick={handleAddVideo} className="bg-emerald-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-emerald-500">Add</button>
          </div>
        )}

        <div className="flex gap-3 overflow-x-auto pb-4">
          {STATUS_ORDER.map(status => {
            const col = videos.filter(v => v.status === status)
            return (
              <div key={status} className="min-w-[160px] flex-1" onDragOver={e => e.preventDefault()} onDrop={() => handleDropVideo(status)}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] }} />
                  <span className="text-sm font-medium text-zinc-400">{STATUS_LABELS[status]}</span>
                  <span className="text-xs text-zinc-600 ml-auto">{col.length}</span>
                </div>
                <div className="space-y-2 min-h-[80px] bg-zinc-900/50 rounded-lg p-2 border border-zinc-800/50">
                  {col.map(video => (
                    <div key={video.id} draggable onDragStart={() => setDragVideoId(video.id)}
                      className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-zinc-600 transition-colors group">
                      <div className="flex items-start justify-between gap-2">
                        <button onClick={() => onOpenVideo(video.id)} className="text-sm font-medium text-left hover:text-white transition-colors truncate flex-1">{video.title}</button>
                        <button onClick={() => handleDeleteVideo(video.id)} className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs">✕</button>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded capitalize" style={{ backgroundColor: CATEGORY_COLORS[video.category] + '22', color: CATEGORY_COLORS[video.category] }}>{video.category}</span>
                        {video.hook && <span className="text-[10px] text-zinc-600">🎣</span>}
                        {video.script && <span className="text-[10px] text-zinc-600">📝</span>}
                      </div>
                      <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ActionButtons videoId={video.id} videoTitle={video.title} compact />
                      </div>
                      <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {STATUS_ORDER.indexOf(status) > 0 && <button onClick={() => moveVideo(video.id, 'prev')} className="text-[10px] text-zinc-500 hover:text-white">← Back</button>}
                        {STATUS_ORDER.indexOf(status) < STATUS_ORDER.length - 1 && <button onClick={() => moveVideo(video.id, 'next')} className="text-[10px] text-zinc-500 hover:text-white ml-auto">Next →</button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Posts Pipeline */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Posts</h2>
          <button
            onClick={() => { setShowAddPost(!showAddPost); setShowAddVideo(false) }}
            className="bg-white text-black px-3 py-1.5 rounded-md text-sm font-medium hover:bg-zinc-200 transition-colors"
          >
            + New Post
          </button>
        </div>

        {showAddPost && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-4 flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs text-zinc-500 block mb-1">Title</label>
              <input
                value={newTitle} onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddPost()}
                placeholder="Post title..." autoFocus
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Platform</label>
              <select value={newPlatform} onChange={e => setNewPlatform(e.target.value as PostPlatform)}
                className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm outline-none">
                <option value="linkedin">LinkedIn</option>
                <option value="x">X</option>
                <option value="reddit">Reddit</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Category</label>
              <select value={newCategory} onChange={e => setNewCategory(e.target.value as Category)}
                className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm outline-none">
                <option value="building">Building</option>
                <option value="studying">Studying</option>
                <option value="workout">Workout</option>
              </select>
            </div>
            <button onClick={handleAddPost} className="bg-emerald-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-emerald-500">Add</button>
          </div>
        )}

        <div className="flex gap-3 overflow-x-auto pb-4">
          {POST_STATUS_ORDER.map(status => {
            const col = posts.filter(p => p.status === status)
            return (
              <div key={status} className="min-w-[220px] flex-1" onDragOver={e => e.preventDefault()} onDrop={() => handleDropPost(status)}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: POST_STATUS_COLORS[status] }} />
                  <span className="text-sm font-medium text-zinc-400">{POST_STATUS_LABELS[status]}</span>
                  <span className="text-xs text-zinc-600 ml-auto">{col.length}</span>
                </div>
                <div className="space-y-2 min-h-[80px] bg-zinc-900/50 rounded-lg p-2 border border-zinc-800/50">
                  {col.map(post => (
                    <div key={post.id} draggable onDragStart={() => setDragPostId(post.id)}
                      className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-zinc-600 transition-colors group">
                      <div className="flex items-start justify-between gap-2">
                        <button onClick={() => onOpenPost(post.id)} className="text-sm font-medium text-left hover:text-white transition-colors truncate flex-1">{post.title}</button>
                        <button onClick={() => handleDeletePost(post.id)} className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs">✕</button>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">{PLATFORM_LABELS[post.platform]}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded capitalize" style={{ backgroundColor: CATEGORY_COLORS[post.category] + '22', color: CATEGORY_COLORS[post.category] }}>{post.category}</span>
                      </div>
                      <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {POST_STATUS_ORDER.indexOf(status) > 0 && <button onClick={() => movePost(post.id, 'prev')} className="text-[10px] text-zinc-500 hover:text-white">← Back</button>}
                        {POST_STATUS_ORDER.indexOf(status) < POST_STATUS_ORDER.length - 1 && <button onClick={() => movePost(post.id, 'next')} className="text-[10px] text-zinc-500 hover:text-white ml-auto">Next →</button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
