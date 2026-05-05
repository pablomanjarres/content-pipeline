import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createSentDm, deleteSentDm, getSentDms, setSentDmStatus, updateSentDm } from '../lib/api'
import type { ReactNode } from 'react'
import type { OutreachKind, OutreachStatus, Platform, SentDm } from '../lib/types'
import { PLATFORM_LABELS } from '../lib/types'

const PLATFORM_COLORS: Record<string, string> = {
  x: '#1da1f2',
  linkedin: '#0a66c2',
  instagram: '#e1306c',
  tiktok: '#00f2ea',
  youtube: '#ff0000',
  reddit: '#ff4500',
}

const KIND_COLORS: Record<OutreachKind, string> = {
  dm: '#a78bfa',
  reply: '#34d399',
}

const KIND_LABELS: Record<OutreachKind, string> = {
  dm: 'DM',
  reply: 'Reply',
}

interface DmFormData {
  kind: OutreachKind
  status: OutreachStatus
  platform: Platform
  recipientName: string
  recipientHandle: string
  message: string
  context: string
  url: string
  replyToUrl: string
  notes: string
  sentAt: string
}

type KindFilter = 'all' | OutreachKind

function toDateTimeLocal(iso: string) {
  const date = new Date(iso)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function fromDateTimeLocal(value: string) {
  return value ? new Date(value).toISOString() : new Date().toISOString()
}

function dateKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' })
  const dayMonth = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `${weekday} - ${dayMonth}`
}

type DmGroup =
  | { kind: 'drafts'; key: 'drafts'; label: string; items: SentDm[] }
  | { kind: 'day'; key: string; label: string; items: SentDm[] }

function buildDmGroups(dms: SentDm[]): DmGroup[] {
  const drafts = dms
    .filter(d => (d.status || 'draft') === 'draft')
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))

  const sent = dms.filter(d => d.status === 'sent')
  const map = new Map<string, SentDm[]>()
  for (const dm of sent) {
    const key = dateKey(dm.sentAt || dm.createdAt)
    map.set(key, [...(map.get(key) || []), dm])
  }
  const dayGroups: DmGroup[] = [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, items]) => ({
      kind: 'day' as const,
      key,
      label: dayLabel(key),
      items: items.sort((a, b) => (b.sentAt || '').localeCompare(a.sentAt || '')),
    }))

  const groups: DmGroup[] = []
  if (drafts.length > 0) {
    groups.push({ kind: 'drafts', key: 'drafts', label: 'Drafts', items: drafts })
  }
  groups.push(...dayGroups)
  return groups
}

const emptyForm = (kind: OutreachKind = 'dm'): DmFormData => ({
  kind,
  status: 'draft',
  platform: 'x',
  recipientName: '',
  recipientHandle: '',
  message: '',
  context: '',
  url: '',
  replyToUrl: '',
  notes: '',
  sentAt: toDateTimeLocal(new Date().toISOString()),
})

