import type { Category, Video } from './types'

export const DAILY_VIDEO_TASK_KEY = 'daily-video'

export interface DailyVideoGuide {
  contentType: string
  dayRole: string
  category: Category
  brief: string
}

export interface DailyVideoMeta extends DailyVideoGuide {
  topic: string
  title: string
  keyword: string
}

export interface DailyVideoProductionPlan {
  hook: string
  script: string
  cta: string
  bRoll: string
  editIdeas: string
  imageIdea: string
  filmingNotes: string
}

type DailyVideoSeed = Partial<DailyVideoMeta> & Partial<DailyVideoProductionPlan>

const DAY_GUIDES: Record<number, DailyVideoGuide> = {
  1: {
    contentType: 'Reflection',
    dayRole: 'Honesty',
    category: 'building',
    brief: 'Share a real struggle, tradeoff, or shift.',
  },
  2: {
    contentType: 'Tech',
    dayRole: 'Proof of work',
    category: 'building',
    brief: 'Show a feature, workflow, screenshot, or behind-the-scenes artifact.',
  },
  3: {
    contentType: 'Tech lesson',
    dayRole: 'Teach process',
    category: 'building',
    brief: 'Teach one decision, technique, or mechanism.',
  },
  4: {
    contentType: 'Reach',
    dayRole: 'Reach format',
    category: 'building',
    brief: 'Use a trend, negative hook, identity callout, or high-curiosity frame.',
  },
  5: {
    contentType: 'Reflection',
    dayRole: 'Failure',
    category: 'building',
    brief: 'Share what did not work, what changed, or what was misunderstood.',
  },
  6: {
    contentType: 'Behind the scenes',
    dayRole: 'Real day',
    category: 'building',
    brief: 'Document one working day and the discipline behind it.',
  },
  0: {
    contentType: 'Recap',
    dayRole: 'Weekly recap',
    category: 'building',
    brief: 'Share what shipped, what you learned, and what comes next.',
  },
}

