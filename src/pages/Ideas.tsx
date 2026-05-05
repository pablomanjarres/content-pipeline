import { useEffect, useRef, useState } from 'react'
import {
  getIdeas,
  createIdea,
  updateIdea,
  convertIdea,
  deleteIdea,
  uploadIdeaPhoto,
  deleteIdeaPhoto,
} from '../lib/api'
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
  const [pageDragOver, setPageDragOver] = useState(false)
  const [uploadingForIdea, setUploadingForIdea] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const newIdeaInputRef = useRef<HTMLInputElement>(null)

  const load = () => getIdeas().then(setIdeas)
  useEffect(() => { load() }, [])

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return
      const items = e.clipboardData?.items
      if (!items) return
      const files: File[] = []
      for (const item of Array.from(items)) {
        if (item.kind !== 'file') continue
        if (!item.type.startsWith('image/')) continue
        const f = item.getAsFile()
        if (f) files.push(f)
      }
      if (files.length === 0) return
      e.preventDefault()
      const dt = new DataTransfer()
      for (const f of files) dt.items.add(f)
      handleQuickPhotoIdea(dt.files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  async function handleAdd() {
    if (!title.trim()) return
    await createIdea({ title: title.trim(), description, hook, category })
    setTitle('')
    setDescription('')
    setHook('')
    setShowAdd(false)
    load()
  }

  async function handleConvert(id: string) {
    const video = await convertIdea(id)
    onOpenVideo(video.id)
  }

  async function handleDelete(id: string) {
    await deleteIdea(id)
    load()
  }

  async function handleUploadToIdea(ideaId: string, files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    setUploadingForIdea(ideaId)
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) {
          setError(`Skipped ${file.name} — not an image`)
          continue
        }
        await uploadIdeaPhoto(ideaId, file)
      }
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'Upload failed')
    } finally {
      setUploadingForIdea(null)
    }
  }

  async function handleQuickPhotoIdea(files: FileList | null) {
    if (!files || files.length === 0) return
    const photos = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (photos.length === 0) {
      setError('Drop only images here')
      return
    }
    setError(null)
    try {
      const idea = await createIdea({ title: 'Untitled photo idea', category: 'building' })
      for (const file of photos) {
        await uploadIdeaPhoto(idea.id, file)
      }
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'Upload failed')
    }
  }

  async function handleRemovePhoto(ideaId: string, path: string) {
    await deleteIdeaPhoto(ideaId, path)
    load()
  }

  async function handlePatch(ideaId: string, patch: Partial<Idea>) {
    await updateIdea(ideaId, patch)
    await load()
  }

  const unconverted = ideas.filter((i) => !i.convertedToVideoId)
  const converted = ideas.filter((i) => i.convertedToVideoId)

  return (
    <div
      className="min-h-[60vh]"
      onDragOver={(e) => { e.preventDefault(); setPageDragOver(true) }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setPageDragOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setPageDragOver(false)
        handleQuickPhotoIdea(e.dataTransfer.files)
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Ideas</h1>
          <p className="text-[12px] text-white/40 mt-0.5">Drop or paste (⌘V) photos anywhere to start a new idea, or attach to an existing one.</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="bg-white text-black px-3 py-1.5 rounded-md text-sm font-medium hover:bg-zinc-200 transition-colors cursor-pointer"
        >
          + New Idea
        </button>
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 rounded-md bg-red-500/15 text-red-200 text-[12px] border border-red-500/30">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-100/70 hover:text-red-50 cursor-pointer">×</button>
        </div>
      )}

      <DropTarget
        active={pageDragOver}
        onPick={(files) => handleQuickPhotoIdea(files)}
      />

      {showAdd && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-4 space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-zinc-500 block mb-1">Title</label>
              <input
                ref={newIdeaInputRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Idea..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm outline-none focus:border-zinc-500"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm outline-none cursor-pointer"
              >
                <option value="building">Building</option>
                <option value="studying">Studying</option>
                <option value="workout">Workout</option>
                <option value="gtm">GTM</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Hook</label>
            <input
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              placeholder="Opening hook line..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm outline-none focus:border-zinc-500"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Notes</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description, angles, notes..."
              rows={2}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm outline-none focus:border-zinc-500 resize-none"
            />
          </div>
          <button onClick={handleAdd} className="bg-emerald-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-emerald-500 cursor-pointer">
            Save Idea
          </button>
        </div>
      )}

      {unconverted.length === 0 && !showAdd && (
        <p className="text-zinc-500 text-sm">No ideas yet. Drop a photo or capture one.</p>
      )}

      <div className="space-y-3">
        {unconverted.map((idea) => (
          <IdeaCard
            key={idea.id}
            idea={idea}
            uploading={uploadingForIdea === idea.id}
            onUpload={(files) => handleUploadToIdea(idea.id, files)}
            onConvert={() => handleConvert(idea.id)}
            onDelete={() => handleDelete(idea.id)}
            onRemovePhoto={(path) => handleRemovePhoto(idea.id, path)}
            onPatch={(patch) => handlePatch(idea.id, patch)}
          />
        ))}
      </div>

      {converted.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm text-zinc-500 mb-2">Converted ({converted.length})</h3>
          <div className="space-y-1">
            {converted.map((idea) => (
              <div key={idea.id} className="text-sm text-zinc-600 flex items-center gap-2">
                <span>✓</span>
                <span className="line-through">{idea.title}</span>
                <button
                  onClick={() => idea.convertedToVideoId && onOpenVideo(idea.convertedToVideoId)}
                  className="text-xs text-zinc-500 hover:text-white cursor-pointer"
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

function DropTarget({ active, onPick }: { active: boolean; onPick: (files: FileList | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div
      onClick={() => inputRef.current?.click()}
      className={`mb-4 rounded-xl border-2 border-dashed transition-colors flex flex-col items-center justify-center py-8 px-4 cursor-pointer ${
        active ? 'border-orange-400/70 bg-orange-400/5' : 'border-white/[0.12] bg-white/[0.02] hover:bg-white/[0.04]'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => onPick(e.target.files)}
      />
      <div className="text-2xl text-white/40">+</div>
      <div className="text-[12px] text-white/40 mt-1">
        {active ? 'Drop to create a new idea' : 'Drop photos or click to upload'}
      </div>
    </div>
  )
}

function IdeaCard({
  idea,
  uploading,
  onUpload,
  onConvert,
  onDelete,
  onRemovePhoto,
  onPatch,
}: {
  idea: Idea
  uploading: boolean
  onUpload: (files: FileList | null) => void
  onConvert: () => void
  onDelete: () => void
  onRemovePhoto: (path: string) => void
  onPatch: (patch: Partial<Idea>) => Promise<void>
}) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState(idea.title || '')
  const [hook, setHook] = useState(idea.hook || '')
  const [description, setDescription] = useState(idea.description || '')
  const [category, setCategory] = useState<Category | null>(idea.category)
  const photos = idea.mediaPaths || []

  useEffect(() => {
    setTitle(idea.title || '')
    setHook(idea.hook || '')
    setDescription(idea.description || '')
    setCategory(idea.category)
  }, [idea.id, idea.title, idea.hook, idea.description, idea.category])

  async function commit<K extends keyof Idea>(key: K, value: Idea[K]) {
    if ((idea as any)[key] === value) return
    try {
      await onPatch({ [key]: value } as Partial<Idea>)
    } catch (e) {
      console.error('idea patch failed', e)
    }
  }

  return (
    <div
      className={`rounded-lg border p-4 group transition-colors ${
        dragOver ? 'border-orange-400/70 bg-orange-400/5' : 'border-zinc-800 bg-zinc-900'
      }`}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }}
      onDragLeave={(e) => { e.stopPropagation(); setDragOver(false) }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setDragOver(false)
        onUpload(e.dataTransfer.files)
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-1.5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => commit('title', title)}
            placeholder="Untitled photo idea"
            className="w-full font-medium bg-transparent border-0 outline-none focus:bg-white/[0.04] focus:px-1.5 focus:-mx-1.5 rounded transition-colors"
          />
          <input
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            onBlur={() => commit('hook', hook)}
            placeholder="Hook line…"
            className="w-full text-sm text-amber-400 bg-transparent border-0 outline-none placeholder:text-amber-400/30 focus:bg-white/[0.04] focus:px-1.5 focus:-mx-1.5 rounded transition-colors"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => commit('description', description)}
            placeholder="Notes, angles, description…"
            rows={2}
            className="w-full text-sm text-zinc-400 bg-transparent border-0 outline-none resize-none placeholder:text-zinc-600 focus:bg-white/[0.04] focus:px-1.5 focus:-mx-1.5 rounded transition-colors"
          />
          <div className="flex items-center gap-2 mt-1">
            <select
              value={category || 'building'}
              onChange={(e) => {
                const next = e.target.value as Category
                setCategory(next)
                commit('category', next)
              }}
              className="text-xs text-zinc-400 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 capitalize cursor-pointer"
            >
              <option value="building">Building</option>
              <option value="studying">Studying</option>
              <option value="workout">Workout</option>
              <option value="gtm">GTM</option>
            </select>
            <span className="text-xs text-zinc-600">
              {new Date(idea.createdAt).toLocaleDateString()}
            </span>
            {photos.length > 0 && (
              <span className="text-xs text-zinc-500">{photos.length} photo{photos.length === 1 ? '' : 's'}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="text-xs bg-white/5 text-white/70 px-2.5 py-1 rounded hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {uploading ? 'Uploading…' : '+ Photo'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => onUpload(e.target.files)}
          />
          <button
            onClick={onConvert}
            className="text-xs bg-emerald-600/20 text-emerald-400 px-2.5 py-1 rounded hover:bg-emerald-600/30 transition-colors cursor-pointer"
          >
            → Video
          </button>
          <button
            onClick={onDelete}
            className="text-xs text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          >
            ✕
          </button>
        </div>
      </div>

      {photos.length > 0 && (
        <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {photos.map((path) => (
            <div key={path} className="relative group/photo aspect-square rounded-md overflow-hidden bg-black/30">
              <img
                src={`/api/media/serve?path=${encodeURIComponent(path)}`}
                className="w-full h-full object-cover"
                alt=""
              />
              <button
                onClick={() => onRemovePhoto(path)}
                title="Remove photo"
                className="absolute top-1 right-1 px-1.5 py-0.5 text-[10px] rounded bg-black/70 text-white/80 opacity-0 group-hover/photo:opacity-100 transition-opacity hover:text-red-300 cursor-pointer"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
