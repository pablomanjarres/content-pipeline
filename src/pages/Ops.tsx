// OpenClaw VM service-management panel.
// Talks to the CP server's /api/openclaw/admin/* routes, which proxy to the
// admin-control service on openclaw-vm (port 3458, Bearer token auth).

import { useEffect, useState } from 'react'

type Action = 'start' | 'stop' | 'restart'

interface UnitState {
  unit: string
  active: string
  enabled: string
}

interface PoolStatus {
  name: string
  kind: 'pool'
  count: number
  activeCount: number
  units: UnitState[]
}

interface ServiceStatus {
  name: string
  kind: 'service'
  unit: string
  active: string
  enabled: string
}

interface AdminStatus {
  pools: PoolStatus[]
  services: ServiceStatus[]
  ts: string
}

function flash(msg: string) {
  const el = document.createElement('div')
  el.textContent = msg
  el.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white/[0.92] text-black text-[13px] font-medium px-4 py-2 rounded-lg shadow-xl'
  document.body.appendChild(el)
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s' }, 1400)
  setTimeout(() => { el.remove() }, 1800)
}

async function fetchStatus(): Promise<AdminStatus> {
  const r = await fetch('/api/openclaw/admin/status')
  if (!r.ok) throw new Error(`status ${r.status}: ${await r.text()}`)
  return r.json()
}

async function callAction(kind: 'pool' | 'service', name: string, action: Action): Promise<void> {
  const r = await fetch(`/api/openclaw/admin/${kind}/${encodeURIComponent(name)}/${action}`, { method: 'POST' })
  const text = await r.text()
  if (!r.ok) throw new Error(`${kind} ${name} ${action}: ${r.status} ${text}`)
}

const POOL_LABELS: Record<string, { title: string; desc: string }> = {
  classifier: {
    title: 'Classifier pool',
    desc: 'Stage-1 lead classifier — Haiku 4.5 via Bedrock. ~$50/mo budget bucket.',
  },
  drafter: {
    title: 'Drafter pool',
    desc: 'X drafter — Sonnet 4.6 default, Opus 4.7 for hot T1. ~$100/mo budget bucket.',
  },
}

const SERVICE_LABELS: Record<string, { title: string; desc: string }> = {
  'openclaw-gateway': {
    title: 'OpenClaw Gateway',
    desc: 'CLI gateway service (loopback :18789). Required for `openclaw cron` and Slack control.',
  },
  'cortex-relay': {
    title: 'Cortex Relay',
    desc: 'Bridge between Cortex.app on the Mac mini and the VM.',
  },
}

function StateDot({ active }: { active: string }) {
  const ok = active === 'active'
  const failed = active === 'failed'
  const color = ok ? '#34d399' : failed ? '#f87171' : '#6b7280'
  return (
    <span
      className="inline-block w-2 h-2 rounded-full"
      style={{ background: color, boxShadow: ok ? '0 0 6px ' + color : 'none' }}
      aria-label={active}
    />
  )
}

function ActionButtons({
  busy,
  onAction,
  destructiveLabel,
}: {
  busy: string | null
  onAction: (a: Action) => void
  destructiveLabel?: string
}) {
  return (
    <div className="flex gap-2 mt-3">
      <button
        onClick={() => onAction('start')}
        disabled={busy !== null}
        className="px-3 py-1.5 text-[12px] font-medium rounded-md bg-emerald-500/[0.15] text-emerald-300 hover:bg-emerald-500/[0.22] border border-emerald-500/[0.25] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {busy === 'start' ? 'starting…' : 'Start'}
      </button>
      <button
        onClick={() => onAction('restart')}
        disabled={busy !== null}
        className="px-3 py-1.5 text-[12px] font-medium rounded-md bg-blue-500/[0.15] text-blue-300 hover:bg-blue-500/[0.22] border border-blue-500/[0.25] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {busy === 'restart' ? 'restarting…' : 'Restart'}
      </button>
      <button
        onClick={() => {
          if (destructiveLabel && !window.confirm(`Stop ${destructiveLabel}?`)) return
          onAction('stop')
        }}
        disabled={busy !== null}
        className="px-3 py-1.5 text-[12px] font-medium rounded-md bg-red-500/[0.12] text-red-300 hover:bg-red-500/[0.20] border border-red-500/[0.22] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {busy === 'stop' ? 'stopping…' : 'Stop'}
      </button>
    </div>
  )
}

