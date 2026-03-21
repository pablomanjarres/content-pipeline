import type { Video, Clip, Idea, Post, Status, PostStatus, Repo, Generation, ReplyRequest, TonePreset, CommitEntry } from './types'

const BASE = '/api'

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

// Videos
export const getVideos = () => json<Video[]>('/videos')
export const getVideo = (id: string) => json<Video>(`/videos/${id}`)
export const createVideo = (data: Partial<Video>) => json<Video>('/videos', { method: 'POST', body: JSON.stringify(data) })
export const updateVideo = (id: string, data: Partial<Video>) => json<Video>(`/videos/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const updateVideoStatus = (id: string, status: Status) => json<Video>(`/videos/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
export const deleteVideo = (id: string) => json<{ success: boolean }>(`/videos/${id}`, { method: 'DELETE' })

// Clips
export const getClips = () => json<Clip[]>('/clips')
export const createClip = (data: Partial<Clip>) => json<Clip>('/clips', { method: 'POST', body: JSON.stringify(data) })
export const deleteClip = (id: string) => json<{ success: boolean }>(`/clips/${id}`, { method: 'DELETE' })

// Ideas
export const getIdeas = () => json<Idea[]>('/ideas')
export const createIdea = (data: Partial<Idea>) => json<Idea>('/ideas', { method: 'POST', body: JSON.stringify(data) })
export const convertIdea = (id: string) => json<Video>(`/ideas/${id}/convert`, { method: 'POST' })
export const deleteIdea = (id: string) => json<{ success: boolean }>(`/ideas/${id}`, { method: 'DELETE' })

// Posts
export const getPosts = () => json<Post[]>('/posts')
export const getPost = (id: string) => json<Post>(`/posts/${id}`)
export const createPost = (data: Partial<Post>) => json<Post>('/posts', { method: 'POST', body: JSON.stringify(data) })
export const updatePost = (id: string, data: Partial<Post>) => json<Post>(`/posts/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const updatePostStatus = (id: string, status: PostStatus) => json<Post>(`/posts/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
export const deletePost = (id: string) => json<{ success: boolean }>(`/posts/${id}`, { method: 'DELETE' })

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

// Media
export const getMediaFiles = () => json<string[]>('/media')

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
