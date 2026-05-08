// Proxies to the VM-side openclaw-admin-control service so the CP UI can
// start/stop/restart the worker pools (classifier, drafter) and support
// services (gateway, cortex-relay) running on openclaw-vm.
//
// VM service lives at $OPENCLAW_ADMIN_URL (default http://100.67.197.55:3458)
// and requires $OPENCLAW_ADMIN_TOKEN matching ADMIN_CONTROL_TOKEN on the VM.

import type { Request, Response } from 'express'

const DEFAULT_VM_URL = 'http://100.67.197.55:3458'

function vmConfig() {
  const url = (process.env.OPENCLAW_ADMIN_URL || DEFAULT_VM_URL).replace(/\/$/, '')
  const token = process.env.OPENCLAW_ADMIN_TOKEN || process.env.ADMIN_CONTROL_TOKEN || ''
  return { url, token }
}

async function vmFetch(path: string, init: RequestInit = {}): Promise<Response | { __raw: globalThis.Response }> {
  const { url, token } = vmConfig()
  if (!token) throw new Error('OPENCLAW_ADMIN_TOKEN (or ADMIN_CONTROL_TOKEN) not set in CP server env')
  const r = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      ...((init.headers as Record<string, string>) || {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  return { __raw: r }
}

export async function getStatus(_req: Request, res: Response) {
  try {
    const r = (await vmFetch('/status', { method: 'GET' })) as { __raw: globalThis.Response }
    const body = await r.__raw.text()
    res.status(r.__raw.status).type('application/json').send(body)
  } catch (e) {
    res.status(502).json({ error: 'failed to reach openclaw-admin-control', detail: (e as Error).message })
  }
}

const POOLS = new Set(['classifier', 'drafter'])
const SERVICES = new Set(['openclaw-gateway', 'cortex-relay'])
const ACTIONS = new Set(['start', 'stop', 'restart'])

export async function controlPool(req: Request, res: Response) {
  const { name, action } = req.params
  if (!POOLS.has(name)) return res.status(400).json({ error: `unknown pool "${name}"` })
  if (!ACTIONS.has(action)) return res.status(400).json({ error: `unknown action "${action}"` })
  try {
    const r = (await vmFetch(`/pool/${encodeURIComponent(name)}/${encodeURIComponent(action)}`, { method: 'POST' })) as { __raw: globalThis.Response }
    const body = await r.__raw.text()
    res.status(r.__raw.status).type('application/json').send(body)
  } catch (e) {
    res.status(502).json({ error: 'failed to reach openclaw-admin-control', detail: (e as Error).message })
  }
}

export async function controlService(req: Request, res: Response) {
  const { name, action } = req.params
  if (!SERVICES.has(name)) return res.status(400).json({ error: `unknown service "${name}"` })
  if (!ACTIONS.has(action)) return res.status(400).json({ error: `unknown action "${action}"` })
  try {
    const r = (await vmFetch(`/service/${encodeURIComponent(name)}/${encodeURIComponent(action)}`, { method: 'POST' })) as { __raw: globalThis.Response }
    const body = await r.__raw.text()
    res.status(r.__raw.status).type('application/json').send(body)
  } catch (e) {
    res.status(502).json({ error: 'failed to reach openclaw-admin-control', detail: (e as Error).message })
  }
}
