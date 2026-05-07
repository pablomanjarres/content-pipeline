// Persistent memory for OpenClaw / Kaiser, stored in the openclaw-memory vault.
//
// This module is the read/write API the rest of the pipeline talks to. The
// vault is plain markdown so it stays human-editable; this file owns the
// serialization round-trip and the small amount of structure we extract.
//
// Filesystem layout (see openclaw-memory/README.md):
//   leads/<@handle>.md       — one file per person
//   entities/<slug>.md       — recurring topics/products/competitors
//   insights/<slug>.md       — bot-discovered patterns
//   pablo/<section>.md       — auto-evolving self-context
//   _templates/, _protocols/ — read-only docs, not touched by this module
//
// File format is defined in openclaw-memory/_templates/lead.md. We parse
// liberally and serialize strictly — Pablo's tweaks to the body are preserved
// by round-tripping known sections through structured fields, and any
// unrecognized trailing content is captured in `passthrough` and re-emitted.

import fs from 'fs'
import path from 'path'

const VAULT = process.env.OPENCLAW_MEMORY_ROOT || '/Users/pablo/Projects/openclaw-memory'
const LEADS_DIR = path.join(VAULT, 'leads')
const ENTITIES_DIR = path.join(VAULT, 'entities')
const INSIGHTS_DIR = path.join(VAULT, 'insights')
const PABLO_DIR = path.join(VAULT, 'pablo')

export type Platform = 'x' | 'reddit' | 'hn' | 'linkedin'
export type LeadStatus =
  | 'cold' | 'warm' | 'engaged' | 'converted'
  | 'ghosted' | 'disqualified' | 'do_not_contact' | 'dormant'
export type Sentiment = 'unknown' | 'positive' | 'neutral' | 'negative' | 'mixed'
export type IcpTrait = 'context-broken' | 'personal-card' | 'loud' | 'mcp-native'
export type InteractionKind = 'reply' | 'dm' | 'repost'
export type InteractionOutcome =
  | 'drafted-and-sent' | 'replied' | 'ghosted' | 'converted' | 'flagged'

export interface LeadInteraction {
  date: string
  kind: InteractionKind
  trigger: string
  angle: string
  outcome: InteractionOutcome
  marsNoteId: string
}

export interface LeadReply {
  date: string
  text: string
}

export interface LeadProfile {
  handle: string
  platform: Platform
  displayName: string
  realName: string
  followers: number | null
  allowsDms: boolean | null
  firstSeen: string
  lastContact: string
  status: LeadStatus
  sentiment: Sentiment
  icpTraits: IcpTrait[]
  tags: string[]
  marsNoteIds: string[]
  bio: string
  whatTheyBuild: string
  stackSignals: string
  painPoints: string
  topicsTheyCareAbout: string[]
  interactions: LeadInteraction[]
  leadReplies: LeadReply[]
  openQuestions: string[]
  passthrough: string
}

export interface EntitySummary {
  slug: string
  name: string
  category: string
  body: string
}

export interface InsightSummary {
  slug: string
  title: string
  status: string
  domain: string
  claim: string
  implication: string
  evidenceCount: number
}

export interface MemoryContext {
  pablo: {
    currentFocus: string
    icpTraits: string
    voiceRulesShorthand: string
  }
  lead: LeadProfile | null
  entities: EntitySummary[]
  insights: InsightSummary[]
}

// Inputs used by the post-send hook. These mirror the shapes already in
// obsidian-sync.ts so callers can pass the same payload they pass to that.
export interface OutboundThreadLike {
  id: string
  leadId: string
  platform: string
  authorHandle: string
  authorFollowers: number | null
  allowsDms?: boolean | null
  originalPostText: string
  originalPostUrl: string
  matchedTrigger: string | null
  drafts: Array<{
    id: string
    kind?: 'reply' | 'dm' | 'repost'
    angle: string
    body: string
    editedBody: string | null
    sentAt?: string | null
  }>
  createdAt: string
  updatedAt: string
  sentAt: string | null
}

// ---------------------------------------------------------------------------
// path / handle helpers
// ---------------------------------------------------------------------------

export function normalizeHandle(raw: string): string {
  const t = String(raw || '').trim().toLowerCase()
  if (!t) return ''
  return t.startsWith('@') ? t : '@' + t
}

