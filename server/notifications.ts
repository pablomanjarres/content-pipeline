// Lightweight Pushover client + debounced cap-alert state.
// Runs server-side only. Reads PUSHOVER_APP_TOKEN and PUSHOVER_USER_KEY from
// the openclaw env (loaded at process boot from ~/.openclaw/.env).
import fs from 'node:fs'
import path from 'node:path'

const PUSHOVER_URL = 'https://api.pushover.net/1/messages.json'

export type PushoverPriority = -2 | -1 | 0 | 1 | 2

export async function sendPushover(opts: {
  message: string
  title?: string
  priority?: PushoverPriority
  sound?: string
}): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.PUSHOVER_APP_TOKEN
  const user = process.env.PUSHOVER_USER_KEY
  if (!token || !user) {
    return { ok: false, error: 'PUSHOVER_APP_TOKEN or PUSHOVER_USER_KEY missing' }
  }
  try {
    const params = new URLSearchParams({
      token,
      user,
      message: opts.message,
      title: opts.title || 'Content Pipeline',
      priority: String(opts.priority ?? 0),
      ...(opts.sound ? { sound: opts.sound } : {}),
    })
    const res = await fetch(PUSHOVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, error: `pushover ${res.status}: ${body.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// Debounced alerts: keep at most one cap alert per platform per 24h to avoid
// blasting Pablo's phone if the drafter hammers the endpoint while at cap.
const ALERT_TTL_MS = 24 * 60 * 60 * 1000

type AlertState = Record<string, { lastAlertAt: string }>

function readState(filePath: string): AlertState {
  try {
    if (!fs.existsSync(filePath)) return {}
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return {}
  }
}

function writeState(filePath: string, state: AlertState) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2))
}

export function shouldAlert(filePath: string, key: string, now = Date.now()): boolean {
  const s = readState(filePath)
  const last = s[key]?.lastAlertAt
  if (!last) return true
  return now - new Date(last).getTime() > ALERT_TTL_MS
}

export function markAlerted(filePath: string, key: string, now = new Date()) {
  const s = readState(filePath)
  s[key] = { lastAlertAt: now.toISOString() }
  writeState(filePath, s)
}
