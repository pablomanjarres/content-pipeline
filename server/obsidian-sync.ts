import fs from 'fs'
import path from 'path'
import os from 'os'

const MARS_CONTENT = process.env.MARS_CONTENT_ROOT || '/Users/pablo/Library/Mobile Documents/com~apple~CloudDocs/Mars/Mars/content'
const MARS_VAULT_ROOT = process.env.MARS_VAULT_ROOT || '/Users/pablo/Library/Mobile Documents/com~apple~CloudDocs/Mars/Mars'
const MEDIA_ROOT = process.env.CONTENT_PIPELINE_MEDIA_ROOT || '/Users/pablo/Projects/media'
const ICLOUD_DOCS = path.join(os.homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs')
const ICLOUD_MARS_CONTENT = process.env.ICLOUD_CP_MARS_CONTENT_ROOT || path.join(ICLOUD_DOCS, 'Content Pipeline', 'Mars', 'content')
const POSTS_DIR = path.join(MARS_CONTENT, 'posts')
const VIDEOS_DIR = path.join(MARS_CONTENT, 'videos')
const RUNS_DIR = path.join(MARS_CONTENT, 'runs')
const DMS_DIR = path.join(MARS_CONTENT, 'dms')
const REPLIES_DIR = path.join(MARS_CONTENT, 'replies')
const VOICE_ANCHORS_DIR = path.join(MARS_CONTENT, 'voice-anchors')
const EDITS_FILE = path.join(VOICE_ANCHORS_DIR, 'edits.md')

function slugify(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled'
}

function dateStamp(iso: string | undefined | null): string {
  const s = (iso || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : new Date().toISOString().slice(0, 10)
}

// Build a clean, human-readable filename. Collisions on (date, slug) get
// disambiguated with a short id suffix so a previously-written file owned by
// a different record never gets clobbered.
function cleanFilename(dir: string, datePart: string, slug: string, ownerId: string): string {
  const base = `${datePart}-${slug}.md`
  const candidate = path.join(dir, base)
  if (!fs.existsSync(candidate)) return candidate
  if (ownsFile(candidate, ownerId)) return candidate
  const shortId = ownerId.replace(/[^a-z0-9]/gi, '').slice(0, 6) || 'x'
  return path.join(dir, `${datePart}-${slug}-${shortId}.md`)
}

function ownsFile(fp: string, ownerId: string): boolean {
  try {
    const head = fs.readFileSync(fp, 'utf-8').slice(0, 600)
    return head.includes(`id: "${ownerId}"`) || head.includes(`id: ${ownerId}`)
  } catch {
    return false
  }
}

// Convert an absolute media path (e.g. /Users/pablo/Projects/media/videos/...)
// into a vault-relative path (media/videos/...) so Obsidian can render it via
// the Mars/media symlink. Returns null if not under MEDIA_ROOT.
function vaultMediaPath(absPath: string | null | undefined): string | null {
  if (!absPath) return null
  const norm = path.resolve(absPath)
  const root = path.resolve(MEDIA_ROOT)
  if (norm === root || norm.startsWith(root + path.sep)) {
    return 'media/' + path.relative(root, norm).split(path.sep).join('/')
  }
  return null
}

function fmValue(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (Array.isArray(v)) return `[${v.map((x) => fmValue(x)).join(', ')}]`
  if (typeof v === 'string') return JSON.stringify(v)
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return JSON.stringify(v)
}

function frontmatter(obj: Record<string, unknown>): string {
  const lines = ['---']
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue
    lines.push(`${k}: ${fmValue(v)}`)
  }
  lines.push('---')
  return lines.join('\n')
}

function ensureDir(d: string) {
  fs.mkdirSync(d, { recursive: true })
}

// ─── Voice edits ledger ───────────────────────────────────────────────
// Every time Pablo edits a post's content or a video's script/hook/cta in CP,
// the BEFORE/AFTER is appended to `content/voice-anchors/edits.md`. Both
// drafting skills (daily-post-batch, yc-series-post) load this file as a voice
// anchor on every run, so future drafts learn from Pablo's corrections.

function ensureEditsFile(): void {
  if (fs.existsSync(EDITS_FILE)) return
  fs.mkdirSync(VOICE_ANCHORS_DIR, { recursive: true })
  const header = `---
tags: [voice/edits, voice/learning, voice/canonical]
kinds: [any]
platform: any
priority: high
---

# Pablo's edits — the canonical voice ledger

Every time Pablo edits a post's content or a video's script/hook/cta in
Content Pipeline, the BEFORE/AFTER is appended here automatically.

The drafting skills (daily-post-batch, yc-series-post) load this file on
every run. Pablo's edits ARE voice signal — pay attention to what he changed.

## How to use this file when drafting

1. Scan the most recent entries first.
2. For each entry, identify the PATTERN being corrected (a hook shape, a
   phrasing tic, a banned word, a CTA structure).
3. Before returning your draft, check: does it contain a pattern Pablo
   previously rewrote? If yes, match his edited preference, not the rejected
   version.
4. Entries marked with the same \`field\` repeatedly are high-signal — that's
   a recurring correction Pablo keeps making.

Entries below are appended in chronological order, newest at the bottom.
`
  fs.writeFileSync(EDITS_FILE, header, 'utf-8')
}

export function appendVoiceEdit(opts: {
  recordType: 'post' | 'video'
  recordId: string
  recordTitle: string
  platform?: string
  field: 'content' | 'script' | 'hook' | 'cta'
  before: string
  after: string
  reason?: string
}): void {
  try {
    if (opts.before == null || opts.after == null) return
    const beforeTrim = String(opts.before).trim()
    const afterTrim = String(opts.after).trim()
    if (beforeTrim === afterTrim) return
    if (!beforeTrim && !afterTrim) return

    ensureEditsFile()

    const ts = new Date().toISOString()
    const tsDay = ts.slice(0, 10)
    const titleClean = (opts.recordTitle || 'Untitled').replace(/\n+/g, ' ').slice(0, 100)
    const reasonLine = opts.reason ? `- **reason**: ${opts.reason.replace(/\n+/g, ' ')}\n` : ''

    const block = `

---

## ${tsDay} — ${opts.recordType}: "${titleClean}" (${opts.field})

- **id**: ${opts.recordId}
- **platform**: ${opts.platform || 'n/a'}
- **edited_at**: ${ts}
${reasonLine}
### BEFORE
\`\`\`
${opts.before}
\`\`\`

### AFTER
\`\`\`
${opts.after}
\`\`\`
`
    fs.appendFileSync(EDITS_FILE, block, 'utf-8')
  } catch (e) {
    console.error('[obsidian-sync] appendVoiceEdit failed:', e)
  }
}

// Find a file owned by `id`. First tries the legacy `${id}--*.md` prefix
// (back-compat with files written before the clean-filename migration), then
// falls back to scanning frontmatter `id:` of every .md in the directory.
function findFileById(dir: string, id: string): string | null {
  if (!fs.existsSync(dir)) return null
  const names = fs.readdirSync(dir).filter((n) => n.endsWith('.md') && !n.startsWith('.'))
  const legacy = names.find((name) => name.startsWith(`${id}--`) || name === `${id}.md`)
  if (legacy) return path.join(dir, legacy)
  for (const name of names) {
    const fp = path.join(dir, name)
    if (ownsFile(fp, id)) return fp
  }
  return null
}

function vaultLinkForId(dir: string, id: string, label = id): string {
  const fp = findFileById(dir, id)
  if (!fp) return `\`${id}\``
  const rel = path.relative(MARS_VAULT_ROOT, fp).split(path.sep).join('/').replace(/\.md$/, '')
  const safeLabel = label.replace(/\|/g, '/')
  return `[[${rel}|${safeLabel}]]`
}

function safeWrite(fp: string, body: string) {
  const writeOne = (target: string) => {
    ensureDir(path.dirname(target))
    const tmp = target + '.tmp'
    fs.writeFileSync(tmp, body)
    fs.renameSync(tmp, target)
  }
  writeOne(fp)
  const mirror = mirrorPath(fp)
  if (mirror) writeOne(mirror)
}

function safeUnlink(fp: string | null) {
  if (!fp) return
  if (fs.existsSync(fp)) fs.unlinkSync(fp)
  const mirror = mirrorPath(fp)
  if (mirror && fs.existsSync(mirror)) fs.unlinkSync(mirror)
}

function mirrorPath(fp: string): string | null {
  if (!fs.existsSync(ICLOUD_DOCS)) return null
  const rel = path.relative(MARS_CONTENT, fp)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null
  const target = path.join(ICLOUD_MARS_CONTENT, rel)
  return target === fp ? null : target
}

interface Post {
  id: string
  title?: string
  platform?: string
  status?: string
  category?: string
  tags?: string[]
  content?: string
  hook?: string
  cta?: string
  notes?: string
  url?: string | null
  linkedVideoId?: string | null
  generatorRunId?: string | null
  mediaPath?: string | null
  mediaKind?: string | null
  mediaStatus?: string
  createdAt?: string
  updatedAt?: string
  postedAt?: string | null
}

interface Video {
  id: string
  title?: string
  status?: string
  category?: string
  hook?: string
  script?: string
  cta?: string
  tags?: string[]
  notes?: string
  clipPaths?: string[]
  platforms?: Record<string, { caption?: string; hashtags?: string[]; posted?: boolean; url?: string | null; postedAt?: string | null }>
  createdAt?: string
  updatedAt?: string
}

interface GeneratorRun {
  id: string
  featureDescription?: string
  voiceAnchors?: { file: string; excerpt: string; tags: string[] }[]
  templateChoice?: { templateId: string; compositionId?: string | null; reason?: string } | null
  forgeTaskId?: string | null
  mediaPath?: string | null
  mediaKind?: string | null
  postIds?: string[]
  videoId?: string | null
  shortVideoId?: string | null
  status?: string
  error?: string | null
  createdAt?: string
  updatedAt?: string
}

interface SentDm {
  id: string
  kind?: 'dm' | 'reply'
  status?: 'draft' | 'sent'
  platform?: string
  recipientName?: string
  recipientHandle?: string
  message?: string
  context?: string
  url?: string | null
  replyToUrl?: string | null
  notes?: string
  sentAt?: string
  createdAt?: string
  updatedAt?: string
}

function defaultPlatforms() {
  const platforms = ['linkedin', 'instagram', 'threads', 'tiktok', 'youtube']
  return Object.fromEntries(platforms.map((p) => [p, { caption: '', hashtags: [], posted: false, url: null, postedAt: null }]))
}

function videoPlatformLabel(platform: string): string {
  return ({
    linkedin: 'LinkedIn',
    instagram: 'Instagram Reels',
    threads: 'Threads',
    tiktok: 'TikTok',
    youtube: 'YouTube Shorts',
  } as Record<string, string>)[platform] || platform
}

function parseFmValue(raw: string): unknown {
  const v = raw.trim()
  if (v === 'null') return null
  if (v === 'true') return true
  if (v === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  try { return JSON.parse(v) } catch {}
  return v.replace(/^"|"$/g, '')
}

function parseMarkdown(fp: string): { fm: Record<string, unknown>; body: string } | null {
  const raw = fs.readFileSync(fp, 'utf-8')
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return null
  const fm: Record<string, unknown> = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    fm[line.slice(0, idx).trim()] = parseFmValue(line.slice(idx + 1))
  }
  return { fm, body: match[2] }
}

function firstHeading(body: string): string {
  return body.match(/^#\s+(.+)$/m)?.[1]?.trim() || 'Untitled'
}

function section(body: string, heading: string): string {
  const wanted = heading.toLowerCase()
  const lines = body.split(/\r?\n/)
  const out: string[] = []
  let capturing = false

  for (const line of lines) {
    if (line === '---') {
      if (capturing) break
      continue
    }

    const match = line.match(/^##\s*(.+?)\s*$/)
    if (match) {
      if (capturing) break
      capturing = match[1].toLowerCase() === wanted
      continue
    }

    if (capturing) out.push(line)
  }

  return out.join('\n').trim()
}

function inlineField(body: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return body.match(new RegExp(`\\*\\*${escaped}:\\*\\*\\s*(.+)`))?.[1]?.trim() || section(body, label)
}

function noteField(notes: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = notes.match(new RegExp(`^${escaped}:\\s*(.+)$`, 'im'))
  return match?.[1]?.trim() || ''
}

function noteSection(notes: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = notes.match(new RegExp(`^${escaped}:\\s*\\n([\\s\\S]*?)(?=\\n[A-Za-z][A-Za-z /-]{1,48}:\\n|\\n[A-Za-z][A-Za-z /-]{1,48}:\\s+|\\n---\\n|$)`, 'im'))
  return match?.[1]?.trim() || ''
}

function scriptPacketProperties(notes: string): Record<string, unknown> {
  if (!notes) return {}
  const targetPlatforms = noteField(notes, 'Target platforms')
    .split(',')
    .map((platform) => platform.trim())
    .filter(Boolean)

  return {
    importSource: notes.includes('Added from supplied script packet.') ? 'supplied script packet' : undefined,
    contentDate: noteField(notes, 'Date') || undefined,
    contentType: noteField(notes, 'Content type') || undefined,
    dayRole: noteField(notes, 'Day role') || undefined,
    topic: noteField(notes, 'Topic') || undefined,
    keyword: noteField(notes, 'Keyword') || undefined,
    format: noteField(notes, 'Format') || undefined,
    lengthTarget: noteField(notes, 'Length target') || undefined,
    targetPlatforms: targetPlatforms.length > 0 ? targetPlatforms : undefined,
    dayGuideline: noteSection(notes, 'Day guideline') || undefined,
  }
}

function productionNotes(notes: string): string {
  if (!notes) return ''
  return notes
    .replace(/^Added from supplied script packet\.\s*/im, '')
    .replace(/^Date:\s*.+\n?/im, '')
    .replace(/^Content type:\s*.+\n?/im, '')
    .replace(/^Day role:\s*.+\n?/im, '')
    .replace(/^Topic:\s*.+\n?/im, '')
    .replace(/^Keyword:\s*.+\n?/im, '')
    .replace(/^Format:\s*.+\n?/im, '')
    .replace(/^Length target:\s*.+\n?/im, '')
    .replace(/^Target platforms:\s*.+\n?/im, '')
    .replace(/\n?Day guideline:\s*\n[\s\S]*?(?=\nRecording packet:|\nVisual notes:|\nFilming location:|\nB-roll \/ shot list:|\nEdit ideas:|\nThumbnail \/ image idea:|\nFilming notes:|\nPattern source|\n---|$)/i, '\n')
    .replace(/\n?Recording packet:\s*\n[\s\S]*?(?=\nVisual notes:|\nB-roll \/ shot list:|\nEdit ideas:|\nThumbnail \/ image idea:|\nFilming notes:|\nPattern source|\n---|$)/i, '\n')
    .replace(/\n?CTA:\s*\n[\s\S]*?(?=\nPattern source|\n---|$)/i, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function parseVoiceAnchors(body: string): GeneratorRun['voiceAnchors'] {
  const anchors: NonNullable<GeneratorRun['voiceAnchors']> = []
  const block = section(body, 'Voice anchors used')
  const re = /^###\s+(.+)\nTags:\s*(.*)\n\n>\s*([\s\S]*?)(?=\n### |\n*$)/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(block))) {
    anchors.push({
      file: m[1].trim(),
      tags: m[2].split(',').map((t) => t.trim()).filter(Boolean),
      excerpt: m[3].replace(/^>\s*/gm, '').trim(),
    })
  }
  return anchors
}

function parseTemplateChoice(body: string): GeneratorRun['templateChoice'] {
  const block = section(body, 'Template choice')
  if (!block) return null
  const templateId = block.match(/templateId:\s*`([^`]+)`/)?.[1]
  if (!templateId) return null
  const compositionId = block.match(/compositionId:\s*`([^`]+)`/)?.[1] || null
  const reason = block.match(/reason:\s*(.+)/)?.[1] || ''
  return { type: 'existing', templateId, compositionId, params: {}, reason }
}

function readMarkdownFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.md') && !name.startsWith('.'))
    .map((name) => path.join(dir, name))
}

function contentKey(text: string | undefined): string {
  return (text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, '')
    .trim()
}

function latestByContentKey(runs: GeneratorRun[]): Set<string> {
  const byKey = new Map<string, GeneratorRun>()
  for (const run of runs) {
    if (!((run.postIds || []).length > 0 || run.videoId || run.mediaPath)) continue
    const key = contentKey(run.featureDescription) || run.id
    const prev = byKey.get(key)
    if (!prev || String(run.updatedAt || run.createdAt || '').localeCompare(String(prev.updatedAt || prev.createdAt || '')) > 0) {
      byKey.set(key, run)
    }
  }
  return new Set([...byKey.values()].map((run) => run.id))
}

function importPost(fp: string): Post | null {
  const parsed = parseMarkdown(fp)
  if (!parsed || parsed.fm.type !== 'post' || typeof parsed.fm.id !== 'string') return null
  const contentRaw = section(parsed.body, 'Content')
  const content = contentRaw.replace(/\n?\*\*CTA:\*\*[\s\S]*$/m, '').trim()
  return {
    id: parsed.fm.id,
    title: firstHeading(parsed.body),
    platform: String(parsed.fm.platform || 'x'),
    status: String(parsed.fm.status || 'draft'),
    category: String(parsed.fm.category || 'building'),
    tags: Array.isArray(parsed.fm.tags) ? parsed.fm.tags as string[] : [],
    content,
    hook: inlineField(parsed.body, 'Hook'),
    cta: inlineField(parsed.body, 'CTA'),
    notes: section(parsed.body, 'Production notes') || section(parsed.body, 'Notes'),
    url: parsed.fm.url as string | null,
    linkedVideoId: parsed.fm.linkedVideoId as string | null,
    generatorRunId: parsed.fm.generatorRunId as string | null,
    mediaPath: parsed.fm.mediaPath as string | null,
    mediaKind: parsed.fm.mediaKind as string | null,
    mediaStatus: String(parsed.fm.mediaStatus || 'none'),
    createdAt: String(parsed.fm.createdAt || new Date().toISOString()),
    updatedAt: String(parsed.fm.updatedAt || parsed.fm.createdAt || new Date().toISOString()),
    postedAt: parsed.fm.postedAt as string | null,
  }
}

function importVideo(fp: string): (Video & { platforms?: unknown }) | null {
  const parsed = parseMarkdown(fp)
  if (!parsed || parsed.fm.type !== 'video' || typeof parsed.fm.id !== 'string') return null
  return {
    id: parsed.fm.id,
    title: firstHeading(parsed.body),
    status: String(parsed.fm.status || 'idea'),
    category: String(parsed.fm.category || 'building'),
    hook: inlineField(parsed.body, 'Hook'),
    script: section(parsed.body, 'Script'),
    cta: inlineField(parsed.body, 'CTA'),
    tags: Array.isArray(parsed.fm.tags) ? parsed.fm.tags as string[] : [],
    notes: section(parsed.body, 'Notes'),
    clipPaths: Array.isArray(parsed.fm.clipPaths) ? parsed.fm.clipPaths as string[] : [],
    platforms: defaultPlatforms(),
    createdAt: String(parsed.fm.createdAt || new Date().toISOString()),
    updatedAt: String(parsed.fm.updatedAt || parsed.fm.createdAt || new Date().toISOString()),
  }
}

function importRun(fp: string): GeneratorRun | null {
  const parsed = parseMarkdown(fp)
  if (!parsed || parsed.fm.type !== 'generator-run' || typeof parsed.fm.id !== 'string') return null
  return {
    id: parsed.fm.id,
    featureDescription: section(parsed.body, 'Feature'),
    voiceAnchors: parseVoiceAnchors(parsed.body),
    templateChoice: parseTemplateChoice(parsed.body),
    forgeTaskId: parsed.fm.forgeTaskId as string | null,
    mediaPath: parsed.fm.mediaPath as string | null,
    mediaKind: parsed.fm.mediaKind as string | null,
    postIds: Array.isArray(parsed.fm.postIds) ? parsed.fm.postIds as string[] : [],
    videoId: parsed.fm.videoId as string | null,
    status: String(parsed.fm.status || 'drafting'),
    error: null,
    createdAt: String(parsed.fm.createdAt || new Date().toISOString()),
    updatedAt: String(parsed.fm.updatedAt || parsed.fm.createdAt || new Date().toISOString()),
  }
}

export function syncPost(post: Post): void {
  try {
    const slug = slugify(post.title)
    const datePart = dateStamp(post.postedAt || post.createdAt)
    const fp = cleanFilename(POSTS_DIR, datePart, slug, post.id)
    const existing = findFileById(POSTS_DIR, post.id)
    if (existing && existing !== fp) safeUnlink(existing)

    const dashboardUrl = `http://localhost:3010/#post/${post.id}`
    const vaultMedia = vaultMediaPath(post.mediaPath)
    const fm = frontmatter({
      id: post.id,
      type: 'post',
      platform: post.platform,
      status: post.status,
      category: post.category,
      tags: post.tags,
      generatorRunId: post.generatorRunId,
      mediaPath: post.mediaPath,
      mediaKind: post.mediaKind,
      mediaStatus: post.mediaStatus,
      url: post.url,
      linkedVideoId: post.linkedVideoId,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      postedAt: post.postedAt,
      dashboardUrl,
    })

    const sections: string[] = [fm, '', `# ${post.title || 'Untitled'}`, '']
    if (post.status === 'posted' && post.postedAt) {
      sections.push(`**Posted:** ${post.postedAt.slice(0, 10)} on ${post.platform || 'platform'}${post.url ? ` — [link](${post.url})` : ''}`, '')
    }
    if (post.hook) sections.push(`**Hook:** ${post.hook}`, '')
    sections.push('## Content', '', post.content || '', '')
    if (post.cta) sections.push(`**CTA:** ${post.cta}`, '')
    if (vaultMedia) {
      sections.push('## Media', '', `![[${vaultMedia}]]`, '')
    } else if (post.mediaPath) {
      sections.push('## Media', '')
      sections.push(`- kind: ${post.mediaKind || 'file'}`)
      sections.push(`- status: ${post.mediaStatus || 'ready'}`)
      sections.push(`- path: \`${post.mediaPath}\``)
      sections.push('')
    }
    if (post.notes) sections.push('## Notes', '', post.notes, '')
    if (post.generatorRunId) {
      sections.push('## Source', '', `Generated by run ${vaultLinkForId(RUNS_DIR, post.generatorRunId)}`, '')
    }
    sections.push('---', `[Open in dashboard](${dashboardUrl})`)

    safeWrite(fp, sections.join('\n'))
  } catch (e) {
    console.error('[obsidian-sync] syncPost failed:', e)
  }
}

export function deletePost(id: string): void {
  try {
    safeUnlink(findFileById(POSTS_DIR, id))
  } catch (e) {
    console.error('[obsidian-sync] deletePost failed:', e)
  }
}

export function syncVideo(video: Video): void {
  try {
    const slug = slugify(video.title)
    const datePart = dateStamp(video.createdAt)
    const fp = cleanFilename(VIDEOS_DIR, datePart, slug, video.id)
    const existing = findFileById(VIDEOS_DIR, video.id)
    if (existing && existing !== fp) safeUnlink(existing)

    const dashboardUrl = `http://localhost:3010/#video/${video.id}`
    const fm = frontmatter({
      id: video.id,
      type: 'video',
      status: video.status,
      category: video.category,
      tags: video.tags,
      clipPaths: video.clipPaths,
      createdAt: video.createdAt,
      updatedAt: video.updatedAt,
      dashboardUrl,
      ...scriptPacketProperties(video.notes || ''),
    })

    const sections: string[] = [fm, '', `# ${video.title || 'Untitled'}`, '']
    if (video.hook) sections.push('## Hook', '', video.hook, '')
    if (video.script) sections.push('## Script', '', video.script, '')
    if (video.cta) sections.push('## CTA', '', video.cta, '')
    const platformEntries = Object.entries(video.platforms || defaultPlatforms())
      .filter(([p]) => ['linkedin', 'instagram', 'threads', 'tiktok', 'youtube'].includes(p))
    if (platformEntries.length > 0) {
      sections.push('## Upload platforms', '')
      for (const [platform, entry] of platformEntries) {
        const status = entry.posted ? `posted${entry.url ? ` - ${entry.url}` : ''}` : 'not posted'
        sections.push(`- ${videoPlatformLabel(platform)}: ${status}`)
      }
      sections.push('')
    }
    if (video.clipPaths && video.clipPaths.length > 0) {
      sections.push('## Clips', '')
      for (const p of video.clipPaths) {
        const v = vaultMediaPath(p)
        sections.push(v ? `- ![[${v}]]` : `- \`${p}\``)
      }
      sections.push('')
    }
    const cleanNotes = productionNotes(video.notes || '')
    if (cleanNotes) sections.push('## Production notes', '', cleanNotes, '')
    sections.push('---', `[Open in dashboard](${dashboardUrl})`)

    safeWrite(fp, sections.join('\n'))
  } catch (e) {
    console.error('[obsidian-sync] syncVideo failed:', e)
  }
}

export function deleteVideo(id: string): void {
  try {
    safeUnlink(findFileById(VIDEOS_DIR, id))
  } catch (e) {
    console.error('[obsidian-sync] deleteVideo failed:', e)
  }
}

export function syncRun(run: GeneratorRun): void {
  try {
    const slug = slugify(run.featureDescription)
    const datePart = dateStamp(run.createdAt)
    const fp = cleanFilename(RUNS_DIR, datePart, slug, run.id)
    const existing = findFileById(RUNS_DIR, run.id)
    if (existing && existing !== fp) safeUnlink(existing)

    const fm = frontmatter({
      id: run.id,
      type: 'generator-run',
      status: run.status,
      forgeTaskId: run.forgeTaskId,
      mediaPath: run.mediaPath,
      mediaKind: run.mediaKind,
      videoId: run.videoId,
      postIds: run.postIds,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    })

    const sections: string[] = [fm, '', `# Run · ${run.id}`, '']
    if (run.featureDescription) {
      sections.push('## Feature', '', run.featureDescription, '')
    }
    if (run.voiceAnchors && run.voiceAnchors.length > 0) {
      sections.push('## Voice anchors used', '')
      for (const a of run.voiceAnchors) {
        sections.push(`### ${a.file}`)
        sections.push(`Tags: ${(a.tags || []).join(', ')}`)
        sections.push('')
        sections.push(`> ${a.excerpt}`)
        sections.push('')
      }
    }
    if (run.templateChoice) {
      sections.push('## Template choice', '')
      sections.push(`- templateId: \`${run.templateChoice.templateId}\``)
      if (run.templateChoice.compositionId) {
        sections.push(`- compositionId: \`${run.templateChoice.compositionId}\``)
      }
      if (run.templateChoice.reason) {
        sections.push(`- reason: ${run.templateChoice.reason}`)
      }
      sections.push('')
    }
    if (run.postIds && run.postIds.length > 0) {
      sections.push('## Generated posts', '')
      for (const id of run.postIds) sections.push(`- ${vaultLinkForId(POSTS_DIR, id)}`)
      sections.push('')
    }
    if (run.videoId) {
      sections.push('## Generated short video', '', `- ${vaultLinkForId(VIDEOS_DIR, run.videoId)}`, '')
    }
    if (run.error) sections.push('## Error', '', '```', run.error, '```')

    safeWrite(fp, sections.join('\n'))
  } catch (e) {
    console.error('[obsidian-sync] syncRun failed:', e)
  }
}

export function deleteRun(id: string): void {
  try {
    safeUnlink(findFileById(RUNS_DIR, id))
  } catch (e) {
    console.error('[obsidian-sync] deleteRun failed:', e)
  }
}

export function syncSentDm(dm: SentDm): void {
  try {
    const status = dm.status === 'sent' ? 'sent' : 'draft'
    if (status === 'draft') {
      // Drafts are app-only; remove any prior Obsidian file for this id.
      safeUnlink(findFileById(DMS_DIR, dm.id))
      return
    }

    const titleParts = [dm.recipientName || dm.recipientHandle || 'Unknown', dm.platform || 'dm']
    const slug = slugify(titleParts.join(' '))
    const datePart = dateStamp(dm.sentAt || dm.createdAt)
    const fp = cleanFilename(DMS_DIR, datePart, slug, dm.id)
    const existing = findFileById(DMS_DIR, dm.id)
    if (existing && existing !== fp) safeUnlink(existing)

    const kind = dm.kind === 'reply' ? 'reply' : 'dm'
    const fm = frontmatter({
      id: dm.id,
      type: kind === 'reply' ? 'sent-reply' : 'sent-dm',
      kind,
      status,
      platform: dm.platform,
      recipientName: dm.recipientName,
      recipientHandle: dm.recipientHandle,
      url: dm.url,
      replyToUrl: dm.replyToUrl,
      sentAt: dm.sentAt,
      createdAt: dm.createdAt,
      updatedAt: dm.updatedAt,
    })

    const kindLabel = kind === 'reply' ? 'Reply' : 'DM'
    const title = `${dm.recipientName || dm.recipientHandle || 'Unknown recipient'} · ${kindLabel} · ${dm.platform || 'x'}`
    const sections: string[] = [fm, '', `# ${title}`, '']
    if (dm.context) sections.push('## Context', '', dm.context, '')
    if (dm.replyToUrl) sections.push('## Replying to', '', dm.replyToUrl, '')
    sections.push(`## ${kindLabel} sent`, '', dm.message || '', '')
    if (dm.notes) sections.push('## Notes', '', dm.notes, '')
    if (dm.url) sections.push('---', `[Open conversation/source](${dm.url})`)

    safeWrite(fp, sections.join('\n'))
  } catch (e) {
    console.error('[obsidian-sync] syncSentDm failed:', e)
  }
}

export function deleteSentDm(id: string): void {
  try {
    safeUnlink(findFileById(DMS_DIR, id))
  } catch (e) {
    console.error('[obsidian-sync] deleteSentDm failed:', e)
  }
}

export function backfillAll(read: <T>(file: string) => T[]): void {
  try {
    const posts = read<Post>('posts')
    const videos = read<Video>('videos')
    const runs = read<GeneratorRun>('generator-runs')
    const dms = read<SentDm>('sent-dms')
    posts.forEach(syncPost)
    videos.forEach(syncVideo)
    runs.forEach(syncRun)
    dms.forEach(syncSentDm)
    console.log(`[obsidian-sync] backfilled ${posts.length} posts, ${videos.length} videos, ${runs.length} runs, ${dms.length} DMs`)
  } catch (e) {
    console.error('[obsidian-sync] backfill failed:', e)
  }
}

// One-shot cleanup of legacy `${id}--*.md` filenames. Walks every sync dir,
// finds anything still using the UUID-prefix scheme, and rewrites those files
// to the new `YYYY-MM-DD-slug.md` format derived from frontmatter. Called once
// from the server boot path; cheap and idempotent on a clean vault.
export function migrateLegacyFilenames(): { renamed: number; skipped: number } {
  const counts = { renamed: 0, skipped: 0 }
  const renameInDir = (dir: string, kind: 'post' | 'video' | 'run' | 'dm') => {
    if (!fs.existsSync(dir)) return
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.md') || name.startsWith('.')) continue
      const m = name.match(/^([0-9a-f-]{8,})--(.+)\.md$/i) || name.match(/^(run-[\w-]+?)--(.+)\.md$/)
      if (!m) continue
      const fp = path.join(dir, name)
      const parsed = parseMarkdown(fp)
      if (!parsed || typeof parsed.fm.id !== 'string') { counts.skipped++; continue }
      const id = parsed.fm.id
      let datePart = dateStamp(parsed.fm.postedAt as string || parsed.fm.createdAt as string)
      const titleSrc = kind === 'run' ? section(parsed.body, 'Feature') || firstHeading(parsed.body) : firstHeading(parsed.body)
      const slug = slugify(titleSrc)
      const target = cleanFilename(dir, datePart, slug, id)
      if (target === fp) { counts.skipped++; continue }
      try {
        fs.renameSync(fp, target)
        const mirrorFrom = mirrorPath(fp)
        const mirrorTo = mirrorPath(target)
        if (mirrorFrom && mirrorTo && fs.existsSync(mirrorFrom)) fs.renameSync(mirrorFrom, mirrorTo)
        counts.renamed++
      } catch { counts.skipped++ }
    }
  }
  renameInDir(POSTS_DIR, 'post')
  renameInDir(VIDEOS_DIR, 'video')
  renameInDir(RUNS_DIR, 'run')
  renameInDir(DMS_DIR, 'dm')
  if (counts.renamed > 0 || counts.skipped > 0) {
    console.log(`[obsidian-sync] migrated ${counts.renamed} legacy filenames (${counts.skipped} skipped)`)
  }
  return counts
}

export function importMissingFromVault(
  read: <T>(file: string) => T[],
  upsert: <T extends { id: string }>(file: string, item: T) => T,
): { posts: number; videos: number; runs: number } {
  const counts = { posts: 0, videos: 0, runs: 0 }
  try {
    const existingPosts = new Set(read<Post>('posts').map((p) => p.id))
    const existingVideos = new Set(read<Video>('videos').map((v) => v.id))
    const existingRuns = new Set(read<GeneratorRun>('generator-runs').map((r) => r.id))
    const vaultRuns = readMarkdownFiles(RUNS_DIR).map(importRun).filter((r): r is GeneratorRun => !!r)
    const canonicalRunIds = latestByContentKey([...read<GeneratorRun>('generator-runs'), ...vaultRuns])
    const canonicalVideoIds = new Set(vaultRuns.filter((r) => canonicalRunIds.has(r.id) && r.videoId).map((r) => r.videoId as string))

    for (const fp of readMarkdownFiles(POSTS_DIR)) {
      const post = importPost(fp)
      if (post?.generatorRunId && !canonicalRunIds.has(post.generatorRunId)) continue
      if (post && !existingPosts.has(post.id)) {
        upsert('posts', post)
        existingPosts.add(post.id)
        counts.posts += 1
      }
    }

    for (const fp of readMarkdownFiles(VIDEOS_DIR)) {
      const video = importVideo(fp)
      if (video && canonicalVideoIds.size > 0 && video.title?.toLowerCase().includes('agent benchmarks') && !canonicalVideoIds.has(video.id)) continue
      if (video && !existingVideos.has(video.id)) {
        upsert('videos', video)
        existingVideos.add(video.id)
        counts.videos += 1
      }
    }

    for (const run of vaultRuns) {
      if (!canonicalRunIds.has(run.id)) continue
      if (run && !existingRuns.has(run.id)) {
        upsert('generator-runs', run)
        existingRuns.add(run.id)
        counts.runs += 1
      }
    }

    console.log(`[obsidian-sync] imported missing from Mars vault: ${counts.posts} posts, ${counts.videos} videos, ${counts.runs} runs`)
  } catch (e) {
    console.error('[obsidian-sync] importMissingFromVault failed:', e)
  }
  return counts
}

// --- Outbound (openclaw X pipeline sent replies) ---

interface OutboundDraft {
  id: string
  kind?: 'reply' | 'dm' | 'repost'
  angle: string
  body: string
  editedBody: string | null
  charCount: number
  sentAt?: string | null
}

interface OutboundThread {
  id: string
  leadId: string
  platform: string
  authorHandle: string
  authorId: string
  authorFollowers: number | null
  allowsDms?: boolean | null
  originalPostId: string
  originalPostText: string
  originalPostUrl: string
  postedAt: string
  matchedTrigger: string | null
  drafts: OutboundDraft[]
  selectedDraftId: string | null
  status: string
  skipReason: string | null
  createdAt: string
  updatedAt: string
  sentAt: string | null
}

// Mars vault paths per kind. DMs go to content/dms, replies to content/replies.
const KIND_DIRS: Record<string, string> = {
  reply: REPLIES_DIR,
  dm: DMS_DIR,
  repost: REPLIES_DIR,
}

export function syncOutboundDraftSent(thread: OutboundThread, draftId: string): void {
  try {
    const draft = (thread.drafts || []).find((d) => d.id === draftId)
    if (!draft) return
    const dir = KIND_DIRS[(draft as any).kind] || REPLIES_DIR
    const noteId = `${thread.id}::${draftId}`
    const slug = slugify(`${thread.authorHandle}-${(draft as any).kind || 'reply'}-${draft.angle}`)
    const datePart = dateStamp((draft as any).sentAt || thread.sentAt || thread.updatedAt || thread.createdAt)
    const fp = cleanFilename(dir, datePart, slug, noteId)
    const existing = findFileById(dir, noteId)
    if (existing && existing !== fp) safeUnlink(existing)

    const finalBody = draft.editedBody ?? draft.body
    const fm = frontmatter({
      id: noteId,
      threadId: thread.id,
      type: (draft as any).kind === 'dm' ? 'dm' : 'reply',
      platform: thread.platform,
      kind: (draft as any).kind || 'reply',
      angleChosen: draft.angle,
      status: 'sent',
      inReplyTo: thread.originalPostUrl,
      authorHandle: thread.authorHandle,
      authorFollowers: thread.authorFollowers,
      matchedTrigger: thread.matchedTrigger,
      leadId: thread.leadId,
      createdAt: thread.createdAt,
      sentAt: (draft as any).sentAt || thread.sentAt,
    })

    const heading = (draft as any).kind === 'dm' ? 'DM' : 'Reply'
    const sections: string[] = [
      fm, '',
      `# ${heading} to @${thread.authorHandle} (${draft.angle})`, '',
      '## Original', '',
      thread.originalPostText.split('\n').map((line) => `> ${line}`).join('\n'), '',
      `[Open original on X](${thread.originalPostUrl})`, '',
      '## Sent', '',
      finalBody, '',
    ]
    safeWrite(fp, sections.join('\n'))
  } catch (e) {
    console.error('[obsidian-sync] syncOutboundDraftSent failed:', e)
  }
}

// Backward-compat: when something marks the whole thread sent, sync the chosen draft.
export function syncOutboundSent(thread: OutboundThread): void {
  if (thread.selectedDraftId) {
    syncOutboundDraftSent(thread, thread.selectedDraftId)
  }
}

export function deleteOutbound(id: string): void {
  try {
    safeUnlink(findFileById(REPLIES_DIR, id))
  } catch (e) {
    console.error('[obsidian-sync] deleteOutbound failed:', e)
  }
}