function leadFilename(handle: string): string {
  // The leading '@' is intentional — Obsidian renders [[@example]] fine and
  // the file appears as "@example" in the file pane, matching how leads are
  // referenced everywhere else.
  return path.join(LEADS_DIR, `${handle}.md`)
}

function ensureDir(d: string) {
  fs.mkdirSync(d, { recursive: true })
}

function safeWrite(fp: string, body: string) {
  ensureDir(path.dirname(fp))
  const tmp = fp + '.tmp'
  fs.writeFileSync(tmp, body)
  fs.renameSync(tmp, fp)
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// frontmatter (minimal YAML — the same shape obsidian-sync.ts uses)
// ---------------------------------------------------------------------------

function fmValue(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]'
    return `[${v.map((x) => fmValue(x)).join(', ')}]`
  }
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

function parseFmValue(raw: string): unknown {
  const v = raw.trim()
  if (v === 'null' || v === '') return null
  if (v === 'true') return true
  if (v === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  // Inline arrays: [a, b, "c d"]
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim()
    if (!inner) return []
    // Naive split on commas not inside quotes
    const parts: string[] = []
    let depth = 0
    let inStr = false
    let cur = ''
    for (const ch of inner) {
      if (ch === '"' && cur.slice(-1) !== '\\') inStr = !inStr
      if (!inStr && ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue }
      cur += ch
    }
    if (cur.trim()) parts.push(cur)
    return parts.map((p) => parseFmValue(p))
  }
  try { return JSON.parse(v) } catch { /* fall through */ }
  return v.replace(/^"|"$/g, '')
}

function parseFrontmatter(raw: string): { fm: Record<string, unknown>; body: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return { fm: {}, body: raw }
  const fm: Record<string, unknown> = {}
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1)
    fm[key] = parseFmValue(val)
  }
  return { fm, body: m[2] }
}

// ---------------------------------------------------------------------------
// section parsing — pulls structured fields out of the body
// ---------------------------------------------------------------------------

