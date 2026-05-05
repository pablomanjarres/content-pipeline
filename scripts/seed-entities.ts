// Seed the openclaw-memory entity graph from existing Mars outbound artifacts.
//
// Why this exists: the backfill (scripts/backfill-memory.ts) creates one lead
// profile per author handle, but the "Topics they care about" wikilinks stay
// empty because we never wired entity extraction into the discovery pipeline.
// The consolidation pass needs those wikilinks to do anything useful — without
// them every lead is an orphan and Pass 1 sees 0 promotions.
//
// This script does a one-shot pass: walk Mars replies/ and dms/, scan each
// artifact's "## Original" section against a curated list of known
// Nella-relevant entities (tools, concepts, competitors), and on a hit:
//   1. add `[[entities/<slug>]]` to the lead's "Topics they care about"
//   2. create entities/<slug>.md if it doesn't exist (using the template)
//   3. bump the entity's mention_count + last_seen
//
// Idempotent: re-running just refreshes mention counts. Pablo's edits to lead
// or entity bodies are preserved (we only touch the wikilink list and
// frontmatter counters).
//
// Run:
//   npx tsx scripts/seed-entities.ts [--dry-run] [--mars PATH] [--vault PATH]

import fs from 'fs'
import path from 'path'
import os from 'os'

import * as memory from '../server/memory.js'

const args = new Set(process.argv.slice(2))
const argv = process.argv.slice(2)
const flag = (name: string, fallback: string): string => {
  const idx = argv.indexOf(name)
  return idx >= 0 && argv[idx + 1] ? argv[idx + 1] : fallback
}

const DRY = args.has('--dry-run')
const MARS_CONTENT = flag('--mars', '/Users/pablo/Projects/Mars/Mars/content')
const VAULT = flag('--vault', '/Users/pablo/Projects/openclaw-memory')
if (process.env.OPENCLAW_MEMORY_ROOT === undefined) {
  process.env.OPENCLAW_MEMORY_ROOT = VAULT
}

const ENTITIES_DIR = path.join(VAULT, 'entities')

// Curated seed list. The point isn't to be exhaustive; it's to populate the
// graph with the entities Nella conversations actually orbit. Adding new ones
// is a one-line append. The consolidation pass auto-promotes additional
// entities once the discovery pipeline starts tagging them, but that loop
// only closes after this seed exists.
type Seed = {
  slug: string
  name: string
  category: 'tool' | 'concept' | 'competitor' | 'company' | 'community' | 'product' | 'person'
  aliases: string[]
}

const SEEDS: Seed[] = [
  // tools the audience uses
  { slug: 'cursor', name: 'Cursor', category: 'tool', aliases: ['cursor.com', 'cursor ide', 'cursor editor'] },
  { slug: 'claude-code', name: 'Claude Code', category: 'tool', aliases: ['claudecode', 'claude code cli'] },
  { slug: 'windsurf', name: 'Windsurf', category: 'tool', aliases: ['codeium windsurf'] },
  { slug: 'aider', name: 'Aider', category: 'tool', aliases: ['aider.chat'] },
  { slug: 'cline', name: 'Cline', category: 'tool', aliases: [] },
  { slug: 'codex-cli', name: 'Codex CLI', category: 'tool', aliases: ['codex cli', 'openai codex'] },
  { slug: 'github-copilot', name: 'GitHub Copilot', category: 'tool', aliases: ['github copilot', 'copilot'] },

  // companies / model providers
  { slug: 'anthropic', name: 'Anthropic', category: 'company', aliases: ['claude'] },
  { slug: 'openai', name: 'OpenAI', category: 'company', aliases: ['gpt-4', 'gpt-5', 'chatgpt'] },

  // competitors
  { slug: 'coderabbit', name: 'CodeRabbit', category: 'competitor', aliases: ['code rabbit'] },
  { slug: 'greptile', name: 'Greptile', category: 'competitor', aliases: [] },
  { slug: 'cody', name: 'Cody', category: 'competitor', aliases: ['sourcegraph cody', 'sourcegraph'] },
  { slug: 'sourcery', name: 'Sourcery', category: 'competitor', aliases: [] },

  // concepts that drive the conversation
  { slug: 'mcp', name: 'MCP', category: 'concept', aliases: ['model context protocol'] },
  { slug: 'rag', name: 'RAG', category: 'concept', aliases: ['retrieval augmented generation', 'retrieval-augmented'] },
  { slug: 'hallucination', name: 'Hallucination', category: 'concept', aliases: ['hallucinating', 'hallucinated', 'hallucinates'] },
  { slug: 'agent-context', name: 'Agent context', category: 'concept', aliases: ['context window', 'lost context', 'context layer'] },
  { slug: 'codebase-indexing', name: 'Codebase indexing', category: 'concept', aliases: ['code indexing', 'index the codebase', 'indexed repo', 'indexed codebase'] },
  { slug: 'prompt-injection', name: 'Prompt injection', category: 'concept', aliases: ['prompt-injection'] },
  { slug: 'dependency-drift', name: 'Dependency drift', category: 'concept', aliases: ['drift detection', 'stale index'] },
  { slug: 'token-cost', name: 'Token cost', category: 'concept', aliases: ['token spend', 'burning quota', 'rate limit', 'token expenditure', 'context bill'] },
  { slug: 'agent-grounding', name: 'Agent grounding', category: 'concept', aliases: ['ground the agent', 'grounded search'] },
  { slug: 'cursor-rules', name: 'Cursor rules', category: 'concept', aliases: ['.cursorrules'] },

  // communities
  { slug: 'r-claudeai', name: 'r/ClaudeAI', category: 'community', aliases: ['/r/claudeai'] },
  { slug: 'r-cursor', name: 'r/cursor', category: 'community', aliases: ['/r/cursor'] },
  { slug: 'hn', name: 'Hacker News', category: 'community', aliases: ['hackernews', 'ycombinator'] },
]