export function dateKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function dateFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function weekKeyForDate(date: Date): string {
  const base = new Date(date)
  const day = base.getDay()
  const monday = new Date(base)
  monday.setDate(base.getDate() - ((day + 6) % 7))
  const jan1 = new Date(monday.getFullYear(), 0, 1)
  const weekNum = Math.ceil(((monday.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
  return `${monday.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

export function weekKeyForDateKey(key: string): string {
  return weekKeyForDate(dateFromKey(key))
}

export function getWeekDays(weekKey: string) {
  const [yearStr, weekStr] = weekKey.split('-W')
  const year = parseInt(yearStr, 10)
  const week = parseInt(weekStr, 10)
  const jan1 = new Date(year, 0, 1)
  const dayOffset = (jan1.getDay() + 6) % 7
  const monday = new Date(year, 0, 1 + (week - 1) * 7 - dayOffset)
  const todayKey = dateKeyFromDate(new Date())
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    const key = dateKeyFromDate(date)
    return {
      date,
      dateKey: key,
      dayName: dayNames[index],
      num: date.getDate(),
      isToday: key === todayKey,
      guide: getDayGuide(key),
    }
  })
}

export function getDayGuide(dateKey: string): DailyVideoGuide {
  return DAY_GUIDES[dateFromKey(dateKey).getDay()]
}

export function dayDisplayLabel(dateKey: string): string {
  const date = dateFromKey(dateKey)
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function fieldFromNotes(notes: string | undefined, label: string): string {
  if (!notes) return ''
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = notes.match(new RegExp(`^${escaped}:\\s*(.+)$`, 'im'))
  return match?.[1]?.trim() || ''
}

function tagValue(video: Video | null, prefix: string): string {
  const tag = video?.tags?.find((t) => t.toLowerCase().startsWith(prefix))
  if (!tag) return ''
  return tag.slice(prefix.length).replace(/[-_]+/g, ' ').trim()
}

const SECTION_LABELS = [
  'Hook',
  'Script',
  'Beats',
  'Voiceover script',
  'Talking head script',
  'CTA',
  'Day guideline',
  'Recording packet',
  'Visual notes',
  'First frame',
  'Filming location',
  'Location',
  'A-roll',
  'B-roll',
  'B-rolls',
  'B-roll / screen',
  'B-roll / shot list',
  'Shot list',
  'Edit ideas',
  'Editing ideas',
  'Editor notes',
  'Thumbnail / image idea',
  'Thumbnail idea',
  'Image idea',
  'Cover image',
  'Filming notes',
  'Recording notes',
  'Plan notes',
]

function normalizeHeading(value: string): string {
  return value.toLowerCase().replace(/[#*_`]/g, '').replace(/\s+/g, ' ').trim()
}

function sectionFromNotes(notes: string | undefined, labels: string[]): string {
  if (!notes) return ''
  const wanted = new Set(labels.map(normalizeHeading))
  const stops = new Set(SECTION_LABELS.map(normalizeHeading))
  const out: string[] = []
  let capturing = false

  for (const line of notes.split(/\r?\n/)) {
    const match = line.match(/^\s{0,3}(?:#{1,6}\s*)?([A-Za-z][A-Za-z0-9 /-]{1,48}):\s*(.*)$/)
    if (match) {
      const heading = normalizeHeading(match[1])
      if (wanted.has(heading)) {
        capturing = true
        out.length = 0
        if (match[2]?.trim()) out.push(match[2].trim())
        continue
      }
      if (capturing && stops.has(heading)) break
    }

    if (capturing) out.push(line)
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function firstSection(notes: string | undefined, labels: string[]): string {
  for (const label of labels) {
    const value = sectionFromNotes(notes, [label])
    if (value) return value
  }
  return ''
}

export function getDailyVideoMeta(video: Video | null, dateKey: string): DailyVideoMeta {
  const guide = getDayGuide(dateKey)
  const notes = video?.notes || ''
  const contentType = fieldFromNotes(notes, 'Content type') || tagValue(video, 'type:') || guide.contentType
  const dayRole = fieldFromNotes(notes, 'Day role') || tagValue(video, 'role:') || guide.dayRole
  const keyword = fieldFromNotes(notes, 'Keyword') || tagValue(video, 'keyword:') || ''
  const title = video?.title?.trim() || `${contentType} - ${dayDisplayLabel(dateKey)}`
  const topic = fieldFromNotes(notes, 'Topic') || keyword || title

  return {
    ...guide,
    contentType,
    dayRole,
    keyword,
    title,
    topic,
  }
}

export function getDailyVideoProductionPlan(video: Video | null, dateKey: string): DailyVideoProductionPlan {
  const notes = video?.notes || ''
  const meta = getDailyVideoMeta(video, dateKey)
  return {
    hook: video?.hook?.trim() || firstSection(notes, ['Hook']),
    script: video?.script?.trim() || firstSection(notes, ['Script', 'Voiceover script', 'Talking head script', 'Beats']),
    cta: video?.cta?.trim() || firstSection(notes, ['CTA']),
    bRoll: firstSection(notes, ['B-roll / shot list', 'B-roll / screen', 'B-roll', 'B-rolls', 'Shot list']),
    editIdeas: firstSection(notes, ['Edit ideas', 'Editing ideas', 'Editor notes']),
    imageIdea: firstSection(notes, ['Thumbnail / image idea', 'Thumbnail idea', 'Image idea', 'Cover image', 'First frame']) || `First frame should signal: ${meta.topic}.`,
    filmingNotes: firstSection(notes, ['Filming notes', 'Recording notes', 'Filming location', 'Location', 'A-roll']),
  }
}

export function hasDailyVideoProductionPlan(plan: DailyVideoProductionPlan): boolean {
  return Boolean(plan.hook || plan.script || plan.cta || plan.bRoll || plan.editIdeas || plan.imageIdea || plan.filmingNotes)
}

export function buildDailyVideoNotes(dateKey: string, seed?: DailyVideoSeed): string {
  const guide = getDayGuide(dateKey)
  return [
    'Generated by daily-video slot.',
    `Date: ${dateKey}`,
    `Content type: ${seed?.contentType || guide.contentType}`,
    `Day role: ${seed?.dayRole || guide.dayRole}`,
    `Topic: ${seed?.topic || ''}`,
    `Keyword: ${seed?.keyword || ''}`,
    '',
    'Day guideline:',
    seed?.brief || guide.brief,
    '',
    'Recording packet:',
    `Hook: ${seed?.hook || ''}`,
    '',
    'Script:',
    seed?.script || '',
    '',
    'B-roll / shot list:',
    seed?.bRoll || '',
    '',
    'Edit ideas:',
    seed?.editIdeas || '',
    '',
    'Thumbnail / image idea:',
    seed?.imageIdea || '',
    '',
    'Filming notes:',
    seed?.filmingNotes || '',
    '',
    'CTA:',
    seed?.cta || '',
  ].join('\n').trim()
}

export function defaultDailyVideoTitle(dateKey: string): string {
  const guide = getDayGuide(dateKey)
  return `${guide.contentType} - ${dayDisplayLabel(dateKey)}`
}
