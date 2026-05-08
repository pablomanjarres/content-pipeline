// Paperclip integration — fires the "Weekly Content Batch" routine on the
// openclaw-vm Paperclip instance and exposes config endpoints so Pablo can
// paste his Paperclip board token from the CP UI.
//
// Token storage: ~/.config/content-pipeline/paperclip.json (chmod 600).
// API base default: http://openclaw-vm:3100 (Tailscale magic-DNS, reachable
// from Mac mini on Pablo's tailnet).

import type { Express } from 'express'
import fs from 'fs'
import os from 'os'
import path from 'path'

interface PaperclipConfig {
  apiBase?: string
  token?: string
  weeklyBatchRoutineId?: string
}

const CONFIG_DIR = path.join(os.homedir(), '.config', 'content-pipeline')
const CONFIG_FILE = path.join(CONFIG_DIR, 'paperclip.json')

function readConfig(): PaperclipConfig {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) as PaperclipConfig
  } catch {
    return {}
  }
}

function writeConfig(cfg: PaperclipConfig) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 })
  try {
    fs.chmodSync(CONFIG_FILE, 0o600)
  } catch {
    // best-effort
  }
}

async function fetchPaperclip(cfg: PaperclipConfig, route: string, init: RequestInit = {}): Promise<unknown> {
  const apiBase = cfg.apiBase || 'http://openclaw-vm:3100'
  if (!cfg.token) throw new Error('No Paperclip token configured')
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.token}`,
    ...((init.headers as Record<string, string>) || {}),
  }
  const r = await fetch(`${apiBase}${route}`, { ...init, headers })
  if (!r.ok) {
    const text = await r.text().catch(() => '')
    throw new Error(`Paperclip ${route} -> ${r.status}: ${text.slice(0, 200)}`)
  }
  return r.json()
}

async function findRoutineId(cfg: PaperclipConfig): Promise<string> {
  if (cfg.weeklyBatchRoutineId) return cfg.weeklyBatchRoutineId
  const companies = (await fetchPaperclip(cfg, '/api/companies')) as Array<{ id: string }>
  const companyId = companies[0]?.id
  if (!companyId) throw new Error('No company found on the Paperclip instance')
  const routines = (await fetchPaperclip(
    cfg,
    `/api/companies/${companyId}/routines`,
  )) as Array<{ id: string; title: string }>
  const r = routines.find((x) => x.title === 'Weekly Content Batch')
  if (!r) throw new Error('Routine "Weekly Content Batch" not found on the Paperclip instance')
  cfg.weeklyBatchRoutineId = r.id
  writeConfig(cfg)
  return r.id
}

export function registerPaperclipRoutes(app: Express) {
  app.get('/api/paperclip/config', (_req, res) => {
    const cfg = readConfig()
    res.json({
      apiBase: cfg.apiBase || 'http://openclaw-vm:3100',
      hasToken: Boolean(cfg.token),
      weeklyBatchRoutineId: cfg.weeklyBatchRoutineId || null,
    })
  })

  app.post('/api/paperclip/config', (req, res) => {
    const cfg = readConfig()
    if (typeof req.body?.apiBase === 'string') cfg.apiBase = req.body.apiBase.trim()
    if (typeof req.body?.token === 'string') cfg.token = req.body.token.trim()
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'weeklyBatchRoutineId')) {
      const v = req.body.weeklyBatchRoutineId
      cfg.weeklyBatchRoutineId = typeof v === 'string' && v.length ? v : undefined
    }
    writeConfig(cfg)
    res.json({ ok: true, hasToken: Boolean(cfg.token) })
  })

  app.post('/api/paperclip/trigger-weekly-batch', async (_req, res) => {
    try {
      const cfg = readConfig()
      if (!cfg.token) {
        res.status(400).json({ error: 'No Paperclip token configured. Save one in Settings first.' })
        return
      }
      const routineId = await findRoutineId(cfg)
      const result = await fetchPaperclip(cfg, `/api/routines/${routineId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      res.json(result)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      res.status(500).json({ error: message })
    }
  })
}