function lower(s: string): string {
  return s.toLowerCase()
}

function detectEntities(text: string): Seed[] {
  if (!text) return []
  const haystack = lower(text)
  const hits: Seed[] = []
  for (const s of SEEDS) {
    const needles = [s.name, ...s.aliases].map(lower)
    if (needles.some((n) => n && haystack.includes(n))) hits.push(s)
  }
  return hits
}

// ---- Mars artifact reader ----

function listMd(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((n) => n.endsWith('.md') && !n.startsWith('.'))
    .map((n) => path.join(dir, n))
}

function parseFrontmatter(raw: string): { fm: Record<string, unknown>; body: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return { fm: {}, body: raw }
  const fm: Record<string, unknown> = {}
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1).trim()
    if (val === 'null' || val === '') fm[key] = null
    else if (/^-?\d+$/.test(val)) fm[key] = Number(val)
    else if (val === 'true' || val === 'false') fm[key] = val === 'true'
    else fm[key] = val.replace(/^"|"$/g, '')
  }
  return { fm, body: m[2] }
}

function originalPostText(body: string): string {
  // Match "## Original" or "## Context" (legacy artifacts use Context) until next ## or ---
  const m = body.match(/^##\s+(?:Original|Context)\s*\n([\s\S]*?)(?=\n##\s+|\n---\s*$)/m)
  if (!m) return ''
  // Strip blockquote prefix
  return m[1].split('\n').map((l) => l.replace(/^>\s?/, '')).join('\n').trim()
}

// ---- entity file management ----

interface EntityState {
  slug: string
  name: string
  category: string
  aliases: string[]
  firstSeen: string
  lastSeen: string
  mentionCount: number
  contributingHandles: Set<string>
}

function loadOrCreateEntityState(seed: Seed): EntityState {
  const fp = path.join(ENTITIES_DIR, `${seed.slug}.md`)
  const today = new Date().toISOString().slice(0, 10)
  if (!fs.existsSync(fp)) {
    return {
      slug: seed.slug,
      name: seed.name,
      category: seed.category,
      aliases: seed.aliases,
      firstSeen: today,
      lastSeen: today,
      mentionCount: 0,
      contributingHandles: new Set(),
    }
  }
  const raw = fs.readFileSync(fp, 'utf-8')
  const { fm } = parseFrontmatter(raw)
  return {
    slug: seed.slug,
    name: seed.name,
    category: String(fm.category || seed.category),
    aliases: seed.aliases,
    firstSeen: String(fm.first_seen || today),
    lastSeen: today,
    mentionCount: typeof fm.mention_count === 'number' ? fm.mention_count : 0,
    contributingHandles: new Set(),
  }
}

function fmString(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (Array.isArray(v)) return `[${v.map((x) => fmString(x)).join(', ')}]`
  if (typeof v === 'string') return JSON.stringify(v)
  return String(v)
}

function frontmatter(obj: Record<string, unknown>): string {
  const lines = ['---']
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue
    lines.push(`${k}: ${fmString(v)}`)
  }
  lines.push('---')
  return lines.join('\n')
}

