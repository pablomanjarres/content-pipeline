import { useEffect, useState } from 'react'
import { getPost, updatePost, updatePostStatus } from '../lib/api'
import { POST_STATUS_ORDER, POST_STATUS_LABELS, POST_STATUS_COLORS, PLATFORM_LABELS, CATEGORY_COLORS, type Post, type PostStatus, type PostPlatform, type Category } from '../lib/types'

interface Props {
  id: string
  onBack: () => void
}

export function PostDetail({ id, onBack }: Props) {
  const [post, setPost] = useState<Post | null>(null)
  const [saving, setSaving] = useState(false)

  const load = () => getPost(id).then(setPost)
  useEffect(() => { load() }, [id])

  if (!post) return <div className="text-zinc-500">Loading...</div>

  const save = async (updates: Partial<Post>) => {
    try {
      setSaving(true)
      const updated = await updatePost(id, updates)
      setPost(updated)
      setTimeout(() => setSaving(false), 500)
    } catch (e) {
      console.error('Save failed:', e)
      setSaving(false)
    }
  }

  const changeStatus = async (status: PostStatus) => {
    try {
      const updated = await updatePostStatus(id, status)
      setPost(updated)
    } catch (e) {
      console.error('Status update failed:', e)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="text-zinc-500 hover:text-white text-sm">← Back</button>
        <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">
          {PLATFORM_LABELS[post.platform]}
        </span>
        {saving && <span className="text-xs text-emerald-400">Saved</span>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-4">
          <input
            value={post.title}
            onChange={e => setPost({ ...post, title: e.target.value })}
            onBlur={() => save({ title: post.title })}
            className="w-full bg-transparent text-2xl font-bold outline-none border-b border-transparent focus:border-zinc-700 pb-1"
          />

          <div>
            <label className="text-xs text-zinc-500 block mb-1">Hook / Opening</label>
            <input
              value={post.hook}
              onChange={e => setPost({ ...post, hook: e.target.value })}
              onBlur={() => save({ hook: post.hook })}
              placeholder="Opening line that grabs attention..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-600"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-500 block mb-1">Content</label>
            <textarea
              value={post.content}
              onChange={e => setPost({ ...post, content: e.target.value })}
              onBlur={() => save({ content: post.content })}
              placeholder="Full post content..."
              rows={10}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-600 resize-y font-mono"
            />
            <div className="text-[10px] text-zinc-600 mt-1 text-right">
              {post.content.length} chars
              {post.platform === 'x' && post.content.length > 280 && (
                <span className="text-red-400 ml-2">Over 280 limit</span>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-500 block mb-1">CTA</label>
            <input
              value={post.cta}
              onChange={e => setPost({ ...post, cta: e.target.value })}
              onBlur={() => save({ cta: post.cta })}
              placeholder="Call to action..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-600"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-500 block mb-1">Post URL</label>
            <input
              value={post.url || ''}
              onChange={e => setPost({ ...post, url: e.target.value || null })}
              onBlur={() => save({ url: post.url })}
              placeholder="URL after posting..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-600 text-zinc-400"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-500 block mb-1">Notes</label>
            <textarea
              value={post.notes}
              onChange={e => setPost({ ...post, notes: e.target.value })}
              onBlur={() => save({ notes: post.notes })}
              placeholder="Additional notes..."
              rows={3}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-600 resize-y"
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Status */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <label className="text-xs text-zinc-500 block mb-2">Status</label>
            <div className="space-y-1">
              {POST_STATUS_ORDER.map(s => (
                <button
                  key={s}
                  onClick={() => changeStatus(s)}
                  className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
                    post.status === s ? 'text-white font-medium' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                  }`}
                  style={post.status === s ? { backgroundColor: POST_STATUS_COLORS[s] + '33', color: POST_STATUS_COLORS[s] } : undefined}
                >
                  {POST_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Platform */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <label className="text-xs text-zinc-500 block mb-2">Platform</label>
            <div className="space-y-1">
              {(['linkedin', 'x', 'reddit'] as PostPlatform[]).map(p => (
                <button
                  key={p}
                  onClick={() => { setPost({ ...post, platform: p }); save({ platform: p }) }}
                  className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
                    post.platform === p ? 'bg-purple-500/20 text-purple-400 font-medium' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  {PLATFORM_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Category */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <label className="text-xs text-zinc-500 block mb-2">Category</label>
            <div className="space-y-1">
              {(['building', 'studying', 'workout'] as Category[]).map(cat => (
                <button
                  key={cat}
                  onClick={() => { setPost({ ...post, category: cat }); save({ category: cat }) }}
                  className={`w-full text-left px-3 py-1.5 rounded text-sm capitalize transition-colors ${
                    post.category === cat ? 'font-medium' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                  }`}
                  style={post.category === cat ? { backgroundColor: CATEGORY_COLORS[cat] + '22', color: CATEGORY_COLORS[cat] } : undefined}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <label className="text-xs text-zinc-500 block mb-2">Tags</label>
            <div className="flex flex-wrap gap-1 mb-2">
              {post.tags.map((tag, i) => (
                <span key={i} className="text-xs bg-zinc-800 rounded px-2 py-0.5 flex items-center gap-1">
                  {tag}
                  <button
                    onClick={() => {
                      const tags = post.tags.filter((_, j) => j !== i)
                      setPost({ ...post, tags })
                      save({ tags })
                    }}
                    className="text-zinc-500 hover:text-red-400"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <input
              placeholder="Add tag..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs outline-none focus:border-zinc-500"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const val = (e.target as HTMLInputElement).value.trim()
                  if (val && !post.tags.includes(val)) {
                    const tags = [...post.tags, val]
                    setPost({ ...post, tags })
                    save({ tags });
                    (e.target as HTMLInputElement).value = ''
                  }
                }
              }}
            />
          </div>

          {/* Meta */}
          <div className="text-xs text-zinc-600 space-y-1">
            <div>Created: {new Date(post.createdAt).toLocaleString()}</div>
            <div>Updated: {new Date(post.updatedAt).toLocaleString()}</div>
            {post.postedAt && <div>Posted: {new Date(post.postedAt).toLocaleString()}</div>}
            <div className="font-mono text-[10px] text-zinc-700">{post.id}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