function sliceSection(body: string, heading: string): string {
  const re = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*$`, 'm')
  const start = body.search(re)
  if (start < 0) return ''
  const after = body.slice(start)
  const m = after.match(/^##\s+.+\n([\s\S]*?)(?=\n##\s+|\n---\s*$|$)/)
  return m ? m[1].trim() : ''
}

function inlineField(section: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = section.match(new RegExp(`-\\s*\\*\\*${escaped}:\\*\\*\\s*(.+)`))
  return m ? m[1].trim() : ''
}

function parseInteractionTable(section: string): LeadInteraction[] {
  const lines = section.split('\n').map((l) => l.trim()).filter(Boolean)
  const rows: LeadInteraction[] = []
  for (const line of lines) {
    if (!line.startsWith('|')) continue
    if (line.startsWith('| ---') || line.startsWith('|---')) continue
    if (line.includes('Date | Kind | Trigger')) continue
    const cells = line.split('|').slice(1, -1).map((c) => c.trim())
    if (cells.length < 6) continue
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cells[0])) continue
    rows.push({
      date: cells[0],
      kind: cells[1] as InteractionKind,
      trigger: cells[2] === '_' ? '' : cells[2],
      angle: cells[3],
      outcome: cells[4] as InteractionOutcome,
      marsNoteId: cells[5].replace(/^`|`$/g, ''),
    })
  }
  return rows
}

function parseTopics(section: string): string[] {
  // Lines like "- [[entities/some-topic]]"
  const out: string[] = []
  for (const line of section.split('\n')) {
    const m = line.match(/-\s*\[\[entities\/([^|\]]+)(?:\|[^\]]+)?\]\]/)
    if (m) out.push(m[1].trim())
  }
  return out
}

function parseLeadReplies(section: string): LeadReply[] {
  // Format: "### YYYY-MM-DD\n> verbatim text" (possibly multi-line block-quote)
  const out: LeadReply[] = []
  const re = /###\s+(\d{4}-\d{2}-\d{2})\s*\n([\s\S]*?)(?=\n###\s+\d{4}-\d{2}-\d{2}|\n##\s+|\n*$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(section))) {
    const text = m[2].split('\n').map((l) => l.replace(/^>\s?/, '')).join('\n').trim()
    if (text) out.push({ date: m[1], text })
  }
  return out
}

function parseOpenQuestions(section: string): string[] {
  const out: string[] = []
  for (const line of section.split('\n')) {
    const m = line.match(/-\s*\[[ x]\]\s*(.+)/)
    if (m && !/^_.*_$/.test(m[1].trim())) out.push(m[1].trim())
  }
  return out
}

function defaultProfile(handle: string, platform: Platform): LeadProfile {
  const today = todayISO()
  return {
    handle,
    platform,
    displayName: '',
    realName: '',
    followers: null,
    allowsDms: null,
    firstSeen: today,
    lastContact: today,
    status: 'cold',
    sentiment: 'unknown',
    icpTraits: [],
    tags: [],
    marsNoteIds: [],
    bio: '',
    whatTheyBuild: '',
    stackSignals: '',
    painPoints: '',
    topicsTheyCareAbout: [],
    interactions: [],
    leadReplies: [],
    openQuestions: [],
    passthrough: '',
  }
}

// ---------------------------------------------------------------------------
// read
// ---------------------------------------------------------------------------

export function leadFileExists(handle: string): boolean {
  return fs.existsSync(leadFilename(normalizeHandle(handle)))
}

export function getLeadProfile(handle: string): LeadProfile | null {
  const h = normalizeHandle(handle)
  if (!h) return null
  const fp = leadFilename(h)
  if (!fs.existsSync(fp)) return null

  const raw = fs.readFileSync(fp, 'utf-8')
  const { fm, body } = parseFrontmatter(raw)

  const profileSection = sliceSection(body, 'Profile')
  const interactionsSection = sliceSection(body, 'Interactions')
  const topicsSection = sliceSection(body, 'Topics they care about')
  const repliesSection = sliceSection(body, 'Lead replies') || sliceSection(body, 'Lead replies (if any)')
  const openSection = sliceSection(body, 'Open questions / next move')

  // Capture anything after the recognized sections so manual edits survive.
  const knownHeadings = ['Profile', 'ICP fit', 'Topics they care about', 'Interactions',
    'Lead replies', 'Lead replies (if any)', 'Open questions / next move']
  const passthrough = collectUnknownSections(body, knownHeadings)

  return {
    handle: String(fm.handle || h),
    platform: ((fm.platform as string) || 'x') as Platform,
    displayName: String(fm.display_name || ''),
    realName: String(fm.real_name || ''),
    followers: typeof fm.followers === 'number' ? fm.followers : null,
    allowsDms: typeof fm.allows_dms === 'boolean' ? fm.allows_dms : null,
    firstSeen: String(fm.first_seen || todayISO()),
    lastContact: String(fm.last_contact || todayISO()),
    status: ((fm.status as string) || 'cold') as LeadStatus,
    sentiment: ((fm.sentiment as string) || 'unknown') as Sentiment,
    icpTraits: Array.isArray(fm.icp_traits) ? (fm.icp_traits as IcpTrait[]) : [],
    tags: Array.isArray(fm.tags) ? (fm.tags as string[]) : [],
    marsNoteIds: Array.isArray(fm.mars_note_ids) ? (fm.mars_note_ids as string[]) : [],
    bio: inlineField(profileSection, 'Bio'),
    whatTheyBuild: inlineField(profileSection, 'What they build'),
    stackSignals: inlineField(profileSection, 'Stack signals'),
    painPoints: inlineField(profileSection, 'Pain points seen'),
    topicsTheyCareAbout: parseTopics(topicsSection),
    interactions: parseInteractionTable(interactionsSection),
    leadReplies: parseLeadReplies(repliesSection),
    openQuestions: parseOpenQuestions(openSection),
    passthrough,
  }
}

function collectUnknownSections(body: string, known: string[]): string {
  const knownSet = new Set(known.map((k) => k.toLowerCase()))
  const parts = body.split(/^##\s+/m)
  const out: string[] = []
  // parts[0] is the preamble (title + anything before first ##); skip.
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i]
    const heading = chunk.split('\n', 1)[0].trim()
    if (knownSet.has(heading.toLowerCase())) continue
    if (heading.startsWith('Frontmatter field guide')) continue
    out.push(`## ${chunk.trimEnd()}`)
  }
  return out.join('\n\n')
}

// ---------------------------------------------------------------------------
// serialize
// ---------------------------------------------------------------------------

function bool(v: boolean | null): string {
  return v === null ? 'unknown' : v ? 'yes' : 'no'
}

function checkbox(traits: IcpTrait[], t: IcpTrait): string {
  return traits.includes(t) ? '[x]' : '[ ]'
}