function serializeEntity(s: EntityState): string {
  const fm = frontmatter({
    type: 'entity',
    category: s.category,
    aliases: s.aliases,
    first_seen: s.firstSeen,
    last_seen: s.lastSeen,
    mention_count: s.mentionCount,
    sentiment_distribution: '{ positive: 0, neutral: 0, negative: 0 }',
  })
  // Note: nested objects in frontmatter — we cheat with a quoted string here
  // to keep the writer simple. The consolidation pass parses sentiment_distribution
  // from leads, not from this seed file, so the value is informational.

  const lines: string[] = [
    fm, '',
    `# ${s.name}`, '',
    '## What it is', '',
    '_(seeded entity; body to be summarized by the consolidation pass or by Pablo)_', '',
    '## Why it matters to Pablo / Nella', '',
    `_(${s.category}; aliases: ${s.aliases.join(', ') || 'none'})_`, '',
    '## How leads talk about it', '',
    `Seeded from ${s.contributingHandles.size} unique lead${s.contributingHandles.size === 1 ? '' : 's'} mentioning this term in their original posts.`, '',
    '## Related entities', '',
    '_(populated by consolidation pass)_', '',
    '## Backlinks', '',
    'Obsidian populates this automatically via the backlinks panel.', '',
  ]
  return lines.join('\n')
}

// ---- main ----

async function main() {
  console.log(`[seed-entities] mars=${MARS_CONTENT} vault=${VAULT} dry-run=${DRY}`)

  const replyFiles = listMd(path.join(MARS_CONTENT, 'replies'))
  const dmFiles = listMd(path.join(MARS_CONTENT, 'dms'))
  console.log(`[seed-entities] scanning ${replyFiles.length} replies + ${dmFiles.length} dms`)

  // handle → Set<slug>
  const leadTopics = new Map<string, Set<string>>()
  // slug → EntityState
  const entityStates = new Map<string, EntityState>()
  for (const seed of SEEDS) entityStates.set(seed.slug, loadOrCreateEntityState(seed))

  let scanned = 0
  let scannedWithText = 0
  for (const fp of [...replyFiles, ...dmFiles]) {
    scanned++
    const raw = fs.readFileSync(fp, 'utf-8')
    const { fm, body } = parseFrontmatter(raw)
    const handle = String(fm.authorHandle || fm.recipientHandle || '').trim()
    if (!handle) continue
    const text = originalPostText(body)
    if (!text) continue
    scannedWithText++

    const hits = detectEntities(text)
    if (hits.length === 0) continue

    const norm = memory.normalizeHandle(handle)
    if (!leadTopics.has(norm)) leadTopics.set(norm, new Set())
    for (const h of hits) {
      leadTopics.get(norm)!.add(h.slug)
      const st = entityStates.get(h.slug)!
      st.mentionCount++
      st.lastSeen = new Date().toISOString().slice(0, 10)
      st.contributingHandles.add(norm)
    }
  }

  console.log(`[seed-entities] ${scannedWithText}/${scanned} artifacts had original-post text`)
  console.log(`[seed-entities] ${leadTopics.size} leads will get entity wikilinks`)
  let touchedEntities = 0
  for (const st of entityStates.values()) if (st.mentionCount > 0) touchedEntities++
  console.log(`[seed-entities] ${touchedEntities}/${SEEDS.length} entities had at least one mention`)

  if (DRY) {
    console.log()
    console.log('[seed-entities] DRY RUN — top 10 entities by mentions:')
    const sorted = [...entityStates.values()]
      .filter((s) => s.mentionCount > 0)
      .sort((a, b) => b.mentionCount - a.mentionCount)
    for (const s of sorted.slice(0, 10)) {
      console.log(`  ${s.slug.padEnd(22)} ${String(s.mentionCount).padStart(3)} mentions across ${s.contributingHandles.size} unique leads`)
    }
    return
  }

  // Write entity files (only those with hits)
  if (!fs.existsSync(ENTITIES_DIR)) fs.mkdirSync(ENTITIES_DIR, { recursive: true })
  let entitiesWritten = 0
  for (const st of entityStates.values()) {
    if (st.mentionCount === 0) continue
    const fp = path.join(ENTITIES_DIR, `${st.slug}.md`)
    fs.writeFileSync(fp, serializeEntity(st))
    entitiesWritten++
  }

  // Update lead profiles' "Topics they care about"
  let leadsUpdated = 0
  for (const [handle, slugs] of leadTopics) {
    const profile = memory.getLeadProfile(handle)
    if (!profile) continue
    const merged = new Set<string>([...profile.topicsTheyCareAbout, ...slugs])
    if (merged.size === profile.topicsTheyCareAbout.length) continue
    profile.topicsTheyCareAbout = [...merged].sort()
    // write back via the memory module's serializer
    const fp = memory._internal.leadFilename(profile.handle)
    fs.writeFileSync(fp, memory._internal.serializeLeadFile(profile))
    leadsUpdated++
  }

  console.log()
  console.log(`[seed-entities] done: ${entitiesWritten} entity files written, ${leadsUpdated} lead profiles updated`)
}

main().catch((e) => {
  console.error('[seed-entities] fatal:', e)
  process.exit(1)
})
