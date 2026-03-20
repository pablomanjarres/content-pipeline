import { useEffect, useState, useRef } from 'react'
import { getPost, updatePost, updatePostStatus } from '../lib/api'
import { POST_STATUS_ORDER, POST_STATUS_LABELS, POST_STATUS_COLORS, PLATFORM_LABELS, CATEGORY_COLORS, type Post, type PostStatus, type PostPlatform, type Category } from '../lib/types'

interface ProjectData {
  folderPath: string
  script: string
  sources: { filename: string; path: string; size: number }[]
  exports: { filename: string; path: string; size: number }[]
}

interface Props {
  id: string
  onBack: () => void
}

export function PostDetail({ id, onBack }: Props) {
  const [post, setPost] = useState<Post | null>(null)
  const [project, setProject] = useState<ProjectData | null>(null)
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const assetRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    const p = await getPost(id)
    setPost(p)

    const weekKey = getWeekKey(p.createdAt)
    const slug = slugify(p.title)

    await fetch('/api/projects/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekKey, slug, title: p.title, type: 'post' }),
    })

    const proj = await fetch(`/api/projects/${weekKey}/${slug}`).then(r => r.json())
    setProject(proj)
    setContent(proj.script || '')
  }

  useEffect(() => { load() }, [id])

  if (!post) return <div className="flex items-center justify-center h-40 text-white/20 text-sm">Loading project...</div>

  const weekKey = getWeekKey(post.createdAt)
  const slug = slugify(post.title)

  const save = async (updates: Partial<Post>) => {
    try {
      setSaving(true)
      const updated = await updatePost(id, updates)
      setPost(updated)
      setTimeout(() => setSaving(false), 500)
    } catch { setSaving(false) }
  }

  const saveContent = async () => {
    await fetch(`/api/projects/${weekKey}/${slug}/script`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
  }

  const changeStatus = async (status: PostStatus) => {
    try {
      const updated = await updatePostStatus(id, status)
      setPost(updated)
    } catch {}
  }

  const uploadAsset = async (files: FileList) => {
    const form = new FormData()
    for (const f of files) form.append('files', f)
    await fetch(`/api/projects/${weekKey}/${slug}/upload`, { method: 'POST', body: form })
    load()
  }

  const formatSize = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)}KB` : `${(bytes / (1024 * 1024)).toFixed(1)}MB`

  const charLimit = post.platform === 'x' ? 280 : null
  const charCount = post.content?.length || 0

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="text-white/30 hover:text-white text-sm transition-colors">← Back</button>
        <div className="w-px h-4 bg-white/10" />
        <span className="text-[11px] bg-purple-500/15 text-purple-400 px-2 py-0.5 rounded-md font-medium">{PLATFORM_LABELS[post.platform]}</span>
        <span className="text-[11px] text-white/20 font-medium uppercase tracking-wider">Post Project</span>
        {saving && <span className="text-[11px] text-emerald-400 font-medium">Saved</span>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main */}
        <div className="lg:col-span-2 space-y-5">
          <input
            value={post.title}
            onChange={e => setPost({ ...post, title: e.target.value })}
            onBlur={() => save({ title: post.title })}
            className="w-full bg-transparent text-2xl font-bold outline-none border-b border-white/5 focus:border-white/20 pb-2 transition-colors"
            placeholder="Post title..."
          />

          {/* Hook */}
          <div className="glass glass-border rounded-xl p-4">
            <label className="text-[11px] text-white/30 uppercase tracking-wider font-medium block mb-2">Hook — opening line</label>
            <input
              value={post.hook}
              onChange={e => setPost({ ...post, hook: e.target.value })}
              onBlur={() => save({ hook: post.hook })}
              placeholder="First line that grabs attention..."
              className="w-full bg-transparent text-white/90 outline-none text-sm"
            />
          </div>

          {/* Post Content (synced to script.md) */}
          <div className="glass glass-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] text-white/30 uppercase tracking-wider font-medium">Content</label>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-white/15 font-mono">content.md</span>
                {charLimit && (
                  <span className={`text-[10px] font-mono ${charCount > charLimit ? 'text-red-400' : 'text-white/20'}`}>
                    {charCount}/{charLimit}
                  </span>
                )}
              </div>
            </div>
            <textarea
              value={content}
              onChange={e => { setContent(e.target.value); setPost({ ...post, content: e.target.value }) }}
              onBlur={() => { saveContent(); save({ content }) }}
              placeholder="Write your post content..."
              rows={10}
              className="w-full bg-transparent text-white/80 outline-none text-sm resize-y leading-relaxed"
            />
          </div>

          {/* CTA */}
          <div className="glass glass-border rounded-xl p-4">
            <label className="text-[11px] text-white/30 uppercase tracking-wider font-medium block mb-2">CTA</label>
            <input
              value={post.cta}
              onChange={e => setPost({ ...post, cta: e.target.value })}
              onBlur={() => save({ cta: post.cta })}
              placeholder="Call to action..."
              className="w-full bg-transparent text-white/90 outline-none text-sm"
            />
          </div>

          {/* Assets (images/videos for post) */}
          <div className="glass glass-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-[11px] text-white/30 uppercase tracking-wider font-medium">Assets</label>
              <button onClick={() => assetRef.current?.click()} className="text-[11px] text-white/40 hover:text-white/70 font-medium transition-colors">+ Upload image/video</button>
            </div>
            <input ref={assetRef} type="file" accept="image/*,video/*" className="hidden" onChange={e => { if (e.target.files?.length) uploadAsset(e.target.files) }} />
            {project?.exports.length === 0 && (
              <p className="text-sm text-white/15">No assets yet. Upload images or videos for this post.</p>
            )}
            {project?.exports.map((f, i) => (
              <div key={f.path} className="flex items-center gap-3 py-2 border-b border-white/[0.03] last:border-0">
                <span className="text-white/15">{f.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? '🖼' : '🎬'}</span>
                <span className="text-sm text-white/60 flex-1 truncate">{f.filename}</span>
                <span className="text-[10px] text-white/20">{formatSize(f.size)}</span>
              </div>
            ))}
          </div>

          {/* Post URL */}
          <div className="glass glass-border rounded-xl p-4">
            <label className="text-[11px] text-white/30 uppercase tracking-wider font-medium block mb-2">Post URL</label>
            <input
              value={post.url || ''}
              onChange={e => setPost({ ...post, url: e.target.value || null })}
              onBlur={() => save({ url: post.url })}
              placeholder="URL after posting..."
              className="w-full bg-transparent text-white/50 outline-none text-sm"
            />
          </div>

          {/* Notes */}
          <div className="glass glass-border rounded-xl p-4">
            <label className="text-[11px] text-white/30 uppercase tracking-wider font-medium block mb-2">Notes</label>
            <textarea
              value={post.notes}
              onChange={e => setPost({ ...post, notes: e.target.value })}
              onBlur={() => save({ notes: post.notes })}
              placeholder="Additional notes..."
              rows={3}
              className="w-full bg-transparent text-white/70 outline-none text-sm resize-y"
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {project?.folderPath && (
            <div className="glass glass-border rounded-xl p-4">
              <label className="text-[11px] text-white/30 uppercase tracking-wider font-medium block mb-2">Project Folder</label>
              <button
                onClick={() => { navigator.clipboard.writeText(project.folderPath) }}
                className="text-[11px] text-white/40 hover:text-white/60 font-mono break-all text-left transition-colors"
                title="Click to copy path"
              >
                {project.folderPath}
              </button>
              <div className="text-[9px] text-white/15 mt-1">Click to copy — open in Finder/Grammarly</div>
            </div>
          )}

          <div className="glass glass-border rounded-xl p-4">
            <label className="text-[11px] text-white/30 uppercase tracking-wider font-medium block mb-2">Status</label>
            <div className="space-y-0.5">
              {POST_STATUS_ORDER.map(s => (
                <button
                  key={s}
                  onClick={() => changeStatus(s)}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-all ${
                    post.status === s ? 'text-white font-medium' : 'text-white/25 hover:text-white/50 hover:bg-white/[0.03]'
                  }`}
                  style={post.status === s ? { backgroundColor: POST_STATUS_COLORS[s] + '20', color: POST_STATUS_COLORS[s] } : undefined}
                >
                  {POST_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          <div className="glass glass-border rounded-xl p-4">
            <label className="text-[11px] text-white/30 uppercase tracking-wider font-medium block mb-2">Platform</label>
            <div className="text-sm text-purple-400 font-medium px-3 py-1.5">{PLATFORM_LABELS[post.platform]}</div>
          </div>

          <div className="glass glass-border rounded-xl p-4">
            <label className="text-[11px] text-white/30 uppercase tracking-wider font-medium block mb-2">Category</label>
            <div className="space-y-0.5">
              {(['building', 'studying', 'workout'] as Category[]).map(cat => (
                <button
                  key={cat}
                  onClick={() => { setPost({ ...post, category: cat }); save({ category: cat }) }}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-sm capitalize transition-all ${
                    post.category === cat ? 'font-medium' : 'text-white/25 hover:text-white/50 hover:bg-white/[0.03]'
                  }`}
                  style={post.category === cat ? { backgroundColor: CATEGORY_COLORS[cat] + '15', color: CATEGORY_COLORS[cat] } : undefined}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="text-[11px] text-white/15 space-y-1 px-1">
            <div>Created {new Date(post.createdAt).toLocaleDateString()}</div>
            <div>Updated {new Date(post.updatedAt).toLocaleDateString()}</div>
            {post.postedAt && <div>Posted {new Date(post.postedAt).toLocaleDateString()}</div>}
            <div className="font-mono text-[10px] text-white/10">{post.id}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr)
  const day = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() - ((day + 6) % 7))
  const jan1 = new Date(monday.getFullYear(), 0, 1)
  const weekNum = Math.ceil(((monday.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
  return `${monday.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 50)
}
