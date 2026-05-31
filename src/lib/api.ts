import type { Video, Clip, Idea, Post, Status, PostStatus, Repo, Generation, ReplyRequest, TonePreset, CommitEntry, OutreachTemplate, GeneratorRun, MediaStatus, MediaKind, SentDm, OutboundThread, OutboundStatus, Trigger, TimelineEntry, TimelineAttachment } from './types'

const BASE = '/api'

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.text()
      const parsed = body ? JSON.parse(body) : null
      detail = parsed?.error ? ` ${parsed.error}` : (body ? ` ${body.slice(0, 200)}` : '')
    } catch { /* ignore */ }
    throw new Error(`API error: ${res.status}${detail}`)
  }
  return res.json()
}

// Videos
export const getVideos = () => json<Video[]>('/videos')
export const getVideo = (id: string) => json<Video>(`/videos/${id}`)
export const createVideo = (data: Partial<Video>) => json<Video>('/videos', { method: 'POST', body: JSON.stringify(data) })
export const updateVideo = (id: string, data: Partial<Video>) => json<Video>(`/videos/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const updateVideoStatus = (id: string, status: Status) => json<Video>(`/videos/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
export const deleteVideo = (id: string) => json<{ success: boolean }>(`/videos/${id}`, { method: 'DELETE' })
export async function uploadShortVideoClip(id: string, file: File): Promise<Video> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(`${BASE}/videos/${id}/upload-clip`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
  return res.json()
}

// Clips
export const getClips = () => json<Clip[]>('/clips')
export const createClip = (data: Partial<Clip>) => json<Clip>('/clips', { method: 'POST', body: JSON.stringify(data) })
export const deleteClip = (id: string) => json<{ success: boolean }>(`/clips/${id}`, { method: 'DELETE' })

// Ideas
export const getIdeas = () => json<Idea[]>('/ideas')
export const createIdea = (data: Partial<Idea>) => json<Idea>('/ideas', { method: 'POST', body: JSON.stringify(data) })
export const updateIdea = (id: string, data: Partial<Idea>) => json<Idea>(`/ideas/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const convertIdea = (id: string) => json<Video>(`/ideas/${id}/convert`, { method: 'POST' })
export const deleteIdea = (id: string) => json<{ success: boolean }>(`/ideas/${id}`, { method: 'DELETE' })
export async function uploadIdeaPhoto(id: string, file: File): Promise<Idea> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(`${BASE}/ideas/${id}/upload-photo`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
  return res.json()
}
export const deleteIdeaPhoto = (id: string, path: string) =>
  json<Idea>(`/ideas/${id}/photos?path=${encodeURIComponent(path)}`, { method: 'DELETE' })

// Posts
export const getPosts = () => json<Post[]>('/posts')
export const getPost = (id: string) => json<Post>(`/posts/${id}`)
export const createPost = (data: Partial<Post>) => json<Post>('/posts', { method: 'POST', body: JSON.stringify(data) })
export const updatePost = (id: string, data: Partial<Post>) => json<Post>(`/posts/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const updatePostStatus = (id: string, status: PostStatus) => json<Post>(`/posts/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
export const updatePostMedia = (id: string, data: { mediaPath?: string | null; mediaKind?: MediaKind | null; mediaStatus?: MediaStatus }) =>
  json<Post>(`/posts/${id}/media`, { method: 'PATCH', body: JSON.stringify(data) })
export async function uploadPostMedia(id: string, file: File): Promise<Post> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(`${BASE}/posts/${id}/upload-media`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
  return res.json()
}
export const deletePost = (id: string) => json<{ success: boolean }>(`/posts/${id}`, { method: 'DELETE' })

// Generator Runs
export const getGeneratorRuns = () => json<GeneratorRun[]>('/generator-runs')
export const getLatestGeneratorRun = async (): Promise<GeneratorRun | null> => {
  const res = await fetch(`${BASE}/generator-runs/latest`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}
export const getGeneratorRun = (id: string) => json<GeneratorRun>(`/generator-runs/${id}`)
export const createGeneratorRun = (data: Partial<GeneratorRun>) =>
  json<GeneratorRun>('/generator-runs', { method: 'POST', body: JSON.stringify(data) })
export const updateGeneratorRun = (id: string, data: Partial<GeneratorRun>) =>
  json<GeneratorRun>(`/generator-runs/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteGeneratorRun = (id: string, options?: { cascade?: boolean }) =>
  json<{ success: boolean; deletedPosts?: number; deletedVideo?: boolean }>(
    `/generator-runs/${id}${options?.cascade ? '?cascade=content' : ''}`,
    { method: 'DELETE' },
  )

// Stats
export const getStats = () => json<{
  totalVideos: number
  totalClips: number
  totalIdeas: number
  totalPosts: number
  byStatus: Record<string, number>
  byCategory: Record<string, number>
  postsByStatus: Record<string, number>
}>('/stats')

// Weekly tracker
export type WeeklyData = Record<string, Record<string, string | boolean>>
export const getWeekly = (weekKey: string) => json<WeeklyData>(`/weekly/${encodeURIComponent(weekKey)}`)
export const updateWeekly = (weekKey: string, data: WeeklyData) =>
  json<WeeklyData>(`/weekly/${encodeURIComponent(weekKey)}`, { method: 'PUT', body: JSON.stringify(data) })

// Media
export const getMediaFiles = () => json<string[]>('/media')

export interface MediaItem {
  filename: string
  path: string
  size: number
  date: string
  weekKey: string
  modified: string
  type: 'video' | 'image' | 'file'
}
export const getMediaLibrary = () => json<MediaItem[]>('/media/all')

export interface StorageInfo {
  projectRoot: string
  dataRoot: string
  configPath: string
  iCloudBacked: boolean
  activeProject: {
    id: string
    name: string
    mediaDir: string
    imagesDir?: string
  }
}
export const getStorageInfo = () => json<StorageInfo>('/storage')

export interface MediaVersion {
  filename: string
  path: string
  size: number
  modified: string
}
export const getMediaVersions = (featureDir: string) =>
  json<MediaVersion[]>(`/media/versions?feature=${encodeURIComponent(featureDir)}`)

// Premiere
export interface PremiereProject {
  name: string
  path: string
  folder: string
  relPath: string
  modified: string
  size: number
  kind: 'feature' | 'standalone'
  videoPath: string | null
  exportsCount: number
}
export const getPremiereProjects = () => json<PremiereProject[]>('/premiere/projects')
export const openInPremiere = (path: string) =>
  json<{ ok: boolean; opened: string }>('/premiere/open', { method: 'POST', body: JSON.stringify({ path }) })
export const revealInFinder = (path: string) =>
  json<{ ok: boolean; revealed: string }>('/premiere/reveal', { method: 'POST', body: JSON.stringify({ path }) })

// Actions (Claude Code queue)
export interface Action {
  id: string
  type: string
  videoId: string | null
  videoTitle: string | null
  params: Record<string, any>
  status: 'pending' | 'running' | 'done' | 'failed'
  result: string | null
  createdAt: string
  completedAt: string | null
}

export const getActions = () => json<Action[]>('/actions')
export const getPendingActions = () => json<Action[]>('/actions/pending')
export const createAction = (data: { type: string; videoId?: string; videoTitle?: string; params?: Record<string, any> }) =>
  json<Action>('/actions', { method: 'POST', body: JSON.stringify(data) })
export const deleteAction = (id: string) => json<{ success: boolean }>(`/actions/${id}`, { method: 'DELETE' })

// Repos
export const getRepos = () => json<Repo[]>('/repos')
export const addRepo = (data: { name: string; path: string }) => json<Repo>('/repos', { method: 'POST', body: JSON.stringify(data) })
export const getRepoActivity = (repoId: string, from: string, to: string) =>
  json<CommitEntry[]>(`/repos/${repoId}/activity?from=${from}&to=${to}`)

// Generations
export const getGenerations = () => json<Generation[]>('/generations')
export const createGeneration = (data: { repoId: string; tone: TonePreset; dateFrom: string; dateTo: string }) =>
  json<Generation>('/generations', { method: 'POST', body: JSON.stringify(data) })
export const updateGeneration = (id: string, data: Partial<Generation>) =>
  json<Generation>(`/generations/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const applyGeneration = (id: string, index: number) =>
  json<{ postId?: string; videoId?: string }>(`/generations/${id}/apply/${index}`, { method: 'POST' })

// Replies
export const getReplyHistory = () => json<ReplyRequest[]>('/replies')
export const createReplyRequest = (data: { originalPost: string; platform: string; tone: TonePreset }) =>
  json<ReplyRequest>('/replies', { method: 'POST', body: JSON.stringify(data) })

// Templates
export const getTemplates = () => json<OutreachTemplate[]>('/templates')
export const createTemplate = (data: Omit<OutreachTemplate, 'id' | 'createdAt'>) =>
  json<OutreachTemplate>('/templates', { method: 'POST', body: JSON.stringify(data) })
export const updateTemplate = (id: string, data: Partial<OutreachTemplate>) =>
  json<OutreachTemplate>(`/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteTemplate = (id: string) =>
  json<void>(`/templates/${id}`, { method: 'DELETE' })

// Sent DMs
export const getSentDms = () => json<SentDm[]>('/sent-dms')
export const createSentDm = (data: Omit<SentDm, 'id' | 'createdAt' | 'updatedAt'>) =>
  json<SentDm>('/sent-dms', { method: 'POST', body: JSON.stringify(data) })
export const updateSentDm = (id: string, data: Partial<SentDm>) =>
  json<SentDm>(`/sent-dms/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const setSentDmStatus = (id: string, status: 'draft' | 'sent') =>
  json<SentDm>(`/sent-dms/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
export const deleteSentDm = (id: string) =>
  json<void>(`/sent-dms/${id}`, { method: 'DELETE' })

// Outbound (openclaw X pipeline)
export type OutboundSort = 'newest' | 'oldest' | 'quality' | 'tier'
export interface OutboundFilters {
  qualityMin?: number
  qualityGatePassed?: boolean
  tier?: string[]      // CSV-encoded; 'none' matches null/undefined
  postKind?: string[]  // CSV-encoded; 'none' matches null/undefined
  hasDms?: boolean
  q?: string
  sort?: OutboundSort
}
export const getOutbound = (
  status?: OutboundStatus,
  platform?: string,
  filters?: OutboundFilters,
) => {
  const qs = new URLSearchParams()
  if (status) qs.set('status', status)
  if (platform) qs.set('platform', platform)
  if (filters) {
    if (typeof filters.qualityMin === 'number' && filters.qualityMin > 0) qs.set('qualityMin', String(filters.qualityMin))
    if (typeof filters.qualityGatePassed === 'boolean') qs.set('qualityGatePassed', filters.qualityGatePassed ? 'true' : 'false')
    if (filters.tier && filters.tier.length > 0) qs.set('tier', filters.tier.join(','))
    if (filters.postKind && filters.postKind.length > 0) qs.set('postKind', filters.postKind.join(','))
    if (typeof filters.hasDms === 'boolean') qs.set('hasDms', filters.hasDms ? 'true' : 'false')
    if (filters.q && filters.q.trim()) qs.set('q', filters.q.trim())
    if (filters.sort && filters.sort !== 'newest') qs.set('sort', filters.sort)
  }
  const q = qs.toString()
  return json<OutboundThread[]>(`/outbound${q ? `?${q}` : ''}`)
}
// Flattened sent items: one row per sent draft + one row per logged sent-dm.
// Counts on the Sent page reflect actual sends, not "thread fully sent".
export type SentItemOrigin = 'outbound' | 'sent-dms'
export interface SentItem {
  id: string
  origin: SentItemOrigin
  platform: 'x' | 'linkedin' | 'reddit'
  kind: 'reply' | 'dm' | 'repost'
  authorHandle: string
  message: string
  contextText: string | null
  contextUrl: string | null
  sentAt: string
  threadStatus?: 'sent' | 'partial_sent'
  threadId?: string
}
export const getSent = (platform?: string) => {
  const q = platform ? `?platform=${platform}` : ''
  return json<SentItem[]>(`/outbound/sent${q}`)
}
export const getOutboundThread = (id: string) =>
  json<OutboundThread>(`/outbound/${id}`)

// Mars RAG search (proxied to the local mars-rag server on 127.0.0.1:7374).
export interface RagResult { path: string; title: string; snippet: string; score: number }
export const searchMars = (query: string, k = 5) =>
  json<{ results: RagResult[] }>('/rag/search', {
    method: 'POST', body: JSON.stringify({ query, k }),
  })

// Algolia federated search (server-side; admin key never reaches the browser).
export type AlgoliaIndexName = 'leads_index' | 'dms_index' | 'voice_anchors_index'
export interface AlgoliaSearchResult { hits: Array<Record<string, any> & { objectID: string }>; nbHits: number }
export const algoliaSearch = (index: AlgoliaIndexName, q: string) =>
  json<AlgoliaSearchResult>(`/algolia/search?index=${encodeURIComponent(index)}&q=${encodeURIComponent(q)}`)
export const algoliaReindex = () =>
  json<{ ok: boolean; indexed: { dms: number; voice_anchors: number; leads: number } }>(
    '/algolia/reindex', { method: 'POST' })

// Cap status for the per-platform 500-active-lead guard.
export interface CapStatus { active: number; cap: number; full: boolean }
export const getCapStatus = () =>
  json<Record<'x' | 'linkedin' | 'reddit', CapStatus>>('/outbound/cap-status')

export const updateOutbound = (id: string, data: Partial<OutboundThread>) =>
  json<OutboundThread>(`/outbound/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const requestOutboundRedraft = async (leadId: string) => {
  const res = await fetch('http://127.0.0.1:7373/redraft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leadId }),
  })
  if (!res.ok) throw new Error(`redraft request failed: ${res.status}`)
}

// Batches. `getBatchInfo` and `closeCurrentBatch` are CP-owned (read from
// outbound.json + outbound-meta.json on the CP server). `openNextBatch` still
// pokes the drafter HTTP server on 127.0.0.1:7373 — that's where new leads get
// fetched and drafted, which is still drafter's job.
export type BatchInfo = {
  open: { id: string, number: number, status: string, size_target: number, opened_at: string } | null
  progress: { total: number, drafted: number, sent: number, skipped: number } | null
  todayCount: number
  dailyCap: number
  batchSize: number
}
export const getBatchInfo = (platform: string = 'x') =>
  json<BatchInfo>(`/outbound/batch-current?platform=${encodeURIComponent(platform)}`)
export const openNextBatch = async (): Promise<{ ok: boolean, reason?: string, batch?: any }> => {
  const res = await fetch('http://127.0.0.1:7373/batches/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  return res.json()
}
export const closeCurrentBatch = (platform: string = 'x') =>
  json<{ ok: boolean, closedBatch: number }>(`/outbound/batch-close?platform=${encodeURIComponent(platform)}`, { method: 'POST' })

export const getOutboundStats = () =>
  json<{ last_hour: number, last_24h: number, by_hour: Array<{ hour: string, n: number }> }>('/outbound/stats')

// Watchlist handles — tiered list of accounts the radar polls.
export type WatchlistTier = 'T1' | 'T2' | 'T3'
export interface WatchlistHandle {
  id: string
  name: string
  x_handle: string | null
  linkedin_url: string | null
  tier: WatchlistTier
  enabled: boolean
  notes: string | null
  last_polled_x: string | null
  last_polled_li: string | null
  last_post_id_x: string | null
  last_post_id_li: string | null
  created_at: string
  updated_at: string
}
export type WatchlistStats = Record<WatchlistTier, {
  total: number
  enabled: number
  mostRecentXPoll: string | null
  mostRecentLiPoll: string | null
}>
export const getWatchlistHandles = () => json<WatchlistHandle[]>('/watchlist/handles')
export const createWatchlistHandle = (data: Partial<WatchlistHandle>) =>
  json<WatchlistHandle>('/watchlist/handles', { method: 'POST', body: JSON.stringify(data) })
export const updateWatchlistHandle = (id: string, data: Partial<WatchlistHandle>) =>
  json<WatchlistHandle>(`/watchlist/handles/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteWatchlistHandle = (id: string) =>
  json<{ ok: boolean; id: string }>(`/watchlist/handles/${id}`, { method: 'DELETE' })
export const getWatchlistStats = () => json<WatchlistStats>('/watchlist/stats')

// Timeline (weekly build planner). Date is YYYY-MM-DD and is the primary key.
// File uploads use FormData against the existing multer-backed /attach endpoint;
// everything else goes through the typed json<T>() wrapper.
export const getTimeline = () => json<TimelineEntry[]>('/timeline')
export const getTimelineRange = (start: string, end: string) =>
  json<TimelineEntry[]>(`/timeline/range?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`)
export const getTimelineEntry = (date: string) => json<TimelineEntry>(`/timeline/${encodeURIComponent(date)}`)
export const updateTimelineEntry = (date: string, data: Partial<TimelineEntry>) =>
  json<TimelineEntry>(`/timeline/${encodeURIComponent(date)}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteTimelineEntry = (date: string) =>
  json<{ ok: boolean }>(`/timeline/${encodeURIComponent(date)}`, { method: 'DELETE' })
export const deleteTimelineAttachment = (date: string, attachId: string) =>
  json<{ ok: boolean }>(`/timeline/${encodeURIComponent(date)}/attach/${encodeURIComponent(attachId)}`, { method: 'DELETE' })
export async function uploadTimelineAttachment(date: string, file: File): Promise<TimelineAttachment> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(`${BASE}/timeline/${encodeURIComponent(date)}/attach`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
  return res.json()
}

// Triggers (managed in CP, written to Supabase via the openclaw bridge endpoint)
export const getTriggers = () => json<Trigger[]>('/triggers')
export const createTrigger = (data: { phrase: string, notes?: string }) =>
  json<Trigger>('/triggers', { method: 'POST', body: JSON.stringify(data) })
export const updateTrigger = (id: string, data: Partial<Trigger>) =>
  json<Trigger>(`/triggers/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteTrigger = (id: string) =>
  json<{ success: boolean }>(`/triggers/${id}`, { method: 'DELETE' })
