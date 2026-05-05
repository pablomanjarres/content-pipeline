import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { getPremiereProjects, openInPremiere, revealInFinder, type PremiereProject } from '../lib/api'

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export function Premiere() {
  const [projects, setProjects] = useState<PremiereProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | 'feature' | 'standalone'>('all')

  async function refresh() {
    try {
      const list = await getPremiereProjects()
      setProjects(list)
      setError(null)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 8000)
    return () => clearInterval(iv)
  }, [])

  const filtered = projects.filter((p) => {
    if (kindFilter !== 'all' && p.kind !== kindFilter) return false
    if (filter && !p.name.toLowerCase().includes(filter.toLowerCase()) && !p.relPath.toLowerCase().includes(filter.toLowerCase())) return false
    return true
  })

  const standalone = filtered.filter((p) => p.kind === 'standalone')
  const features = filtered.filter((p) => p.kind === 'feature')

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center justify-between flex-wrap gap-3"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Premiere</h1>
          <p className="text-[12px] text-white/40 mt-1">
            All your Premiere projects under <code className="text-white/60">~/Projects/media</code>. Click to open in Adobe Premiere Pro.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            placeholder="Filter projects…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-black/30 border border-white/10 rounded-md px-3 py-1.5 text-[12px] text-white/80 focus:outline-none focus:border-white/30 w-56"
          />
          <div className="flex items-center gap-1 text-[11px]">
            {(['all', 'feature', 'standalone'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKindFilter(k)}
                className={`px-2 py-1 rounded-md capitalize ${kindFilter === k ? 'bg-white/10 text-white/90' : 'text-white/40 hover:text-white/70'}`}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {loading && <div className="text-white/30 text-[13px]">Loading…</div>}
      {error && <div className="text-red-400 text-[13px]">{error}</div>}

      {!loading && filtered.length === 0 && (
        <div className="glass glass-border rounded-2xl p-8 text-center text-white/40 text-[13px]">
          No Premiere projects match. Drop a <code className="text-white/60">.prproj</code> under <code className="text-white/60">media/premiere/</code> or render a Forge feature to scaffold one.
        </div>
      )}

      {features.length > 0 && (
        <Section
          title="Feature projects"
          subtitle="Per-feature .prproj sitting next to the Forge render"
          items={features}
        />
      )}

      {standalone.length > 0 && (
        <Section
          title="Standalone projects"
          subtitle="Projects under media/premiere/, not tied to a Forge feature"
          items={standalone}
        />
      )}
    </div>
  )
}

function Section({ title, subtitle, items }: { title: string; subtitle: string; items: PremiereProject[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 }}
    >
      <div className="mb-3">
        <h2 className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">{title}</h2>
        <p className="text-[11px] text-white/30">{subtitle}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((p) => (
          <ProjectCard key={p.path} project={p} />
        ))}
      </div>
    </motion.div>
  )
}

function ProjectCard({ project }: { project: PremiereProject }) {
  const [opening, setOpening] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const videoUrl = project.videoPath ? `/api/media/serve?path=${encodeURIComponent(project.videoPath)}` : null

  async function handleOpen() {
    setOpening(true)
    try {
      await openInPremiere(project.path)
      setFlash('opening…')
      setTimeout(() => setFlash(null), 2000)
    } catch (e: any) {
      setFlash(e?.message ?? 'failed')
      setTimeout(() => setFlash(null), 2500)
    } finally {
      setOpening(false)
    }
  }

  async function handleReveal() {
    try {
      await revealInFinder(project.path)
    } catch {}
  }

  async function copyPath() {
    try {
      await navigator.clipboard.writeText(project.folder)
      setFlash('folder path copied')
      setTimeout(() => setFlash(null), 1500)
    } catch {}
  }

  return (
    <motion.div whileHover={{ y: -2 }} className="glass glass-border rounded-2xl p-4 flex flex-col gap-3">
      <div className="aspect-video rounded-lg overflow-hidden bg-black/40 border border-white/[0.04] relative">
        {videoUrl ? (
          <video src={videoUrl} className="w-full h-full object-cover" preload="metadata" muted />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/20 text-[12px]">
            no video sibling
          </div>
        )}
        {project.exportsCount > 0 && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md text-[10px] bg-emerald-500/20 text-emerald-300 font-medium">
            {project.exportsCount} export{project.exportsCount === 1 ? '' : 's'}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-white/90 truncate">{project.name}</div>
            <div className="text-[10px] text-white/30 truncate font-mono mt-0.5" title={project.relPath}>
              {project.relPath}
            </div>
          </div>
          <span className="text-[10px] text-white/30 whitespace-nowrap mt-0.5">
            {relativeTime(project.modified)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleOpen}
          disabled={opening}
          className="text-[11px] font-medium text-emerald-300 hover:text-emerald-200 bg-emerald-500/15 hover:bg-emerald-500/25 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
        >
          {opening ? 'Opening…' : 'Open in Premiere'}
        </button>
        <button
          onClick={handleReveal}
          className="text-[11px] text-white/60 hover:text-white/90 bg-white/[0.04] hover:bg-white/[0.08] px-2.5 py-1.5 rounded-md transition-colors"
        >
          Reveal
        </button>
        <button
          onClick={copyPath}
          className="text-[11px] text-white/60 hover:text-white/90 bg-white/[0.04] hover:bg-white/[0.08] px-2.5 py-1.5 rounded-md transition-colors"
          title={project.folder}
        >
          Copy folder
        </button>
        <span className="text-[10px] text-white/30 ml-auto">{formatSize(project.size)}</span>
      </div>
      {flash && <div className="text-[10px] text-emerald-400">{flash}</div>}
    </motion.div>
  )
}
