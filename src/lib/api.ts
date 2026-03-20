import type { Video, Clip, Idea, Status } from './types'

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

// Stats
export const getStats = () => json<{
  totalVideos: number
  totalClips: number
  totalIdeas: number
  byStatus: Record<string, number>
  byCategory: Record<string, number>
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
