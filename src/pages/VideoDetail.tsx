import { useEffect, useState } from 'react'
import { getVideo, updateVideo, updateVideoStatus } from '../lib/api'
import { STATUS_ORDER, STATUS_LABELS, STATUS_COLORS, CATEGORY_COLORS, type Video, type Status, type Category, type Platform } from '../lib/types'

interface Props {
  id: string
  onBack: () => void
}

export function VideoDetail({ id, onBack }: Props) {
  const [video, setVideo] = useState<Video | null>(null)
  const [saving, setSaving] = useState(false)

  const load = () => getVideo(id).then(setVideo)
  useEffect(() => { load() }, [id])

  if (!video) return <div className="text-zinc-500">Loading...</div>

  const save = async (updates: Partial<Video>) => {
    setSaving(true)
    const updated = await updateVideo(id, updates)
    setVideo(updated)
    setTimeout(() => setSaving(false), 500)
  }

  const changeStatus = async (status: Status) => {
    const updated = await updateVideoStatus(id, status)
    setVideo(updated)
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="text-zinc-500 hover:text-white text-sm">← Back</button>
        {saving && <span className="text-xs text-emerald-400">Saved</span>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Title */}
          <input
            value={video.title}
            onChange={e => setVideo({ ...video, title: e.target.value })}
            onBlur={() => save({ title: video.title })}
            className="w-full bg-transparent text-2xl font-bold outline-none border-b border-transparent focus:border-zinc-700 pb-1"
          />

          {/* Hook */}
          <Field
            label="Hook"
            value={video.hook}
            placeholder="Opening hook — first 3 seconds..."
            onChange={v => setVideo({ ...video, hook: v })}
            onBlur={() => save({ hook: video.hook })}
          />

          {/* Script */}
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Script</label>
            <textarea
              value={video.script}
              onChange={e => setVideo({ ...video, script: e.target.value })}
              onBlur={() => save({ script: video.script })}
              placeholder="Full script or talking points..."
              rows={6}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-600 resize-y"
            />
          </div>

          {/* CTA */}
          <Field
            label="CTA"
            value={video.cta}
            placeholder="Call to action..."
            onChange={v => setVideo({ ...video, cta: v })}
            onBlur={() => save({ cta: video.cta })}
          />

          {/* Platform Captions */}
          <div>
            <h3 className="text-sm font-medium mb-2">Platform Captions</h3>
            <div className="space-y-3">
              {(['instagram', 'tiktok', 'youtube'] as Platform[]).map(platform => (
                <div key={platform} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium capitalize text-zinc-400">{platform}</span>
                    <label className="flex items-center gap-2 text-xs text-zinc-500">
                      <input
                        type="checkbox"
                        checked={video.platforms[platform].posted}
                        onChange={e => {
                          const platforms = {
                            ...video.platforms,
                            [platform]: {
                              ...video.platforms[platform],
                              posted: e.target.checked,
                              postedAt: e.target.checked ? new Date().toISOString() : null,
                            },
                          }
                          setVideo({ ...video, platforms })
                          save({ platforms })
                        }}
                        className="rounded"
                      />
                      Posted
                    </label>
                  </div>
                  <textarea
                    value={video.platforms[platform].caption}
                    onChange={e => {
                      const platforms = {
                        ...video.platforms,
                        [platform]: { ...video.platforms[platform], caption: e.target.value },
                      }
                      setVideo({ ...video, platforms })
                    }}
                    onBlur={() => save({ platforms: video.platforms })}
                    placeholder={`${platform} caption...`}
                    rows={2}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm outline-none focus:border-zinc-500 resize-none"
                  />
                  <input
                    value={video.platforms[platform].url || ''}
                    onChange={e => {
                      const platforms = {
                        ...video.platforms,
                        [platform]: { ...video.platforms[platform], url: e.target.value || null },
                      }
                      setVideo({ ...video, platforms })
                    }}
                    onBlur={() => save({ platforms: video.platforms })}
                    placeholder="Post URL..."
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs outline-none focus:border-zinc-500 mt-2 text-zinc-400"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Notes</label>
            <textarea
              value={video.notes}
              onChange={e => setVideo({ ...video, notes: e.target.value })}
              onBlur={() => save({ notes: video.notes })}
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
              {STATUS_ORDER.map(s => (
                <button
                  key={s}
                  onClick={() => changeStatus(s)}
                  className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
                    video.status === s
                      ? 'text-white font-medium'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                  }`}
                  style={video.status === s ? { backgroundColor: STATUS_COLORS[s] + '33', color: STATUS_COLORS[s] } : undefined}
                >
                  {STATUS_LABELS[s]}
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
                  onClick={() => { setVideo({ ...video, category: cat }); save({ category: cat }) }}
                  className={`w-full text-left px-3 py-1.5 rounded text-sm capitalize transition-colors ${
                    video.category === cat
                      ? 'font-medium'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                  }`}
                  style={video.category === cat ? { backgroundColor: CATEGORY_COLORS[cat] + '22', color: CATEGORY_COLORS[cat] } : undefined}
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
              {video.tags.map((tag, i) => (
                <span key={i} className="text-xs bg-zinc-800 rounded px-2 py-0.5 flex items-center gap-1">
                  {tag}
                  <button
                    onClick={() => {
                      const tags = video.tags.filter((_, j) => j !== i)
                      setVideo({ ...video, tags })
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
                  if (val && !video.tags.includes(val)) {
                    const tags = [...video.tags, val]
                    setVideo({ ...video, tags })
                    save({ tags });
                    (e.target as HTMLInputElement).value = ''
                  }
                }
              }}
            />
          </div>

          {/* Meta */}
          <div className="text-xs text-zinc-600 space-y-1">
            <div>Created: {new Date(video.createdAt).toLocaleString()}</div>
            <div>Updated: {new Date(video.updatedAt).toLocaleString()}</div>
            <div className="font-mono text-[10px] text-zinc-700">{video.id}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, placeholder, onChange, onBlur }: {
  label: string; value: string; placeholder: string
  onChange: (v: string) => void; onBlur: () => void
}) {
  return (
    <div>
      <label className="text-xs text-zinc-500 block mb-1">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-600"
      />
    </div>
  )
}
