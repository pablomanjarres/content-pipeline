// Algolia REST client + indexer. No SDK dependency, raw fetch.
// Server-side only. Reads ALGOLIA_APP_ID and ALGOLIA_API_KEY from env.
// The key Pablo provided is admin-tier (it can saveObjects), so this module
// must NEVER run in the browser. The /api/algolia/* routes mediate access.
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

export type AlgoliaHit = Record<string, any> & { objectID: string }

export const ALGOLIA_INDICES = ['leads_index', 'dms_index', 'voice_anchors_index'] as const
export type AlgoliaIndex = typeof ALGOLIA_INDICES[number]

function creds() {
  const appId = process.env.ALGOLIA_APP_ID
  const apiKey = process.env.ALGOLIA_API_KEY
  if (!appId || !apiKey) {
    throw new Error('ALGOLIA_APP_ID or ALGOLIA_API_KEY missing in env')
  }
  return { appId, apiKey }
}

function dsnHost(appId: string) { return `https://${appId}-dsn.algolia.net` }
function writeHost(appId: string) { return `https://${appId}.algolia.net` }

async function call(host: string, route: string, init?: RequestInit) {
  const { appId, apiKey } = creds()
  const res = await fetch(`${host}${route}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Algolia-Application-Id': appId,
      'X-Algolia-API-Key': apiKey,
      ...(init?.headers || {}),
    },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`algolia ${res.status}: ${text.slice(0, 300)}`)
  }
  return text ? JSON.parse(text) : {}
}

export async function searchIndex(
  index: AlgoliaIndex,
  query: string,
  hitsPerPage = 10,
): Promise<{ hits: AlgoliaHit[]; nbHits: number }> {
  const { appId } = creds()
  const params = new URLSearchParams({ query, hitsPerPage: String(hitsPerPage) }).toString()
  return call(dsnHost(appId), `/1/indexes/${encodeURIComponent(index)}/query`, {
    method: 'POST',
    body: JSON.stringify({ params }),
  })
}

export async function clearIndex(index: AlgoliaIndex): Promise<void> {
  const { appId } = creds()
  await call(writeHost(appId), `/1/indexes/${encodeURIComponent(index)}/clear`, {
    method: 'POST', body: '{}',
  })
}

export async function pushObjects(index: AlgoliaIndex, records: AlgoliaHit[]): Promise<void> {
  if (records.length === 0) return
  const { appId } = creds()
  const requests = records.map((body) => ({ action: 'addObject', body }))
  await call(writeHost(appId), `/1/indexes/${encodeURIComponent(index)}/batch`, {
    method: 'POST', body: JSON.stringify({ requests }),
  })
}

// --- Indexers ---

const MARS_ROOT = process.env.MARS_VAULT_ROOT || path.join(os.homedir(), 'Projects', 'Mars', 'Mars')

async function readMarkdownDir(dir: string): Promise<Array<{ path: string; name: string; body: string }>> {
  try {
    const entries = await fs.readdir(dir)
    const out: Array<{ path: string; name: string; body: string }> = []
    for (const f of entries) {
      if (!f.endsWith('.md')) continue
      const full = path.join(dir, f)
      const body = await fs.readFile(full, 'utf-8').catch(() => '')
      if (body.trim()) out.push({ path: full, name: f, body })
    }
    return out
  } catch {
    return []
  }
}

function snippet(s: string, max = 280): string {
  const cleaned = s.replace(/^---[\s\S]*?---/m, '').trim()
  return cleaned.length > max ? cleaned.slice(0, max) + '...' : cleaned
}

export async function indexDms(): Promise<number> {
  const dir = path.join(MARS_ROOT, 'content', 'dms')
  const docs = await readMarkdownDir(dir)
  await clearIndex('dms_index')
  const records = docs.map((d, i) => ({
    objectID: `dms:${d.name}`,
    title: d.name.replace(/\.md$/, ''),
    path: d.path,
    snippet: snippet(d.body),
    body: d.body.slice(0, 4000),
    source: 'mars/dms',
    indexedAt: new Date().toISOString(),
    _i: i,
  }))
  await pushObjects('dms_index', records)
  return records.length
}

export async function indexVoiceAnchors(): Promise<number> {
  const dir = path.join(MARS_ROOT, 'content', 'voice-anchors')
  const docs = await readMarkdownDir(dir)
  await clearIndex('voice_anchors_index')
  const records = docs.map((d, i) => ({
    objectID: `va:${d.name}`,
    title: d.name.replace(/\.md$/, ''),
    path: d.path,
    snippet: snippet(d.body),
    body: d.body.slice(0, 4000),
    source: 'mars/voice-anchors',
    indexedAt: new Date().toISOString(),
    _i: i,
  }))
  await pushObjects('voice_anchors_index', records)
  return records.length
}

// Indexes Supabase leads. Caller must provide a `sb` helper that hits the REST API.
// Walks pages of 1000 rows until exhausted to handle the 5k-leads-and-growing dataset.
export async function indexLeads(
  sb: (path: string, init?: RequestInit) => Promise<Response>,
): Promise<number> {
  await clearIndex('leads_index')
  let total = 0
  let from = 0
  const PAGE = 1000
  while (true) {
    const res = await sb(
      `/leads?select=id,post_id,author_handle,post_text,status,matched_trigger_id,created_at&order=created_at.desc&limit=${PAGE}&offset=${from}`,
    )
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      throw new Error(`supabase leads paging failed: ${res.status} ${t.slice(0, 200)}`)
    }
    const rows = await res.json() as Array<any>
    if (rows.length === 0) break
    const records: AlgoliaHit[] = rows.map((r) => ({
      objectID: `lead:${r.id}`,
      leadId: r.id,
      postId: r.post_id,
      authorHandle: r.author_handle,
      postText: r.post_text,
      status: r.status,
      matchedTriggerId: r.matched_trigger_id,
      createdAt: r.created_at,
      source: 'supabase/leads',
    }))
    await pushObjects('leads_index', records)
    total += records.length
    from += rows.length
    if (rows.length < PAGE) break
  }
  return total
}
