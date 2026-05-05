#!/usr/bin/env tsx
//
// Backfill the openclaw-memory vault from Mars artifacts in
// /Users/pablo/Projects/Mars/Mars/content/{replies,dms}.
//
// For every Mars reply/DM artifact we synthesize an OutboundThreadLike payload
// and call memory.upsertLeadFromSend(thread, draftId). That function already
// handles dedup, frontmatter, serialization and round-tripping body fields, so
// re-running the script is idempotent and any manual edits Pablo has made to a
// lead profile body are preserved.
//
// Usage:
//   npx tsx --tsconfig tsconfig.node.json scripts/backfill-memory.ts \
//     [--dry-run] [--limit N] [--vault PATH] [--mars PATH]
//
// Notes on Mars artifact shapes we have to handle:
//   * Modern artifacts (most of them): frontmatter has `id` of the form
//     "<threadId>::<draftId>", plus `threadId`, `authorHandle`, `kind`,
//     `angleChosen`, `inReplyTo`, `matchedTrigger`, `authorFollowers`, etc.
//     Body sections: "## Original" + "## Sent".
//   * Legacy artifacts (early April 2026): `type: sent-dm` / `sent-reply`,
//     `recipientHandle` (sometimes empty), no `threadId`. Body sections are
//     "## Context" + "## DM sent" / "## Reply sent".
//
// We synthesize a stable noteId of "<threadId>::<draftId>" so the memory module
// can dedup on re-runs. For legacy artifacts that lack a "::" we synthesize a
// derived draftId so a second run still hits the same identity.

import fs from 'fs'
import path from 'path'

// -----------------------------------------------------------------------------
// CLI args
// -----------------------------------------------------------------------------

interface Args {
  dryRun: boolean
  limit: number | null
  vault: string | null
  mars: string
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dryRun: false,
    limit: null,
    vault: null,
    mars: '/Users/pablo/Projects/Mars/Mars/content',
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') args.dryRun = true
    else if (a === '--limit') {
      const n = Number(argv[++i])
      if (!Number.isFinite(n) || n <= 0) throw new Error(`--limit needs a positive integer, got ${argv[i]}`)
      args.limit = n
    } else if (a === '--vault') args.vault = argv[++i] ?? ''
    else if (a === '--mars') args.mars = argv[++i] ?? args.mars
    else if (a === '--help' || a === '-h') {
      console.log('Usage: backfill-memory [--dry-run] [--limit N] [--vault PATH] [--mars PATH]')
      process.exit(0)
    } else {
      throw new Error(`unknown argument: ${a}`)
    }
  }
  return args
}

const ARGS = parseArgs(process.argv.slice(2))

// IMPORTANT: set OPENCLAW_MEMORY_ROOT before importing memory.ts — the module
// captures the env var at import time into a top-level const.
if (ARGS.vault) {
  process.env.OPENCLAW_MEMORY_ROOT = ARGS.vault
}

// Use a top-level await dynamic import so the env-var override above lands
// before memory.ts initializes. The .js extension is required by ESM resolution
// even though the source is .ts (tsx resolves it).
const memory = await import('../server/memory.js')

// -----------------------------------------------------------------------------
// Frontmatter parser (small, tolerant — only what backfill needs)
// -----------------------------------------------------------------------------

type FmValue = string | number | boolean | null | FmValue[]

function parseFmValue(raw: string): FmValue {
  const v = raw.trim()
  if (v === '' || v === 'null') return null
  if (v === 'true') return true
  if (v === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim()
    if (!inner) return []
    const parts: string[] = []
    let inStr = false
    let cur = ''
    for (const ch of inner) {
      if (ch === '"' && cur.slice(-1) !== '\\') inStr = !inStr
      if (!inStr && ch === ',') { parts.push(cur); cur = ''; continue }
      cur += ch
    }
    if (cur.trim()) parts.push(cur)
    return parts.map((p) => parseFmValue(p))
  }
  // strip surrounding quotes
  return v.replace(/^"(.*)"$/, '$1')
}

interface ParsedMd {
  fm: Record<string, FmValue>
  body: string
}

function parseMarkdown(raw: string): ParsedMd {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return { fm: {}, body: raw }
  const fm: Record<string, FmValue> = {}
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1)
    fm[key] = parseFmValue(val)
  }
  return { fm, body: m[2] }
}

function fmString(fm: Record<string, FmValue>, key: string): string {
  const v = fm[key]
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  return String(v)
}

function fmNumberOrNull(fm: Record<string, FmValue>, key: string): number | null {
  const v = fm[key]
  return typeof v === 'number' ? v : null
}