function PoolCard({
  pool,
  onAction,
  busyKey,
}: {
  pool: PoolStatus
  onAction: (action: Action) => Promise<void>
  busyKey: string | null
}) {
  const meta = POOL_LABELS[pool.name] ?? { title: pool.name, desc: '' }
  const allActive = pool.activeCount === pool.count
  const allDown = pool.activeCount === 0
  const stateLabel = allActive ? 'all running' : allDown ? 'all stopped' : `${pool.activeCount} of ${pool.count} running`
  const stateActive = allActive ? 'active' : allDown ? 'inactive' : 'partial'
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <StateDot active={stateActive} />
            <h3 className="text-[15px] font-semibold text-white/90">{meta.title}</h3>
            <span className="text-[11px] text-white/40 font-mono">@0..{pool.count - 1}</span>
          </div>
          <p className="text-[12px] text-white/50 leading-relaxed mb-1">{meta.desc}</p>
          <p className="text-[12px] text-white/70 font-medium">{stateLabel}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[28px] font-mono leading-none text-white/90 tabular-nums">
            {pool.activeCount}<span className="text-white/30">/{pool.count}</span>
          </div>
          <div className="text-[10px] text-white/40 uppercase tracking-wider mt-1">active</div>
        </div>
      </div>
      <ActionButtons busy={busyKey} onAction={(a) => onAction(a)} destructiveLabel={`all ${pool.count} ${pool.name} workers`} />
    </div>
  )
}

function ServiceCard({
  service,
  onAction,
  busyKey,
}: {
  service: ServiceStatus
  onAction: (action: Action) => Promise<void>
  busyKey: string | null
}) {
  const meta = SERVICE_LABELS[service.name] ?? { title: service.name, desc: '' }
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <StateDot active={service.active} />
            <h3 className="text-[15px] font-semibold text-white/90">{meta.title}</h3>
            <span className="text-[11px] text-white/40 font-mono">{service.unit}</span>
          </div>
          <p className="text-[12px] text-white/50 leading-relaxed mb-1">{meta.desc}</p>
          <p className="text-[12px] text-white/70 font-medium">
            {service.active}{service.enabled !== service.active ? ` · ${service.enabled}` : ''}
          </p>
        </div>
      </div>
      <ActionButtons busy={busyKey} onAction={(a) => onAction(a)} destructiveLabel={meta.title} />
    </div>
  )
}

export function Ops() {
  const [status, setStatus] = useState<AdminStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<{ kind: 'pool' | 'service'; name: string; action: Action } | null>(null)
  const [lastTs, setLastTs] = useState<string | null>(null)

  const load = async () => {
    try {
      const s = await fetchStatus()
      setStatus(s)
      setError(null)
      setLastTs(s.ts)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [])

  const doAction = async (kind: 'pool' | 'service', name: string, action: Action) => {
    setBusy({ kind, name, action })
    try {
      await callAction(kind, name, action)
      flash(`${name} ${action} ✓`)
      // Refresh immediately, then again 2s later (systemd state can lag).
      load()
      setTimeout(load, 2000)
    } catch (e) {
      flash(`${name} ${action} failed: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-white/90 mb-1">Ops</h1>
          <p className="text-[13px] text-white/50">
            Worker pools and support services on openclaw-vm. Start / stop / restart from here instead of SSHing.
          </p>
        </div>
        <div className="text-[11px] text-white/40 font-mono">
          {lastTs ? `last refresh: ${new Date(lastTs).toLocaleTimeString()}` : 'loading…'}
        </div>
      </header>

      {error && (
        <div className="rounded-lg bg-red-500/[0.10] border border-red-500/[0.25] text-red-300 text-[13px] px-4 py-3">
          <div className="font-semibold mb-1">Can't reach admin-control on the VM.</div>
          <div className="font-mono text-[11px] opacity-80">{error}</div>
          <div className="text-[12px] mt-2 text-red-300/80">
            Check: openclaw-admin-control.service is running on the VM, OPENCLAW_ADMIN_TOKEN is set, and Tailscale is up.
          </div>
        </div>
      )}

      {status && (
        <>
          <section>
            <h2 className="text-[12px] font-semibold uppercase tracking-wider text-white/40 mb-3">Worker pools</h2>
            <div className="grid md:grid-cols-2 gap-4">
              {status.pools.map((p) => {
                const busyKey =
                  busy && busy.kind === 'pool' && busy.name === p.name ? busy.action : null
                return (
                  <PoolCard
                    key={p.name}
                    pool={p}
                    busyKey={busyKey}
                    onAction={(a) => doAction('pool', p.name, a)}
                  />
                )
              })}
            </div>
          </section>

          <section>
            <h2 className="text-[12px] font-semibold uppercase tracking-wider text-white/40 mb-3">Support services</h2>
            <div className="grid md:grid-cols-2 gap-4">
              {status.services.map((s) => {
                const busyKey =
                  busy && busy.kind === 'service' && busy.name === s.name ? busy.action : null
                return (
                  <ServiceCard
                    key={s.name}
                    service={s}
                    busyKey={busyKey}
                    onAction={(a) => doAction('service', s.name, a)}
                  />
                )
              })}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
