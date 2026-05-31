export type Status = 'idea' | 'scripted' | 'filming' | 'editing' | 'ready' | 'scheduled' | 'posted'

export type Category = 'building' | 'studying' | 'workout' | 'gtm'

export type Platform = 'instagram' | 'tiktok' | 'youtube' | 'linkedin' | 'threads' | 'x' | 'reddit'
export type VideoPlatform = 'linkedin' | 'instagram' | 'threads' | 'tiktok' | 'youtube'

export const VIDEO_PLATFORMS: VideoPlatform[] = ['linkedin', 'instagram', 'threads', 'tiktok', 'youtube']
export const POST_PLATFORMS: Platform[] = ['linkedin', 'x', 'reddit']
export const ALL_PLATFORMS: Platform[] = ['instagram', 'tiktok', 'youtube', 'linkedin', 'threads', 'x', 'reddit']

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  threads: 'Threads',
  x: 'X',
  reddit: 'Reddit',
}

export const VIDEO_PLATFORM_LABELS: Record<VideoPlatform, string> = {
  linkedin: 'LinkedIn',
  instagram: 'Instagram Reels',
  threads: 'Threads',
  tiktok: 'TikTok',
  youtube: 'YouTube Shorts',
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
  platforms: Record<VideoPlatform, PlatformEntry>
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
  mediaPaths: string[]
  convertedToVideoId: string | null
  createdAt: string
}

export type PostStatus = 'draft' | 'written' | 'scheduled' | 'posted'

export type PostPlatform = 'linkedin' | 'x' | 'reddit'

export type MediaStatus = 'none' | 'rendering' | 'ready' | 'failed'
export type MediaKind = 'video' | 'image'

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
  mediaPath: string | null
  mediaKind: MediaKind | null
  mediaStatus: MediaStatus
  generatorRunId: string | null
}

export type VoicePostDraftKind = 'x' | 'linkedin' | 'reflection' | 'shortVideo'

export interface VoiceAnchorRef {
  file: string
  excerpt: string
  tags: string[]
}

export interface GeneratorTemplateChoice {
  type: 'existing' | 'ai-create'
  templateId: string
  compositionId: string | null
  params: Record<string, unknown>
  reason: string
}

export type GeneratorRunStatus = 'drafting' | 'rendering' | 'ready' | 'failed'

export interface GeneratorRun {
  id: string
  featureDescription: string
  voiceAnchors: VoiceAnchorRef[]
  templateChoice: GeneratorTemplateChoice | null
  forgeTaskId: string | null
  mediaPath: string | null
  mediaKind: MediaKind | null
  postIds: string[]
  videoId: string | null
  // Short video tied to THIS specific batch. Multiple batches per day can each
  // have their own short. Falls back to weekly[date].daily-video if not set.
  shortVideoId: string | null
  status: GeneratorRunStatus
  error: string | null
  createdAt: string
  updatedAt: string
  scheduledFor: string | null
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
  gtm: '#8b5cf6',
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

export interface OutreachTemplate {
  id: string
  name: string
  platform: Platform
  template: string
  tone: string
  notes: string
  createdAt: string
}

export type OutreachKind = 'dm' | 'reply'
export type OutreachStatus = 'draft' | 'sent'

// --- Outbound (openclaw X pipeline) ---
// AI-drafted reply candidates for X posts surfaced by the openclaw discovery skill.
// Distinct from the Dms surface, which is for manually saved DMs/replies.

export type OutboundAngle = 'empathetic' | 'technical' | 'contrarian'
export type OutboundDraftKind = 'reply' | 'dm' | 'repost'
export type OutboundStatus = 'new' | 'drafted' | 'picked' | 'sent' | 'partial_sent' | 'skipped'

export interface OutboundDraft {
  id: string
  kind: OutboundDraftKind
  angle: OutboundAngle
  body: string
  editedBody: string | null
  charCount: number
  sentAt?: string | null
}

export type OutboundPlatform = 'x' | 'linkedin' | 'reddit'

export const OUTBOUND_PLATFORM_LABELS: Record<OutboundPlatform, string> = {
  x: 'X',
  linkedin: 'LinkedIn',
  reddit: 'Reddit',
}

export type OutboundTier = 'T1' | 'T2' | 'T3'
export type OutboundPostKind = 'question' | 'opinion' | 'announcement' | 'launch' | 'personal' | 'other'

export interface OutboundThread {
  id: string
  leadId: string
  batchNumber: number | null
  platform: OutboundPlatform
  authorHandle: string
  authorId: string
  authorFollowers: number | null
  allowsDms: boolean | null
  originalPostId: string
  originalPostText: string
  originalPostUrl: string
  postedAt: string
  matchedTrigger: string | null
  drafts: OutboundDraft[]
  selectedDraftId: string | null
  status: OutboundStatus
  skipReason: string | null
  createdAt: string
  updatedAt: string
  sentAt: string | null
  // Pipeline-stage signals (optional — null on older records before the
  // watchlist/quality gate landed). Used by the Outbound filter bar.
  qualityScore?: number | null
  qualityGatePassed?: boolean | null
  tier?: OutboundTier | null
  postKind?: OutboundPostKind | string | null
}

export const OUTBOUND_ANGLE_LABELS: Record<OutboundAngle, string> = {
  empathetic: 'Empathetic',
  technical: 'Technical',
  contrarian: 'Contrarian',
}

export const OUTBOUND_KIND_LABELS: Record<OutboundDraftKind, string> = {
  reply: 'Reply',
  dm: 'DM',
  repost: 'Repost',
}

export interface Trigger {
  id: string
  phrase: string
  active: boolean
  notes: string | null
  createdAt: string
}

// --- Timeline (weekly build planner) ---
// Pablo plans his week ahead: each day has "what to build" + optional "what
// shipped" + attached media. Primary key is the YYYY-MM-DD date string.

export type TimelineStatus = 'planned' | 'in-progress' | 'shipped' | 'skipped'

export const TIMELINE_STATUS_ORDER: TimelineStatus[] = ['planned', 'in-progress', 'shipped', 'skipped']

export const TIMELINE_STATUS_LABELS: Record<TimelineStatus, string> = {
  planned: 'Planned',
  'in-progress': 'In progress',
  shipped: 'Shipped',
  skipped: 'Skipped',
}

export const TIMELINE_STATUS_COLORS: Record<TimelineStatus, string> = {
  planned: '#64748b',     // slate
  'in-progress': '#f59e0b', // amber
  shipped: '#22c55e',     // green
  skipped: '#52525b',     // zinc
}

export interface TimelineAttachment {
  id: string
  filename: string
  path: string         // absolute path on server
  kind: 'image' | 'video' | 'other'
  size: number
  uploadedAt: string
}

export interface TimelineEntry {
  date: string                   // YYYY-MM-DD, primary key
  plannedTitle: string
  plannedDescription: string
  actualShipped: string
  status: TimelineStatus
  attachments: TimelineAttachment[]
  createdAt: string
  updatedAt: string
}

export interface SentDm {
  id: string
  kind: OutreachKind
  status: OutreachStatus
  platform: Platform
  recipientName: string
  recipientHandle: string
  message: string
  context: string
  url: string | null
  replyToUrl: string | null
  notes: string
  sentAt: string
  createdAt: string
  updatedAt: string
}