function serializeLeadFile(p: LeadProfile): string {
  const fm = frontmatter({
    type: 'lead',
    platform: p.platform,
    handle: p.handle,
    display_name: p.displayName,
    real_name: p.realName,
    followers: p.followers,
    allows_dms: p.allowsDms,
    first_seen: p.firstSeen,
    last_contact: p.lastContact,
    status: p.status,
    sentiment: p.sentiment,
    icp_traits: p.icpTraits,
    tags: p.tags,
    mars_note_ids: p.marsNoteIds,
  })

  const lines: string[] = [fm, '', `# ${p.handle}`, '', '## Profile', '']
  lines.push(`- **Bio:** ${p.bio || '_(unknown)_'}`)
  lines.push(`- **What they build:** ${p.whatTheyBuild || '_(unknown)_'}`)
  lines.push(`- **Stack signals:** ${p.stackSignals || '_(unknown)_'}`)
  lines.push(`- **Pain points seen:** ${p.painPoints || '_(unknown)_'}`)
  lines.push(`- **Followers:** ${p.followers ?? 'unknown'}`)
  lines.push(`- **Allows DMs:** ${bool(p.allowsDms)}`)
  lines.push('')

  lines.push('## ICP fit', '')
  lines.push(`- ${checkbox(p.icpTraits, 'context-broken')} context-broken`)
  lines.push(`- ${checkbox(p.icpTraits, 'personal-card')} personal-card`)
  lines.push(`- ${checkbox(p.icpTraits, 'loud')} loud`)
  lines.push(`- ${checkbox(p.icpTraits, 'mcp-native')} mcp-native`)
  lines.push('')

  lines.push('## Topics they care about', '')
  if (p.topicsTheyCareAbout.length === 0) {
    lines.push('_(none yet)_')
  } else {
    for (const t of p.topicsTheyCareAbout) lines.push(`- [[entities/${t}]]`)
  }
  lines.push('')

  lines.push('## Interactions', '')
  lines.push('| Date | Kind | Trigger | Angle | Outcome | Mars note |')
  lines.push('| --- | --- | --- | --- | --- | --- |')
  for (const r of p.interactions) {
    lines.push(`| ${r.date} | ${r.kind} | ${r.trigger || '_'} | ${r.angle} | ${r.outcome} | \`${r.marsNoteId}\` |`)
  }
  lines.push('')

  lines.push('## Lead replies', '')
  if (p.leadReplies.length === 0) {
    lines.push('_(none yet)_')
  } else {
    for (const r of p.leadReplies) {
      lines.push(`### ${r.date}`)
      lines.push('')
      for (const ln of r.text.split('\n')) lines.push(`> ${ln}`)
      lines.push('')
    }
  }
  lines.push('')

  lines.push('## Open questions / next move', '')
  if (p.openQuestions.length === 0) {
    lines.push('- [ ] _(none)_')
  } else {
    for (const q of p.openQuestions) lines.push(`- [ ] ${q}`)
  }
  lines.push('')

  if (p.passthrough.trim()) {
    lines.push(p.passthrough.trim())
    lines.push('')
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// upsert (the post-send hook)
// ---------------------------------------------------------------------------

export interface UpsertResult {
  created: boolean
  updated: boolean
  skipped: boolean
  reason?: string
  filepath: string
}

export function upsertLeadFromSend(
  thread: OutboundThreadLike,
  draftId: string,
): UpsertResult {
  const handle = normalizeHandle(thread.authorHandle)
  if (!handle) {
    return { created: false, updated: false, skipped: true, reason: 'no handle', filepath: '' }
  }
  if (!['x', 'reddit', 'hn', 'linkedin'].includes(thread.platform)) {
    return { created: false, updated: false, skipped: true, reason: `unknown platform ${thread.platform}`, filepath: '' }
  }

  const draft = thread.drafts.find((d) => d.id === draftId)
  if (!draft) {
    return { created: false, updated: false, skipped: true, reason: `draft ${draftId} not in thread`, filepath: '' }
  }

  const fp = leadFilename(handle)
  const existing = getLeadProfile(handle)
  const profile = existing ?? defaultProfile(handle, thread.platform as Platform)
  const created = !existing

  // Source-of-truth fields from the latest send always overwrite. This is
  // intentional — the discovery layer is where freshness lives.
  if (thread.authorFollowers !== null && thread.authorFollowers !== undefined) {
    profile.followers = thread.authorFollowers
  }
  if (typeof thread.allowsDms === 'boolean') {
    profile.allowsDms = thread.allowsDms
  }

  const noteId = `${thread.id}::${draftId}`
  if (!profile.marsNoteIds.includes(noteId)) profile.marsNoteIds.push(noteId)

  // Idempotency: if we've already logged this exact send, no-op the table.
  const sendDate = (draft.sentAt || thread.sentAt || thread.updatedAt || thread.createdAt).slice(0, 10)
  const alreadyLogged = profile.interactions.some((r) => r.marsNoteId === noteId)
  if (!alreadyLogged) {
    profile.interactions.push({
      date: sendDate,
      kind: (draft.kind || 'reply') as InteractionKind,
      trigger: thread.matchedTrigger || '',
      angle: draft.angle,
      outcome: 'drafted-and-sent',
      marsNoteId: noteId,
    })
    // Keep newest first for readability.
    profile.interactions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  }

  profile.lastContact = sendDate
  // First send promotes cold → warm. Higher states are sticky.
  if (profile.status === 'cold') profile.status = 'warm'

  safeWrite(fp, serializeLeadFile(profile))
  return { created, updated: !created, skipped: alreadyLogged, filepath: fp }
}

// Normalizes a reply text for dedup comparison: lowercase, collapse whitespace.
// We don't store the normalized form — only use it to check whether we've
// already logged this exact reply.
function normalizeReplyText(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}

export function recordLeadReply(
  handle: string,
  platform: Platform,
  replyText: string,
  sentiment: Sentiment = 'positive',
  date: string = todayISO(),
): UpsertResult {
  const h = normalizeHandle(handle)
  const trimmed = replyText.trim()
  if (!h || !trimmed) {
    return { created: false, updated: false, skipped: true, reason: 'missing handle or text', filepath: '' }
  }
  const profile = getLeadProfile(h) ?? defaultProfile(h, platform)
  const created = !leadFileExists(h)
  const fp = leadFilename(h)

  // Idempotency: if we've already logged this exact reply (same date + same
  // normalized text), do nothing. Lets the reply observer run on a cron
  // without producing duplicates.
  const norm = normalizeReplyText(trimmed)
  const already = profile.leadReplies.some(
    (r) => r.date === date && normalizeReplyText(r.text) === norm,
  )
  if (already) {
    return { created: false, updated: false, skipped: true, reason: 'duplicate reply', filepath: fp }
  }

  profile.leadReplies.push({ date, text: trimmed })
  profile.lastContact = date
  profile.sentiment = sentiment
  if (profile.status === 'warm' || profile.status === 'cold') profile.status = 'engaged'

  // Also flip the most-recent matching interaction's outcome to 'replied' if any.
  for (let i = profile.interactions.length - 1; i >= 0; i--) {
    if (profile.interactions[i].outcome === 'drafted-and-sent') {
      profile.interactions[i].outcome = 'replied'
      break
    }
  }

  safeWrite(fp, serializeLeadFile(profile))
  return { created, updated: !created, skipped: false, filepath: fp }
}

// ---------------------------------------------------------------------------
// entities + insights — read-side helpers used by the drafter context fetch
// ---------------------------------------------------------------------------

function readMarkdownFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((n) => n.endsWith('.md') && !n.startsWith('_') && !n.startsWith('.'))
    .map((n) => path.join(dir, n))
}

export function listEntitySlugs(): string[] {
  return readMarkdownFiles(ENTITIES_DIR).map((fp) => path.basename(fp, '.md'))
}

export function getEntity(slug: string): EntitySummary | null {
  const fp = path.join(ENTITIES_DIR, `${slug}.md`)
  if (!fs.existsSync(fp)) return null
  const raw = fs.readFileSync(fp, 'utf-8')
  const { fm, body } = parseFrontmatter(raw)
  return {
    slug,
    name: (body.match(/^#\s+(.+)$/m)?.[1] || slug).trim(),
    category: String(fm.category || 'concept'),
    body: body.trim(),
  }
}

export function findEntitiesInText(text: string, max = 5): EntitySummary[] {
  if (!text) return []
  const lower = text.toLowerCase()
  const slugs = listEntitySlugs()
  const hits: EntitySummary[] = []
  for (const slug of slugs) {
    const e = getEntity(slug)
    if (!e) continue
    const aliases = [e.slug, e.name, ...extractAliases(e.body)]
      .filter(Boolean)
      .map((s) => s.toLowerCase())
    if (aliases.some((a) => a && lower.includes(a))) {
      hits.push(e)
      if (hits.length >= max) break
    }
  }
  return hits
}

function extractAliases(body: string): string[] {
  // Heuristic: look for "aliases:" in the embedded frontmatter; if not, none.
  const m = body.match(/aliases:\s*\[([^\]]*)\]/i)
  if (!m) return []
  return m[1].split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean)
}

export function listInsights(domain?: string, statuses: string[] = ['supported', 'validated']): InsightSummary[] {
  const out: InsightSummary[] = []
  for (const fp of readMarkdownFiles(INSIGHTS_DIR)) {
    const raw = fs.readFileSync(fp, 'utf-8')
    const { fm, body } = parseFrontmatter(raw)
    const status = String(fm.status || 'hypothesis')
    const fmDomain = String(fm.domain || 'outreach')
    if (!statuses.includes(status)) continue
    if (domain && fmDomain !== domain) continue
    const evidence = Array.isArray(fm.evidence) ? (fm.evidence as string[]).length : 0
    out.push({
      slug: path.basename(fp, '.md'),
      title: (body.match(/^#\s+(.+)$/m)?.[1] || path.basename(fp, '.md')).trim(),
      status,
      domain: fmDomain,
      claim: sliceSection(body, 'Claim'),
      implication: sliceSection(body, 'Implication'),
      evidenceCount: evidence,
    })
  }
  // Highest-evidence first.
  out.sort((a, b) => b.evidenceCount - a.evidenceCount)
  return out
}

// ---------------------------------------------------------------------------
// pablo self-context
// ---------------------------------------------------------------------------

function readPablo(name: string): string {
  const fp = path.join(PABLO_DIR, `${name}.md`)
  if (!fs.existsSync(fp)) return ''
  const { body } = parseFrontmatter(fs.readFileSync(fp, 'utf-8'))
  return body.trim()
}

function pabloVoiceShorthand(): string {
  // Cached shorthand from pablo/voice-rules.md so the drafter doesn't have to
  // round-trip into the Mars vault for the bullet list.
  const body = readPablo('voice-rules')
  const m = body.match(/##\s+Shorthand summary[^\n]*\n([\s\S]*?)(?=\n##\s+|\n*$)/)
  return (m?.[1] || '').trim()
}

// ---------------------------------------------------------------------------
// composite read used by the drafter
// ---------------------------------------------------------------------------

export function getMemoryContext(opts: {
  handle: string
  platform: Platform
  originalPostText?: string
  insightDomain?: string
  maxEntities?: number
  maxInsights?: number
}): MemoryContext {
  const handle = normalizeHandle(opts.handle)
  const lead = handle ? getLeadProfile(handle) : null
  const probe = [opts.originalPostText || '', lead?.painPoints || '', lead?.stackSignals || ''].join(' ')
  const entities = findEntitiesInText(probe, opts.maxEntities ?? 5)
  const insights = listInsights(opts.insightDomain ?? 'outreach').slice(0, opts.maxInsights ?? 10)

  return {
    pablo: {
      currentFocus: readPablo('current-focus'),
      icpTraits: readPablo('icp-traits'),
      voiceRulesShorthand: pabloVoiceShorthand(),
    },
    lead,
    entities,
    insights,
  }
}

// ---------------------------------------------------------------------------
// formatter — context object → flat string for the LLM user prompt
// ---------------------------------------------------------------------------

export function formatContextForPrompt(ctx: MemoryContext): string {
  const out: string[] = []

  out.push('=== MEMORY CONTEXT ===')
  out.push('')

  if (ctx.pablo.currentFocus) {
    out.push('## Pablo current focus')
    out.push(ctx.pablo.currentFocus.split('\n').slice(0, 30).join('\n'))
    out.push('')
  }
  if (ctx.pablo.voiceRulesShorthand) {
    out.push('## Voice rules (shorthand)')
    out.push(ctx.pablo.voiceRulesShorthand)
    out.push('')
  }

  if (ctx.lead) {
    const l = ctx.lead
    out.push(`## Lead: ${l.handle} (${l.platform})`)
    out.push(`- Status: ${l.status} | Sentiment: ${l.sentiment} | Last contact: ${l.lastContact}`)
    if (l.followers !== null) out.push(`- Followers: ${l.followers}`)
    if (l.icpTraits.length) out.push(`- ICP traits hit: ${l.icpTraits.join(', ')}`)
    if (l.bio) out.push(`- Bio: ${l.bio}`)
    if (l.whatTheyBuild) out.push(`- What they build: ${l.whatTheyBuild}`)
    if (l.stackSignals) out.push(`- Stack signals: ${l.stackSignals}`)
    if (l.painPoints) out.push(`- Pain points: ${l.painPoints}`)
    if (l.interactions.length) {
      out.push('- Recent interactions (most recent first):')
      for (const r of l.interactions.slice(0, 5)) {
        out.push(`  - ${r.date} ${r.kind}/${r.angle} → ${r.outcome}`)
      }
    } else {
      out.push('- This is the first interaction with this lead.')
    }
    if (l.leadReplies.length) {
      out.push('- Lead has replied verbatim:')
      for (const r of l.leadReplies.slice(-3)) {
        const compact = r.text.replace(/\s+/g, ' ').slice(0, 200)
        out.push(`  - ${r.date}: "${compact}"`)
      }
    }
    if (l.openQuestions.length) {
      out.push('- Open questions / next move:')
      for (const q of l.openQuestions.slice(0, 3)) out.push(`  - ${q}`)
    }
    out.push('')
  } else {
    out.push('## Lead')
    out.push('No prior interaction. This is a true first contact.')
    out.push('')
  }

  if (ctx.entities.length) {
    out.push('## Topics in play')
    for (const e of ctx.entities) {
      const compact = e.body.split('\n').slice(0, 6).join(' ').replace(/\s+/g, ' ').slice(0, 280)
      out.push(`- ${e.name} (${e.category}): ${compact}`)
    }
    out.push('')
  }

  if (ctx.insights.length) {
    out.push('## Active insights (apply when relevant)')
    for (const i of ctx.insights) {
      const claim = i.claim.split('\n')[0].slice(0, 180) || i.title
      const impl = i.implication.split('\n')[0].slice(0, 180)
      out.push(`- [${i.status}] ${claim}${impl ? ` — ${impl}` : ''}`)
    }
    out.push('')
  }

  out.push('=== END MEMORY CONTEXT ===')
  return out.join('\n')
}

// ---------------------------------------------------------------------------
// stats — used by the optional /api/memory/stats endpoint
// ---------------------------------------------------------------------------

export interface MemoryStats {
  vault: string
  leads: { total: number; byStatus: Record<LeadStatus, number> }
  entities: { total: number; byCategory: Record<string, number> }
  insights: { total: number; byStatus: Record<string, number> }
}

export function getMemoryStats(): MemoryStats {
  const leads: LeadProfile[] = []
  if (fs.existsSync(LEADS_DIR)) {
    for (const fn of fs.readdirSync(LEADS_DIR)) {
      if (!fn.endsWith('.md') || fn.startsWith('_') || fn.startsWith('.')) continue
      const handle = path.basename(fn, '.md')
      const p = getLeadProfile(handle)
      if (p) leads.push(p)
    }
  }
  const byStatus: Record<string, number> = {}
  for (const l of leads) byStatus[l.status] = (byStatus[l.status] || 0) + 1

  const entityFiles = readMarkdownFiles(ENTITIES_DIR)
  const byCategory: Record<string, number> = {}
  for (const fp of entityFiles) {
    const { fm } = parseFrontmatter(fs.readFileSync(fp, 'utf-8'))
    const cat = String(fm.category || 'concept')
    byCategory[cat] = (byCategory[cat] || 0) + 1
  }

  const insightFiles = readMarkdownFiles(INSIGHTS_DIR)
  const insightStatus: Record<string, number> = {}
  for (const fp of insightFiles) {
    const { fm } = parseFrontmatter(fs.readFileSync(fp, 'utf-8'))
    const st = String(fm.status || 'hypothesis')
    insightStatus[st] = (insightStatus[st] || 0) + 1
  }

  return {
    vault: VAULT,
    leads: { total: leads.length, byStatus: byStatus as Record<LeadStatus, number> },
    entities: { total: entityFiles.length, byCategory },
    insights: { total: insightFiles.length, byStatus: insightStatus },
  }
}

export const _internal = {
  VAULT,
  LEADS_DIR,
  ENTITIES_DIR,
  INSIGHTS_DIR,
  PABLO_DIR,
  leadFilename,
  serializeLeadFile,
  defaultProfile,
}
