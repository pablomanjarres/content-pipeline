import fs from 'fs'
import path from 'path'
import YAML from 'yaml'

const MARS_VAULT_ROOT = process.env.MARS_VAULT_ROOT || '/Users/pablo/Projects/Mars/Mars'
const WATCHLIST_PATH = path.join(MARS_VAULT_ROOT, '03-content-system', 'research', 'viral-watchlist.md')

const VALID_PLATFORMS = new Set(['youtube', 'instagram', 'tiktok', 'twitter', 'linkedin'])

export interface WatchlistCreator {
  handle: string
  platforms: string[]
  channel_ids: Record<string, string>
  tags: string[]
  priority: number
  notes?: string
}

export interface WatchlistParseResult {
  ok: boolean
  creators: WatchlistCreator[]
  errors: string[]
}

export function loadWatchlistFromVault(): WatchlistParseResult {
  const errors: string[] = []
  if (!fs.existsSync(WATCHLIST_PATH)) {
    return { ok: false, creators: [], errors: [`Watchlist not found at ${WATCHLIST_PATH}`] }
  }
  const raw = fs.readFileSync(WATCHLIST_PATH, 'utf-8')
  const match = raw.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return { ok: false, creators: [], errors: ['No frontmatter block in viral-watchlist.md'] }

  let fm: Record<string, unknown>
  try {
    fm = YAML.parse(match[1]) || {}
  } catch (e) {
    return { ok: false, creators: [], errors: [`YAML parse error: ${(e as Error).message}`] }
  }

  const rawCreators = Array.isArray(fm.creators) ? fm.creators : []
  const creators: WatchlistCreator[] = []
  const seen = new Set<string>()

  for (const [i, entry] of rawCreators.entries()) {
    if (!entry || typeof entry !== 'object') {
      errors.push(`creators[${i}]: not an object`)
      continue
    }
    const e = entry as Record<string, unknown>
    const handle = typeof e.handle === 'string' ? e.handle.trim() : ''
    if (!handle) { errors.push(`creators[${i}]: missing handle`); continue }
    if (seen.has(handle)) { errors.push(`creators[${i}]: duplicate handle "${handle}"`); continue }
    seen.add(handle)

    const platforms = Array.isArray(e.platforms)
      ? e.platforms.filter((p): p is string => typeof p === 'string').map((p) => p.toLowerCase())
      : []
    const invalidPlatforms = platforms.filter((p) => !VALID_PLATFORMS.has(p))
    if (invalidPlatforms.length) errors.push(`creators[${i}] (${handle}): invalid platforms ${invalidPlatforms.join(', ')}`)
    if (!platforms.length) { errors.push(`creators[${i}] (${handle}): no valid platforms`); continue }

    const channelIds: Record<string, string> = {}
    if (e.channel_ids && typeof e.channel_ids === 'object' && !Array.isArray(e.channel_ids)) {
      for (const [k, v] of Object.entries(e.channel_ids as Record<string, unknown>)) {
        if (typeof v === 'string' && VALID_PLATFORMS.has(k.toLowerCase())) channelIds[k.toLowerCase()] = v.trim()
      }
    }

    const tags = Array.isArray(e.tags)
      ? e.tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean)
      : []
    const priority = typeof e.priority === 'number' && e.priority >= 1 && e.priority <= 10 ? Math.floor(e.priority) : 5
    const notes = typeof e.notes === 'string' ? e.notes : undefined

    creators.push({ handle, platforms, channel_ids: channelIds, tags, priority, notes })
  }

  return { ok: errors.length === 0, creators, errors }
}

export interface SyncResult {
  ok: boolean
  inserted: number
  updated: number
  reactivated: number
  deactivated: number
  errors: string[]
}

interface SupabaseRow {
  id: string
  handle: string
  is_active: boolean
}

async function supabaseFetch(pathQuery: string, init: RequestInit = {}): Promise<Response> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set in environment')
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...((init.headers as Record<string, string>) || {}),
  }
  return fetch(`${url}/rest/v1${pathQuery}`, { ...init, headers })
}

export async function syncWatchlistToSupabase(): Promise<SyncResult> {
  const parsed = loadWatchlistFromVault()
  if (!parsed.ok) {
    return { ok: false, inserted: 0, updated: 0, reactivated: 0, deactivated: 0, errors: parsed.errors }
  }

  const existingRes = await supabaseFetch('/viral_creators?select=id,handle,is_active')
  if (!existingRes.ok) {
    return {
      ok: false, inserted: 0, updated: 0, reactivated: 0, deactivated: 0,
      errors: [`fetch existing: ${existingRes.status} ${await existingRes.text()}`],
    }
  }
  const existing: SupabaseRow[] = await existingRes.json()
  const existingByHandle = new Map(existing.map((r) => [r.handle, r]))

  let inserted = 0, updated = 0, reactivated = 0, deactivated = 0
  const errors: string[] = []
  const vaultHandles = new Set(parsed.creators.map((c) => c.handle))

  for (const c of parsed.creators) {
    const row = {
      handle: c.handle,
      platforms: c.platforms,
      channel_ids: c.channel_ids,
      tags: c.tags,
      priority: c.priority,
      notes: c.notes ?? null,
      is_active: true,
    }
    const prev = existingByHandle.get(c.handle)
    const res = await supabaseFetch(
      '/viral_creators?on_conflict=handle',
      {
        method: 'POST',
        headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
        body: JSON.stringify(row),
      },
    )
    if (!res.ok) {
      errors.push(`upsert ${c.handle}: ${res.status} ${await res.text()}`)
      continue
    }
    if (!prev) inserted++
    else if (!prev.is_active) reactivated++
    else updated++
  }

  for (const row of existing) {
    if (vaultHandles.has(row.handle)) continue
    if (!row.is_active) continue
    const res = await supabaseFetch(`/viral_creators?id=eq.${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: false }),
    })
    if (!res.ok) errors.push(`deactivate ${row.handle}: ${res.status} ${await res.text()}`)
    else deactivated++
  }

  return { ok: errors.length === 0, inserted, updated, reactivated, deactivated, errors }
}

export async function fetchRecentIntel(opts: { limit?: number; tags?: string[]; days?: number } = {}): Promise<unknown[]> {
  const limit = Math.max(1, Math.min(opts.limit ?? 50, 200))
  const days = Math.max(1, Math.min(opts.days ?? 30, 90))
  const params = new URLSearchParams()
  params.set('select', '*')
  params.set('order', 'score.desc')
  params.set('limit', String(limit))
  params.set('posted_at', `gte.${new Date(Date.now() - days * 86400000).toISOString()}`)
  if (opts.tags && opts.tags.length) params.append('pattern_tags', `cs.{${opts.tags.join(',')}}`)
  const res = await supabaseFetch(`/viral_intel_recent?${params.toString()}`)
  if (!res.ok) throw new Error(`fetch viral_intel_recent: ${res.status} ${await res.text()}`)
  return res.json()
}
