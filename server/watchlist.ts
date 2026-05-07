// Watchlist handles — Supabase-backed CRUD for the tiered radar.
//
// Source of truth lives in `public.watchlist_handles`. Routes here are the
// only thing the CP UI talks to; the watchlist-radar worker on the VM reads
// the same table directly.

import type { Request, Response } from 'express'

const Tiers = ['T1', 'T2', 'T3'] as const
export type Tier = (typeof Tiers)[number]

export interface WatchlistHandle {
  id: string
  name: string
  x_handle: string | null
  linkedin_url: string | null
  tier: Tier
  enabled: boolean
  notes: string | null
  last_polled_x: string | null
  last_polled_li: string | null
  last_post_id_x: string | null
  last_post_id_li: string | null
  created_at: string
  updated_at: string
}

function sb() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
  return { url: url.replace(/\/$/, ''), key }
}

async function sbFetch(pathQuery: string, init: RequestInit = {}) {
  const { url, key } = sb()
  return fetch(`${url}/rest/v1${pathQuery}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...((init.headers as Record<string, string>) || {}),
    },
  })
}

function normalizeHandle(s: unknown): string | null {
  if (typeof s !== 'string') return null
  const t = s.trim().replace(/^@/, '')
  return t === '' ? null : t
}

function normalizeUrl(s: unknown): string | null {
  if (typeof s !== 'string') return null
  const t = s.trim()
  return t === '' ? null : t
}

function validateTier(t: unknown): Tier {
  if (t !== 'T1' && t !== 'T2' && t !== 'T3') {
    throw new Error('tier must be one of T1, T2, T3')
  }
  return t
}

function pickPayload(body: Record<string, unknown>, partial: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!partial || 'name' in body) {
    if (typeof body.name !== 'string' || body.name.trim() === '') {
      throw new Error('name is required')
    }
    out.name = body.name.trim()
  }
  if (!partial || 'tier' in body) {
    out.tier = validateTier(body.tier)
  }
  if (!partial || 'x_handle' in body) out.x_handle = normalizeHandle(body.x_handle)
  if (!partial || 'linkedin_url' in body) out.linkedin_url = normalizeUrl(body.linkedin_url)
  if (!partial || 'enabled' in body) out.enabled = body.enabled !== false
  if (!partial || 'notes' in body) {
    out.notes = typeof body.notes === 'string' && body.notes.trim() !== '' ? body.notes.trim() : null
  }
  if (!partial && !out.x_handle && !out.linkedin_url) {
    throw new Error('at least one of x_handle or linkedin_url is required')
  }
  return out
}

export async function listHandles(req: Request, res: Response): Promise<void> {
  try {
    const r = await sbFetch('/watchlist_handles?select=*&order=tier.asc,name.asc')
    if (!r.ok) {
      res.status(502).json({ error: `supabase ${r.status}: ${await r.text()}` })
      return
    }
    res.json(await r.json())
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
}

export async function createHandle(req: Request, res: Response): Promise<void> {
  try {
    const payload = pickPayload(req.body || {}, false)
    const r = await sbFetch('/watchlist_handles', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    if (!r.ok) {
      const txt = await r.text()
      const status = r.status === 409 || /duplicate key/i.test(txt) ? 409 : 502
      res.status(status).json({ error: `supabase ${r.status}: ${txt}` })
      return
    }
    const rows = (await r.json()) as WatchlistHandle[]
    res.json(rows[0] ?? null)
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
  }
}

export async function patchHandle(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id
    if (typeof id !== 'string' || !id) { res.status(400).json({ error: 'id required' }); return }
    const payload = pickPayload(req.body || {}, true)
    if (Object.keys(payload).length === 0) {
      res.status(400).json({ error: 'no editable fields in body' })
      return
    }
    const r = await sbFetch(`/watchlist_handles?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
    if (!r.ok) {
      res.status(502).json({ error: `supabase ${r.status}: ${await r.text()}` })
      return
    }
    const rows = (await r.json()) as WatchlistHandle[]
    res.json(rows[0] ?? null)
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
  }
}

export async function deleteHandle(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id
    if (typeof id !== 'string' || !id) { res.status(400).json({ error: 'id required' }); return }
    const r = await sbFetch(`/watchlist_handles?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    if (!r.ok) {
      res.status(502).json({ error: `supabase ${r.status}: ${await r.text()}` })
      return
    }
    res.json({ ok: true, id })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
}

// Stats roll-up — used on the page header (per-tier counts + last poll times).
export async function statsHandles(_req: Request, res: Response): Promise<void> {
  try {
    const r = await sbFetch('/watchlist_handles?select=tier,enabled,last_polled_x,last_polled_li')
    if (!r.ok) {
      res.status(502).json({ error: `supabase ${r.status}: ${await r.text()}` })
      return
    }
    const rows = (await r.json()) as Array<Pick<WatchlistHandle, 'tier' | 'enabled' | 'last_polled_x' | 'last_polled_li'>>
    const out: Record<Tier, { total: number; enabled: number; mostRecentXPoll: string | null; mostRecentLiPoll: string | null }> = {
      T1: { total: 0, enabled: 0, mostRecentXPoll: null, mostRecentLiPoll: null },
      T2: { total: 0, enabled: 0, mostRecentXPoll: null, mostRecentLiPoll: null },
      T3: { total: 0, enabled: 0, mostRecentXPoll: null, mostRecentLiPoll: null },
    }
    for (const r of rows) {
      const tier = (r.tier as Tier) || 'T3'
      out[tier].total++
      if (r.enabled) out[tier].enabled++
      if (r.last_polled_x && (out[tier].mostRecentXPoll === null || r.last_polled_x > out[tier].mostRecentXPoll)) {
        out[tier].mostRecentXPoll = r.last_polled_x
      }
      if (r.last_polled_li && (out[tier].mostRecentLiPoll === null || r.last_polled_li > out[tier].mostRecentLiPoll)) {
        out[tier].mostRecentLiPoll = r.last_polled_li
      }
    }
    res.json(out)
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
}