// -----------------------------------------------------------------------------
// Section extractors
// -----------------------------------------------------------------------------

function sliceSection(body: string, heading: string): string {
  const re = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm')
  const start = body.search(re)
  if (start < 0) return ''
  const after = body.slice(start)
  const m = after.match(/^##\s+.+\n([\s\S]*?)(?=\n##\s+|\n---\s*$|$)/)
  return m ? m[1].trim() : ''
}

function extractOriginalPostText(body: string): string {
  // "## Original" content is block-quoted. Strip leading "> " from each line.
  const raw = sliceSection(body, 'Original')
  if (!raw) return ''
  // Drop trailing "[Open original on X](...)" line if present.
  const lines = raw.split('\n')
  const kept: string[] = []
  for (const ln of lines) {
    if (/^\[Open original/.test(ln.trim())) break
    kept.push(ln.replace(/^>\s?/, ''))
  }
  return kept.join('\n').trim()
}

function extractSentBody(body: string): string {
  // Try the headings used across modern + legacy artifacts.
  for (const h of ['Sent', 'Reply sent', 'DM sent']) {
    const s = sliceSection(body, h)
    if (s) return s
  }
  return ''
}

// -----------------------------------------------------------------------------
// Mars artifact → OutboundThreadLike
// -----------------------------------------------------------------------------

interface ParsedArtifact {
  filepath: string
  threadId: string
  draftId: string
  noteId: string
  thread: memory.OutboundThreadLike
  draftKind: 'reply' | 'dm' | 'repost'
  warnings: string[]
}

function deriveIdsFromFm(fm: Record<string, FmValue>, fallbackBase: string): { threadId: string, draftId: string } {
  const idVal = fmString(fm, 'id')
  const threadIdField = fmString(fm, 'threadId')
  if (idVal.includes('::')) {
    const [t, d] = idVal.split('::')
    return { threadId: threadIdField || t, draftId: d }
  }
  // Legacy artifact: flat id, no draftId. Use the id as both threadId and as
  // the basis for a synthetic draftId. The synthetic draftId is derived from
  // the file basename (stable across runs) so re-runs dedup correctly.
  const tid = threadIdField || idVal || fallbackBase
  const did = `legacy-${fallbackBase}`
  return { threadId: tid, draftId: did }
}

function getKind(fm: Record<string, FmValue>, defaultKind: 'reply' | 'dm'): 'reply' | 'dm' | 'repost' {
  const k = fmString(fm, 'kind').toLowerCase()
  if (k === 'reply' || k === 'dm' || k === 'repost') return k
  // Fallback to type field.
  const t = fmString(fm, 'type').toLowerCase()
  if (t === 'reply' || t === 'sent-reply') return 'reply'
  if (t === 'dm' || t === 'sent-dm') return 'dm'
  if (t === 'repost') return 'repost'
  return defaultKind
}

function isAcceptableType(fm: Record<string, FmValue>): boolean {
  const t = fmString(fm, 'type').toLowerCase()
  return t === 'reply' || t === 'dm' || t === 'sent-reply' || t === 'sent-dm' || t === 'repost'
}

function pickHandle(fm: Record<string, FmValue>): string {
  // Modern uses authorHandle, legacy uses recipientHandle (sometimes "@-prefixed",
  // sometimes empty). normalizeHandle handles both casing/prefix.
  const author = fmString(fm, 'authorHandle')
  if (author) return author
  return fmString(fm, 'recipientHandle')
}

function pickPlatform(fm: Record<string, FmValue>): string {
  const p = fmString(fm, 'platform').toLowerCase()
  return p || 'x'
}

function parseArtifact(filepath: string, defaultKind: 'reply' | 'dm'): ParsedArtifact | null {
  const raw = fs.readFileSync(filepath, 'utf-8')
  const { fm, body } = parseMarkdown(raw)
  if (!isAcceptableType(fm)) return null

  const handle = pickHandle(fm)
  const warnings: string[] = []
  if (!handle) {
    warnings.push(`${path.basename(filepath)}: no authorHandle/recipientHandle, skipping`)
    return { filepath, threadId: '', draftId: '', noteId: '', thread: null as unknown as memory.OutboundThreadLike, draftKind: defaultKind, warnings }
  }

  const fallbackBase = path.basename(filepath, '.md')
  const { threadId, draftId } = deriveIdsFromFm(fm, fallbackBase)
  const noteId = `${threadId}::${draftId}`

  const kind = getKind(fm, defaultKind)
  const originalPostText = extractOriginalPostText(body)
  const sentBody = extractSentBody(body)
  if (!originalPostText) {
    warnings.push(`${path.basename(filepath)}: missing "## Original" section`)
  }
  if (!sentBody) {
    warnings.push(`${path.basename(filepath)}: missing sent body section`)
  }

  const angle = fmString(fm, 'angleChosen') || (kind === 'dm' ? 'cold-dm' : 'reply')
  const sentAt = fmString(fm, 'sentAt') || null
  const createdAt = fmString(fm, 'createdAt') || sentAt || ''
  const updatedAt = fmString(fm, 'updatedAt') || sentAt || createdAt

  const thread: memory.OutboundThreadLike = {
    id: threadId,
    leadId: '',
    platform: pickPlatform(fm),
    authorHandle: handle,
    authorFollowers: fmNumberOrNull(fm, 'authorFollowers'),
    allowsDms: null,
    originalPostText,
    originalPostUrl: fmString(fm, 'inReplyTo') || fmString(fm, 'replyToUrl') || '',
    matchedTrigger: fmString(fm, 'matchedTrigger') || null,
    drafts: [{
      id: draftId,
      kind,
      angle,
      body: sentBody,
      editedBody: null,
      sentAt,
    }],
    createdAt,
    updatedAt,
    sentAt,
  }

  return { filepath, threadId, draftId, noteId, thread, draftKind: kind, warnings }
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

interface Stats {
  scanned: number
  skipped: number
  warningsCount: number
  created: number
  updated: number
  alreadyKnown: number
  errors: number
}

function listArtifacts(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((n) => n.endsWith('.md') && !n.startsWith('_') && !n.startsWith('.'))
    .map((n) => path.join(dir, n))
    .sort()
}

async function main(): Promise<void> {
  const repliesDir = path.join(ARGS.mars, 'replies')
  const dmsDir = path.join(ARGS.mars, 'dms')

  const replies = listArtifacts(repliesDir)
  const dms = listArtifacts(dmsDir)
  console.log(`[backfill] scanning ${repliesDir}/ (${replies.length} files)`)
  console.log(`[backfill] scanning ${dmsDir}/ (${dms.length} files)`)

  const allArtifacts: { filepath: string, defaultKind: 'reply' | 'dm' }[] = [
    ...replies.map((f) => ({ filepath: f, defaultKind: 'reply' as const })),
    ...dms.map((f) => ({ filepath: f, defaultKind: 'dm' as const })),
  ]

  const stats: Stats = {
    scanned: 0,
    skipped: 0,
    warningsCount: 0,
    created: 0,
    updated: 0,
    alreadyKnown: 0,
    errors: 0,
  }

  // Parse + group. We group by (handle, platform) so we know which leads are
  // single vs. multi-platform and can detect collisions.
  const parsed: ParsedArtifact[] = []
  const handlePlatforms = new Map<string, Set<string>>() // normalizedHandle -> set of platforms

  for (const { filepath, defaultKind } of allArtifacts) {
    if (ARGS.limit !== null && stats.scanned >= ARGS.limit) break
    stats.scanned++
    let p: ParsedArtifact | null
    try {
      p = parseArtifact(filepath, defaultKind)
    } catch (e) {
      console.warn(`[backfill] WARN parse failed for ${path.basename(filepath)}: ${(e as Error).message}`)
      stats.errors++
      continue
    }
    if (!p) {
      stats.skipped++
      continue
    }
    if (p.warnings.length) {
      for (const w of p.warnings) console.warn(`[backfill] WARN ${w}`)
      stats.warningsCount += p.warnings.length
    }
    if (!p.thread) {
      // had warnings about missing handle, can't proceed
      stats.skipped++
      continue
    }
    parsed.push(p)
    const normHandle = memory.normalizeHandle(p.thread.authorHandle)
    if (!handlePlatforms.has(normHandle)) handlePlatforms.set(normHandle, new Set())
    handlePlatforms.get(normHandle)!.add(p.thread.platform)
  }

  const pairCount = Array.from(handlePlatforms.values()).reduce((acc, s) => acc + s.size, 0)
  console.log(`[backfill] grouped into ${pairCount} unique (handle,platform) pairs`)

  // Detect cross-platform collisions (same handle, multiple platforms). Rare,
  // but log a warning per the spec. Filenames-with-suffix is left as a manual
  // fix because memory.upsertLeadFromSend writes to <handle>.md unconditionally;
  // the second platform would overwrite the first if they collided. In practice
  // this should be 0 hits for Pablo's data.
  for (const [h, plats] of handlePlatforms) {
    if (plats.size > 1) {
      console.warn(`[backfill] WARN collision for ${h}: present on ${[...plats].join(', ')}; same file will be reused (manual cleanup may be needed)`)
      stats.warningsCount++
    }
  }

  // Group artifacts per output file (one lead file per normalized handle).
  // Track which leads we've touched so we can compute "created" vs "updated".
  // For dry-run we simulate using leadFileExists() snapshot at start, plus a
  // local "touched" set for deduplication of the print line.
  const initiallyExisting = new Set<string>()
  for (const h of handlePlatforms.keys()) {
    if (memory.leadFileExists(h)) initiallyExisting.add(h)
  }

  // For dry-run, dedup interactions in-memory by (handle, noteId).
  const dryRunSeen = new Map<string, Set<string>>() // handle -> set of noteIds
  // also pre-seed with already-logged interactions from existing files so
  // dry-run "would log M new" is accurate
  if (ARGS.dryRun) {
    for (const h of initiallyExisting) {
      const existing = memory.getLeadProfile(h)
      if (existing) dryRunSeen.set(h, new Set(existing.marsNoteIds))
    }
  }

  // Counters per lead for the human-readable line.
  const perLead = new Map<string, { newInteractions: number, alreadyKnown: number }>()

  for (const p of parsed) {
    const handle = memory.normalizeHandle(p.thread.authorHandle)
    if (!perLead.has(handle)) perLead.set(handle, { newInteractions: 0, alreadyKnown: 0 })
    const acc = perLead.get(handle)!

    if (ARGS.dryRun) {
      const seen = dryRunSeen.get(handle) ?? new Set<string>()
      if (seen.has(p.noteId)) {
        acc.alreadyKnown++
        stats.alreadyKnown++
      } else {
        seen.add(p.noteId)
        dryRunSeen.set(handle, seen)
        acc.newInteractions++
      }
      continue
    }

    try {
      const result = memory.upsertLeadFromSend(p.thread, p.draftId)
      if (result.skipped && result.reason) {
        console.warn(`[backfill] WARN skipped ${path.basename(p.filepath)}: ${result.reason}`)
        stats.warningsCount++
        continue
      }
      if (result.skipped) {
        // already-logged interaction (idempotent path)
        acc.alreadyKnown++
        stats.alreadyKnown++
      } else {
        acc.newInteractions++
      }
    } catch (e) {
      console.error(`[backfill] ERROR upsert failed for ${path.basename(p.filepath)}: ${(e as Error).message}`)
      stats.errors++
    }
  }

  // Print per-lead summary lines.
  let totalLeadsWritten = 0
  let totalInteractionsLogged = 0
  for (const [handle, counts] of perLead) {
    const wasNew = !initiallyExisting.has(handle)
    let verb: string
    if (ARGS.dryRun) verb = wasNew ? 'would create' : 'would update'
    else verb = wasNew ? 'created' : 'updated'

    const newPart = counts.newInteractions === 1 ? '1 interaction' : `${counts.newInteractions} interactions`
    let line = `[backfill] ${handle} ${verb}`
    if (wasNew) {
      line += ` (${newPart})`
    } else {
      const knownPart = counts.alreadyKnown === 1 ? '1 already known' : `${counts.alreadyKnown} already known`
      const newPhrase = counts.newInteractions === 1 ? '1 new interaction' : `${counts.newInteractions} new interactions`
      line += ` (${newPhrase}, ${knownPart})`
    }
    console.log(line)

    if (counts.newInteractions > 0 || wasNew) totalLeadsWritten++
    totalInteractionsLogged += counts.newInteractions
  }
  // For dry run, "leads written" is leads that would be written (all touched).
  if (ARGS.dryRun) {
    totalLeadsWritten = perLead.size
    stats.created = Array.from(perLead.keys()).filter((h) => !initiallyExisting.has(h)).length
    stats.updated = Array.from(perLead.keys()).filter((h) => initiallyExisting.has(h)).length
  } else {
    stats.created = Array.from(perLead.keys()).filter((h) => !initiallyExisting.has(h)).length
    stats.updated = Array.from(perLead.keys()).filter((h) => initiallyExisting.has(h)).length
  }

  const verb = ARGS.dryRun ? 'would write' : 'leads written'
  const intVerb = ARGS.dryRun ? 'would log' : 'interactions logged'
  console.log(
    `[backfill] done: ${totalLeadsWritten} ${verb}, ${totalInteractionsLogged} ${intVerb}, ${stats.errors} errors` +
    (stats.warningsCount > 0 ? `, ${stats.warningsCount} warnings` : ''),
  )

  if (stats.errors > 0) process.exit(1)
}

main().catch((e) => {
  console.error('[backfill] FATAL:', e)
  process.exit(1)
})
