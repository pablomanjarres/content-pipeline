import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getTemplates, createTemplate, updateTemplate, deleteTemplate } from '../lib/api'
import type { OutreachTemplate, Platform } from '../lib/types'
import { PLATFORM_LABELS } from '../lib/types'

const PLATFORM_COLORS: Record<string, string> = {
  x: '#1da1f2',
  linkedin: '#0a66c2',
  instagram: '#e1306c',
  tiktok: '#00f2ea',
  youtube: '#ff0000',
  reddit: '#ff4500',
}

function highlightPlaceholders(text: string) {
  const parts = text.split(/(\{\{[^}]+\}\})/)
  return parts.map((part, i) =>
    part.startsWith('{{') ? (
      <span key={i} className="text-violet-400 bg-violet-500/10 rounded px-0.5">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

interface FormData {
  name: string
  platform: Platform
  template: string
  tone: string
  notes: string
}

const emptyForm: FormData = { name: '', platform: 'x', template: '', tone: 'builder', notes: '' }

export function Templates() {
  const [templates, setTemplates] = useState<OutreachTemplate[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)

  const load = () => getTemplates().then(setTemplates)
  useEffect(() => { load() }, [])

  const handleAdd = async () => {
    if (!form.name.trim() || !form.template.trim()) return
    await createTemplate(form)
    setForm(emptyForm)
    setShowAdd(false)
    load()
  }

  const handleEdit = (template: OutreachTemplate) => {
    setEditingId(template.id)
    setForm({
      name: template.name,
      platform: template.platform,
      template: template.template,
      tone: template.tone,
      notes: template.notes,
    })
  }

  const handleUpdate = async () => {
    if (!editingId || !form.name.trim() || !form.template.trim()) return
    await updateTemplate(editingId, form)
    setEditingId(null)
    setForm(emptyForm)
    load()
  }

  const handleDelete = async (id: string) => {
    await deleteTemplate(id)
    load()
  }

  const handleCancel = () => {
    setEditingId(null)
    setShowAdd(false)
    setForm(emptyForm)
  }

  const renderForm = (onSubmit: () => void, submitLabel: string) => (
    <div className="glass glass-border rounded-xl p-5 space-y-3">
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Name</label>
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Template name..."
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-white/20 text-white placeholder:text-white/20"
            autoFocus
          />
        </div>
        <div>
          <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Platform</label>
          <select
            value={form.platform}
            onChange={e => setForm(f => ({ ...f, platform: e.target.value as Platform }))}
            className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-sm outline-none text-white"
          >
            <option value="x">X</option>
            <option value="linkedin">LinkedIn</option>
            <option value="instagram">Instagram</option>
            <option value="reddit">Reddit</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Tone</label>
          <select
            value={form.tone}
            onChange={e => setForm(f => ({ ...f, tone: e.target.value }))}
            className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-sm outline-none text-white"
          >
            <option value="builder">Builder</option>
            <option value="technical">Technical</option>
            <option value="storytelling">Storytelling</option>
          </select>
        </div>
      </div>

      <div>
        <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Template</label>
        <textarea
          value={form.template}
          onChange={e => setForm(f => ({ ...f, template: e.target.value }))}
          placeholder="Hey {{name}}, saw your post about {{topic}}..."
          rows={4}
          className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-sm outline-none focus:border-white/20 text-white placeholder:text-white/20 resize-none font-mono"
        />
      </div>

      <div>
        <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Notes</label>
        <input
          value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          placeholder="When to use this template..."
          className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-white/20 text-white placeholder:text-white/20"
        />
      </div>

      <div className="flex gap-2">
        <button onClick={onSubmit} className="bg-white text-black px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-zinc-200 transition-colors">
          {submitLabel}
        </button>
        <button onClick={handleCancel} className="text-white/40 hover:text-white/70 px-3 py-1.5 text-sm transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Outreach <span className="font-serif italic font-normal text-white/70">Templates</span></h1>
          <p className="text-sm text-white/30 mt-1">Reusable patterns for messages, replies, and founder outreach.</p>
        </div>
        {!showAdd && !editingId && (
          <button
            onClick={() => setShowAdd(true)}
            className="bg-white text-black px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-zinc-200 transition-colors"
          >
            + New Template
          </button>
        )}
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            {renderForm(handleAdd, 'Save Template')}
          </motion.div>
        )}
      </AnimatePresence>

      {templates.length === 0 && !showAdd ? (
        <p className="text-white/30 text-sm">No templates yet. Create your first outreach template.</p>
      ) : (
        <div className="space-y-3">
          {templates.map(template => (
            <motion.div
              key={template.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass glass-border rounded-xl p-5 group"
            >
              {editingId === template.id ? (
                renderForm(handleUpdate, 'Update')
              ) : (
                <>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-base font-semibold text-white">{template.name}</span>
                      <span
                        className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{
                          color: PLATFORM_COLORS[template.platform] || '#888',
                          backgroundColor: (PLATFORM_COLORS[template.platform] || '#888') + '20',
                        }}
                      >
                        {PLATFORM_LABELS[template.platform] || template.platform}
                      </span>
                      <span className="text-[10px] text-white/20 bg-white/[0.04] px-1.5 py-0.5 rounded capitalize">{template.tone}</span>
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleEdit(template)}
                        className="text-xs text-white/40 hover:text-white transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(template.id)}
                        className="text-xs text-white/40 hover:text-red-400 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="text-sm text-white/50 leading-relaxed font-mono bg-white/[0.02] rounded-lg p-3 border border-white/[0.04]">
                    {highlightPlaceholders(template.template)}
                  </div>
                  {template.notes && (
                    <div className="text-xs text-white/20 mt-2.5 flex items-center gap-1.5">
                      <span className="text-violet-500/40">*</span>
                      {template.notes}
                    </div>
                  )}
                </>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