export function Dms() {
  const [sentDms, setSentDms] = useState<SentDm[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<DmFormData>(() => emptyForm())
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')

  const load = () => getSentDms().then(setSentDms)
  useEffect(() => { load() }, [])

  const startAdd = (kind: OutreachKind) => {
    setForm(emptyForm(kind))
    setEditingId(null)
    setShowAdd(true)
  }

  const saveDm = async () => {
    if (!form.message.trim() || (!form.recipientName.trim() && !form.recipientHandle.trim())) return
    await createSentDm({
      ...form,
      url: form.url.trim() || null,
      replyToUrl: form.replyToUrl.trim() || null,
      sentAt: fromDateTimeLocal(form.sentAt),
    })
    setForm(emptyForm())
    setShowAdd(false)
    load()
  }

  const editDm = (dm: SentDm) => {
    setEditingId(dm.id)
    setShowAdd(false)
    setForm({
      kind: dm.kind || 'dm',
      status: dm.status || 'draft',
      platform: dm.platform,
      recipientName: dm.recipientName,
      recipientHandle: dm.recipientHandle,
      message: dm.message,
      context: dm.context,
      url: dm.url || '',
      replyToUrl: dm.replyToUrl || '',
      notes: dm.notes,
      sentAt: toDateTimeLocal(dm.sentAt),
    })
  }

  const updateDm = async () => {
    if (!editingId || !form.message.trim()) return
    await updateSentDm(editingId, {
      ...form,
      url: form.url.trim() || null,
      replyToUrl: form.replyToUrl.trim() || null,
      sentAt: fromDateTimeLocal(form.sentAt),
    })
    setEditingId(null)
    setForm(emptyForm())
    load()
  }

  const removeDm = async (id: string) => {
    await deleteSentDm(id)
    load()
  }

  const toggleStatus = async (dm: SentDm) => {
    const next: OutreachStatus = (dm.status || 'draft') === 'sent' ? 'draft' : 'sent'
    await setSentDmStatus(dm.id, next)
    load()
  }

  const cancel = () => {
    setEditingId(null)
    setShowAdd(false)
    setForm(emptyForm())
  }

  const dmCount = sentDms.filter(d => (d.kind || 'dm') === 'dm').length
  const replyCount = sentDms.filter(d => d.kind === 'reply').length

  const filteredDms = sentDms.filter((dm) => {
    const kind = dm.kind || 'dm'
    if (kindFilter !== 'all' && kind !== kindFilter) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return [
      dm.platform,
      dm.recipientName,
      dm.recipientHandle,
      dm.message,
      dm.context,
      dm.notes,
      dm.url || '',
      dm.replyToUrl || '',
    ].some((value) => value.toLowerCase().includes(q))
  })

  const groups = buildDmGroups(filteredDms)

  const renderForm = (onSubmit: () => void, submitLabel: string) => {
    const messageLabel = form.kind === 'reply' ? 'Reply text' : 'DM sent'
    const messagePlaceholder = form.kind === 'reply' ? 'Paste the reply you sent...' : 'Paste the DM you sent...'
    return (
      <div className="glass glass-border rounded-xl p-5 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <Field label="Kind">
            <select
              value={form.kind}
              onChange={e => setForm(f => ({ ...f, kind: e.target.value as OutreachKind }))}
              className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-sm outline-none text-white cursor-pointer"
            >
              <option value="dm">DM</option>
              <option value="reply">Reply</option>
            </select>
          </Field>
          <Field label="Platform">
            <select
              value={form.platform}
              onChange={e => setForm(f => ({ ...f, platform: e.target.value as Platform }))}
              className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-sm outline-none text-white cursor-pointer"
            >
              <option value="x">X</option>
              <option value="linkedin">LinkedIn</option>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
              <option value="reddit">Reddit</option>
              <option value="youtube">YouTube</option>
            </select>
          </Field>
          <Field label="Name">
            <input
              value={form.recipientName}
              onChange={e => setForm(f => ({ ...f, recipientName: e.target.value }))}
              placeholder="Recipient name"
              className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-white/20 text-white placeholder:text-white/20"
            />
          </Field>
          <Field label="Handle">
            <input
              value={form.recipientHandle}
              onChange={e => setForm(f => ({ ...f, recipientHandle: e.target.value }))}
              placeholder="@handle"
              className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-white/20 text-white placeholder:text-white/20"
            />
          </Field>
          <Field label="Sent">
            <input
              type="datetime-local"
              value={form.sentAt}
              onChange={e => setForm(f => ({ ...f, sentAt: e.target.value }))}
              className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-white/20 text-white"
            />
          </Field>
        </div>

        {form.kind === 'reply' && (
          <Field label="Replying to (tweet/post URL)">
            <input
              value={form.replyToUrl}
              onChange={e => setForm(f => ({ ...f, replyToUrl: e.target.value }))}
              placeholder="Link to the post you replied to"
              className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-white/20 text-white placeholder:text-white/20"
            />
          </Field>
        )}

        <Field label={messageLabel}>
          <textarea
            value={form.message}
            onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
            placeholder={messagePlaceholder}
            rows={5}
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-sm outline-none focus:border-white/20 text-white placeholder:text-white/20 resize-y"
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Context">
            <textarea
              value={form.context}
              onChange={e => setForm(f => ({ ...f, context: e.target.value }))}
              placeholder="Why you sent it, source post, intent..."
              rows={3}
              className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-sm outline-none focus:border-white/20 text-white placeholder:text-white/20 resize-y"
            />
          </Field>
          <Field label="Notes / outcome">
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Reply, outcome, follow-up..."
              rows={3}
              className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-sm outline-none focus:border-white/20 text-white placeholder:text-white/20 resize-y"
            />
          </Field>
        </div>

        <Field label="Conversation URL">
          <input
            value={form.url}
            onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
            placeholder="Optional link to profile, post, or conversation"
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-white/20 text-white placeholder:text-white/20"
          />
        </Field>

        <div className="flex gap-2">
          <button onClick={onSubmit} className="bg-white text-black px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-zinc-200 transition-colors cursor-pointer">
            {submitLabel}
          </button>
          <button onClick={cancel} className="text-white/40 hover:text-white/70 px-3 py-1.5 text-sm transition-colors cursor-pointer">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Outreach <span className="font-serif italic font-normal text-white/70">Voice</span></h1>
          <p className="text-sm text-white/30 mt-1">Save sent DMs and replies so Mars learns your outreach voice, targeting, and follow-up patterns.</p>
        </div>
        <div className="flex gap-2 self-start md:self-auto">
          <button
            onClick={() => startAdd('dm')}
            className="bg-white text-black px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-zinc-200 transition-colors cursor-pointer"
          >
            + Save DM
          </button>
          <button
            onClick={() => startAdd('reply')}
            className="bg-emerald-400/15 text-emerald-300 border border-emerald-400/30 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-emerald-400/25 transition-colors cursor-pointer"
          >
            + Save Reply
          </button>
        </div>
      </div>

      <div className="glass glass-border rounded-xl p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <KindFilterPill active={kindFilter === 'all'} onClick={() => setKindFilter('all')} label={`All ${sentDms.length}`} />
          <KindFilterPill active={kindFilter === 'dm'} onClick={() => setKindFilter('dm')} label={`DMs ${dmCount}`} color={KIND_COLORS.dm} />
          <KindFilterPill active={kindFilter === 'reply'} onClick={() => setKindFilter('reply')} label={`Replies ${replyCount}`} color={KIND_COLORS.reply} />
          <span className="text-[11px] text-white/30 ml-2 hidden md:inline">Mirrored into Mars at <span className="font-mono">content/dms</span></span>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search recipient, message, context..."
          className="w-full md:w-80 bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-white/20 text-white placeholder:text-white/20"
        />
      </div>

      <AnimatePresence>
        {(showAdd || editingId) && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            {renderForm(editingId ? updateDm : saveDm, editingId ? `Update ${KIND_LABELS[form.kind]}` : `Save ${KIND_LABELS[form.kind]}`)}
          </motion.div>
        )}
      </AnimatePresence>

      {filteredDms.length === 0 ? (
        <div className="glass glass-border rounded-xl p-8 text-center text-sm text-white/30">
          {sentDms.length === 0 ? 'No outreach saved yet.' : 'Nothing matches that filter.'}
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(group => (
            <section key={group.key} className="space-y-3">
              <SectionHeader group={group} />
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {group.items.map(dm => renderCard(dm))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )

  function renderCard(dm: SentDm) {
    const kind = dm.kind || 'dm'
    const status = dm.status || 'draft'
    const isSent = status === 'sent'
    return (
      <motion.div key={dm.id} layout className="glass glass-border rounded-xl p-4 group">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <KindPill kind={kind} />
              <StatusPill status={status} />
              <span className="text-[13px] font-semibold text-white/85 truncate">
                {dm.recipientName || dm.recipientHandle || 'Unknown recipient'}
              </span>
              {dm.recipientHandle && <span className="text-[11px] text-white/35">{dm.recipientHandle}</span>}
              <PlatformPill platform={dm.platform} />
            </div>
            <div className="text-[11px] text-white/25 mt-1">
              {isSent ? 'Sent ' : 'Draft · '}{new Date(dm.sentAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <button
              onClick={() => toggleStatus(dm)}
              title={isSent ? 'Move back to draft (removes from Mars/Obsidian)' : 'Mark as sent and write to Mars/Obsidian'}
              className={
                isSent
                  ? 'text-[11px] font-medium px-2.5 py-1 rounded-md border border-emerald-400/40 bg-emerald-400/15 text-emerald-300 hover:bg-emerald-400/25 transition-colors cursor-pointer'
                  : 'text-[11px] font-medium px-2.5 py-1 rounded-md border border-white/15 bg-white text-black hover:bg-zinc-200 transition-colors cursor-pointer'
              }
            >
              {isSent ? 'Sent ✓' : 'Mark Sent'}
            </button>
            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              {dm.replyToUrl && <a href={dm.replyToUrl} target="_blank" className="text-xs text-white/40 hover:text-white transition-colors">Source</a>}
              {dm.url && <a href={dm.url} target="_blank" className="text-xs text-white/40 hover:text-white transition-colors">Open</a>}
              <button onClick={() => editDm(dm)} className="text-xs text-white/40 hover:text-white transition-colors cursor-pointer">Edit</button>
              <button onClick={() => removeDm(dm.id)} className="text-xs text-white/40 hover:text-red-400 transition-colors cursor-pointer">Delete</button>
            </div>
          </div>
        </div>
        {kind === 'reply' && dm.replyToUrl && (
          <div className="text-[11px] text-white/35 mb-2">
            Replying to <a href={dm.replyToUrl} target="_blank" className="text-white/55 hover:text-white underline underline-offset-2">{dm.replyToUrl}</a>
          </div>
        )}
        <div className="text-sm text-white/65 leading-relaxed whitespace-pre-wrap bg-white/[0.025] rounded-lg p-3 border border-white/[0.05]">
          {dm.message}
        </div>
        {dm.context && <div className="text-xs text-white/35 mt-2 whitespace-pre-wrap">{dm.context}</div>}
        {dm.notes && <div className="text-xs text-emerald-300/55 mt-2 whitespace-pre-wrap">{dm.notes}</div>}
      </motion.div>
    )
  }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">{label}</label>
      {children}
    </div>
  )
}

function PlatformPill({ platform }: { platform: Platform }) {
  return (
    <span
      className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{
        color: PLATFORM_COLORS[platform] || '#888',
        backgroundColor: (PLATFORM_COLORS[platform] || '#888') + '20',
      }}
    >
      {PLATFORM_LABELS[platform] || platform}
    </span>
  )
}

function KindPill({ kind }: { kind: OutreachKind }) {
  const color = KIND_COLORS[kind]
  return (
    <span
      className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{ color, backgroundColor: color + '22', border: `1px solid ${color}33` }}
    >
      {KIND_LABELS[kind]}
    </span>
  )
}

function SectionHeader({ group }: { group: DmGroup }) {
  if (group.kind === 'drafts') {
    return (
      <div className="flex items-baseline gap-2 px-1">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-300/85">Drafts</h2>
        <span className="text-[11px] text-white/30">{group.items.length} pending · won&apos;t sync to Mars until marked sent</span>
      </div>
    )
  }
  return (
    <div className="flex items-baseline gap-2 px-1">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-white/70">{group.label}</h2>
      <span className="text-[11px] text-white/30">{group.items.length} sent</span>
    </div>
  )
}

function StatusPill({ status }: { status: OutreachStatus }) {
  if (status === 'sent') {
    return (
      <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-400/15 text-emerald-300 border border-emerald-400/30">
        Sent
      </span>
    )
  }
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-300/80 border border-amber-400/25">
      Draft
    </span>
  )
}

function KindFilterPill({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: string }) {
  const baseClass = 'text-[12px] font-medium px-2.5 py-1 rounded-md transition-colors cursor-pointer border'
  if (active) {
    return (
      <button
        onClick={onClick}
        className={baseClass}
        style={{
          color: color || '#fff',
          backgroundColor: (color || '#fff') + '22',
          borderColor: (color || '#fff') + '55',
        }}
      >
        {label}
      </button>
    )
  }
  return (
    <button onClick={onClick} className={`${baseClass} text-white/45 bg-white/[0.02] border-white/[0.06] hover:text-white/80 hover:bg-white/[0.05]`}>
      {label}
    </button>
  )
}
