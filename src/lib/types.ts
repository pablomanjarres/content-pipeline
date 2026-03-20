export type Status = 'idea' | 'scripted' | 'filming' | 'editing' | 'ready' | 'scheduled' | 'posted'

export type Category = 'building' | 'studying' | 'workout'

export type Platform = 'instagram' | 'tiktok' | 'youtube'

export interface PlatformEntry {
  caption: string
  hashtags: string[]
  posted: boolean
  url: string | null
  postedAt: string | null
}

export interface Video {
  id: string
  title: string
  status: Status
  category: Category
  hook: string
  script: string
  cta: string
  platforms: Record<Platform, PlatformEntry>
  clipPaths: string[]
  tags: string[]
  notes: string
  createdAt: string
  updatedAt: string
}

export interface Clip {
  id: string
  filename: string
  path: string
  duration: string
  category: Category | null
  tags: string[]
  notes: string
  linkedVideoIds: string[]
  createdAt: string
}

export interface Idea {
  id: string
  title: string
  description: string
  category: Category | null
  hook: string
  tags: string[]
  convertedToVideoId: string | null
  createdAt: string
}

export const STATUS_ORDER: Status[] = ['idea', 'scripted', 'filming', 'editing', 'ready', 'scheduled', 'posted']

export const STATUS_LABELS: Record<Status, string> = {
  idea: 'Idea',
  scripted: 'Scripted',
  filming: 'Filming',
  editing: 'Editing',
  ready: 'Ready',
  scheduled: 'Scheduled',
  posted: 'Posted',
}

export const STATUS_COLORS: Record<Status, string> = {
  idea: '#f59e0b',
  scripted: '#8b5cf6',
  filming: '#3b82f6',
  editing: '#ec4899',
  ready: '#10b981',
  scheduled: '#06b6d4',
  posted: '#22c55e',
}

export const CATEGORY_COLORS: Record<Category, string> = {
  building: '#f97316',
  studying: '#6366f1',
  workout: '#ef4444',
}
