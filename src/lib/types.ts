export type Status = 'idea' | 'scripted' | 'filming' | 'editing' | 'ready' | 'scheduled' | 'posted'

export type Category = 'building' | 'studying' | 'workout'

export type Platform = 'instagram' | 'tiktok' | 'youtube' | 'linkedin' | 'x' | 'reddit'

export const VIDEO_PLATFORMS: Platform[] = ['instagram', 'tiktok', 'youtube']
export const POST_PLATFORMS: Platform[] = ['linkedin', 'x', 'reddit']
export const ALL_PLATFORMS: Platform[] = [...VIDEO_PLATFORMS, ...POST_PLATFORMS]

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  x: 'X',
  reddit: 'Reddit',
}

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

export type PostStatus = 'draft' | 'written' | 'scheduled' | 'posted'

export type PostPlatform = 'linkedin' | 'x' | 'reddit'

export interface Post {
  id: string
  title: string
  platform: PostPlatform
  status: PostStatus
  category: Category
  content: string
  hook: string
  cta: string
  linkedVideoId: string | null
  url: string | null
  tags: string[]
  notes: string
  createdAt: string
  updatedAt: string
  postedAt: string | null
}

export const POST_STATUS_ORDER: PostStatus[] = ['draft', 'written', 'scheduled', 'posted']

export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  draft: 'Draft',
  written: 'Written',
  scheduled: 'Scheduled',
  posted: 'Posted',
}

export const POST_STATUS_COLORS: Record<PostStatus, string> = {
  draft: '#f59e0b',
  written: '#8b5cf6',
  scheduled: '#06b6d4',
  posted: '#22c55e',
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

// --- Content Engine ---

export type TonePreset = 'builder' | 'technical' | 'storytelling'

export const TONE_LABELS: Record<TonePreset, string> = {
  builder: 'Builder',
  technical: 'Technical',
  storytelling: 'Storytelling',
}

export const TONE_DESCRIPTIONS: Record<TonePreset, string> = {
  builder: 'First-person, casual, build-in-public',
  technical: 'Specific, code-focused, metrics',
  storytelling: 'Narrative arc, tension, resolution',
}

export interface Repo {
  id: string
  name: string
  path: string
  createdAt: string
}

export interface CommitEntry {
  hash: string
  date: string
  subject: string
  body: string
}

export interface GeneratedContent {
  platform: 'linkedin' | 'x' | 'script'
  hook: string
  body: string
  cta: string
  hashtags: string[]
}

export type GenerationStatus = 'pending' | 'processing' | 'ready' | 'applied' | 'discarded'

export interface Generation {
  id: string
  repoId: string
  repoName: string
  tone: TonePreset
  dateFrom: string
  dateTo: string
  commits: CommitEntry[]
  content: GeneratedContent[]
  status: GenerationStatus
  createdAt: string
  updatedAt: string
}

export interface ReplyOption {
  mode: string
  text: string
}

export type ReplyStatus = 'pending' | 'processing' | 'ready'

export interface ReplyRequest {
  id: string
  originalPost: string
  platform: PostPlatform | 'x'
  tone: TonePreset
  replies: ReplyOption[]
  status: ReplyStatus
  createdAt: string
  updatedAt: string
}
