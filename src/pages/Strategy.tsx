import { motion } from 'framer-motion'

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: [0.4, 0, 0.2, 1] },
})

export function Strategy() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Content <span className="font-serif italic font-normal text-white/70">Strategy</span></h1>
        <p className="text-sm text-white/30 mt-1">The system behind every piece of content.</p>
      </div>

      {/* Weekly Schedule */}
      <motion.section {...fade(0)}>
        <h2 className="text-[11px] text-white/30 uppercase tracking-wider font-medium mb-3">Weekly Schedule</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="glass glass-border rounded-xl p-5">
            <div className="text-xs text-white/40 uppercase tracking-wider mb-3">Daily — every day</div>
            <div className="space-y-2.5">
              {DAILY_SCHEDULE.map(s => (
                <div key={s.label} className="flex items-center gap-3">
                  <div className="w-1.5 h-5 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-sm text-white/80 font-medium flex-1">{s.label}</span>
                  <span className="text-[10px] text-white/20 font-mono">{s.platform}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="glass glass-border rounded-xl p-5">
            <div className="text-xs text-white/40 uppercase tracking-wider mb-3">Weekly — once per week</div>
            <div className="space-y-2.5">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-5 rounded-full bg-red-500" />
                <span className="text-sm text-white/80 font-medium flex-1">YouTube Video</span>
                <span className="text-[10px] text-white/20 font-mono">youtube</span>
              </div>
            </div>
            <div className="mt-6 text-xs text-white/40 uppercase tracking-wider mb-3">Folder Structure</div>
            <div className="font-mono text-[11px] text-white/30 space-y-0.5">
              <div>media/videos/</div>
              <div className="pl-3">2026-W12/</div>
              <div className="pl-6 text-white/20">uploads-2026-03-20/ <span className="text-white/10">← raw daily</span></div>
              <div className="pl-6 text-white/20">content/ <span className="text-white/10">← project folders</span></div>
              <div className="pl-9 text-white/15">ig-reel-fri-mar-20/</div>
              <div className="pl-12 text-white/10">script.md, sources/, exports/</div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Daily Pipeline */}
      <motion.section {...fade(0.1)}>
        <h2 className="text-[11px] text-white/30 uppercase tracking-wider font-medium mb-3">Daily Pipeline</h2>
        <div className="flex items-stretch gap-0 overflow-x-auto pb-2">
          {PIPELINE_STEPS.map((step, i) => (
            <div key={step.label} className="flex items-stretch">
              <div className="glass glass-border rounded-xl p-4 min-w-[180px] flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{step.icon}</span>
                  <span className="text-sm font-semibold" style={{ color: step.color }}>{step.label}</span>
                </div>
                <p className="text-xs text-white/40 flex-1">{step.desc}</p>
                <div className="mt-2 text-[10px] text-white/15 font-mono">{step.time}</div>
              </div>
              {i < PIPELINE_STEPS.length - 1 && (
                <div className="flex items-center px-1.5 text-white/10 text-lg shrink-0">→</div>
              )}
            </div>
          ))}
        </div>
      </motion.section>

      {/* Distribution */}
      <motion.section {...fade(0.15)}>
        <h2 className="text-[11px] text-white/30 uppercase tracking-wider font-medium mb-3">Content Mix</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { label: 'building', pct: 70, color: '#f97316', examples: ['product demos', 'bugs', 'progress', 'features', 'launches'] },
            { label: 'studying', pct: 20, color: '#6366f1', examples: ['deep work', 'learning', 'university', 'insights'] },
            { label: 'workout', pct: 10, color: '#ef4444', examples: ['discipline', 'routine', 'balance', 'lifestyle'] },
          ].map(cat => (
            <div key={cat.label} className="glass glass-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold capitalize" style={{ color: cat.color }}>{cat.label}</span>
                <span className="text-lg font-bold tabular-nums" style={{ color: cat.color }}>{cat.pct}%</span>
              </div>
              <div className="w-full bg-white/[0.04] rounded-full h-1 mb-3">
                <div className="h-1 rounded-full" style={{ width: `${cat.pct}%`, backgroundColor: cat.color }} />
              </div>
              <div className="flex flex-wrap gap-1">
                {cat.examples.map(e => (
                  <span key={e} className="text-[10px] bg-white/[0.04] text-white/30 rounded px-1.5 py-0.5">{e}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </motion.section>

      {/* Video Template */}
      <motion.section {...fade(0.2)}>
        <h2 className="text-[11px] text-white/30 uppercase tracking-wider font-medium mb-3">Video Template — 35s max</h2>
        <div className="glass glass-border rounded-xl p-5">
          <div className="relative">
            <div className="absolute left-[52px] top-0 bottom-0 w-px bg-white/[0.04]" />
            {VIDEO_SECTIONS.map(sec => (
              <div key={sec.label} className="flex items-start gap-4 mb-4 last:mb-0 relative">
                <div className="w-[44px] text-right shrink-0">
                  <span className="text-[10px] font-mono text-white/20">{sec.time}</span>
                </div>
                <div className="w-2.5 h-2.5 rounded-full mt-1 shrink-0 z-10 ring-2 ring-black" style={{ backgroundColor: sec.color }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium" style={{ color: sec.color }}>{sec.label}</div>
                  <div className="text-xs text-white/30 mt-0.5">{sec.desc}</div>
                  {sec.elements && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {sec.elements.map(e => (
                        <span key={e} className="text-[10px] bg-white/[0.04] text-white/25 rounded px-1.5 py-0.5">{e}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-1 mt-0.5">
                  <div className="h-1.5 rounded-full opacity-30" style={{ width: `${sec.duration * 3}px`, backgroundColor: sec.color }} />
                  <span className="text-[10px] font-mono text-white/15">{sec.duration}s</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* GTM Content Strategy */}
      <motion.section {...fade(0.22)}>
        <h2 className="text-[11px] text-white/30 uppercase tracking-wider font-medium mb-3">GTM Content Strategy</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Content Types */}
          <div className="glass glass-border rounded-xl p-5">
            <div className="text-xs text-violet-400/60 uppercase tracking-wider mb-3">Content Types</div>
            <div className="space-y-3">
              <div>
                <div className="text-sm font-semibold text-violet-400 mb-1.5">Demo Clips</div>
                <div className="space-y-1">
                  {[
                    'Bug catch demo — show the tool catching a real agent failure',
                    'Speed demo — 5-min setup, instant value',
                    'Before/after — code with vs. without the tool',
                  ].map(item => (
                    <div key={item} className="text-xs text-white/30 flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-violet-500/40 shrink-0" />
                      {item}
                    </div>
                  ))}
                </div>
                <div className="text-[10px] text-white/15 mt-1.5">30–60 seconds, real failures not fabricated, clear CTA</div>
              </div>
              <div>
                <div className="text-sm font-semibold text-violet-400 mb-1.5">Launch Posts</div>
                <div className="space-y-1">
                  {['Show HN post', 'Product Hunt launch', 'Blog announcement'].map(item => (
                    <div key={item} className="text-xs text-white/30 flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-violet-500/40 shrink-0" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-sm font-semibold text-violet-400 mb-1.5">Ongoing Content</div>
                <div className="space-y-1">
                  {['X posts — short takes, threads, engagement', 'LinkedIn posts — founder journey, professional'].map(item => (
                    <div key={item} className="text-xs text-white/30 flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-violet-500/40 shrink-0" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Calendar + Messaging */}
          <div className="space-y-4">
            <div className="glass glass-border rounded-xl p-5">
              <div className="text-xs text-violet-400/60 uppercase tracking-wider mb-3">Content Calendar — 5 GTM Phases</div>
              <div className="space-y-2">
                {[
                  { phase: 'Pre-launch', desc: 'Build-in-public clips, teasers', color: '#f59e0b' },
                  { phase: 'Soft launch', desc: 'Demo clips, early user stories', color: '#8b5cf6' },
                  { phase: 'Public launch', desc: 'Show HN, Product Hunt, big push', color: '#3b82f6' },
                  { phase: 'Post-launch', desc: 'User testimonials, case studies', color: '#10b981' },
                  { phase: 'Growth', desc: 'Ongoing demos, outreach, community', color: '#06b6d4' },
                ].map(p => (
                  <div key={p.phase} className="flex items-center gap-3">
                    <div className="w-1.5 h-5 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="text-sm text-white/80 font-medium flex-1">{p.phase}</span>
                    <span className="text-[10px] text-white/20">{p.desc}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="glass glass-border rounded-xl p-5">
              <div className="text-xs text-violet-400/60 uppercase tracking-wider mb-3">Key Messaging</div>
              <div className="space-y-2">
                {[
                  'One-liner focus — lead with what it does in one sentence',
                  'Problem-first — always start with the pain point',
                  'Real data/numbers only — no vanity metrics',
                  'Show, don\'t tell — every claim backed by a demo or screenshot',
                ].map(rule => (
                  <div key={rule} className="text-xs text-white/40 flex items-center gap-2">
                    <span className="text-violet-500/60">◆</span>
                    {rule}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Content Types + Platforms */}
      <motion.div {...fade(0.25)} className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <section>
          <h2 className="text-[11px] text-white/30 uppercase tracking-wider font-medium mb-3">Content Types — Rotate</h2>
          <div className="space-y-3">
            {CONTENT_TYPES.map(t => (
              <div key={t.label} className="glass glass-border rounded-xl p-3.5">
                <div className="text-sm font-semibold mb-1.5" style={{ color: t.color }}>{t.label}</div>
                <div className="space-y-1">
                  {t.items.map(item => (
                    <div key={item} className="text-xs text-white/30 flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-white/10 shrink-0" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-6">
          {/* Platforms */}
          <section>
            <h2 className="text-[11px] text-white/30 uppercase tracking-wider font-medium mb-3">Platforms</h2>
            <div className="space-y-3">
              <div className="glass glass-border rounded-xl p-4">
                <div className="text-xs text-white/40 uppercase tracking-wider mb-2">Video — daily</div>
                <div className="space-y-1.5">
                  {[
                    { name: 'Instagram Reels', color: '#e1306c' },
                    { name: 'TikTok', color: '#00f2ea' },
                    { name: 'YouTube Shorts', color: '#ff0000' },
                  ].map(p => (
                    <div key={p.name} className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                      <span className="text-sm text-white/60">{p.name}</span>
                    </div>
                  ))}
                </div>
                <div className="text-[10px] text-white/15 mt-2">Same video, minor caption tweaks per platform</div>
              </div>
              <div className="glass glass-border rounded-xl p-4">
                <div className="text-xs text-white/40 uppercase tracking-wider mb-2">Posts — daily</div>
                <div className="space-y-1.5">
                  {[
                    { name: 'X', note: 'Short takes, threads', color: '#1da1f2' },
                    { name: 'LinkedIn', note: 'Founder journey, professional', color: '#0a66c2' },
                    { name: 'Reddit', note: 'Community-first, value posts', color: '#ff4500' },
                  ].map(p => (
                    <div key={p.name} className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                      <span className="text-sm text-white/60">{p.name}</span>
                      <span className="text-[10px] text-white/15 ml-auto">{p.note}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Rules */}
          <section>
            <h2 className="text-[11px] text-white/30 uppercase tracking-wider font-medium mb-3">Rules</h2>
            <div className="glass glass-border rounded-xl p-4 space-y-2">
              {RULES.map(rule => (
                <div key={rule} className="text-xs text-white/40 flex items-center gap-2">
                  <span className="text-amber-500/60">◆</span>
                  {rule}
                </div>
              ))}
            </div>
          </section>

          {/* Editing */}
          <section>
            <h2 className="text-[11px] text-white/30 uppercase tracking-wider font-medium mb-3">Editing Checklist</h2>
            <div className="glass glass-border rounded-xl p-4 space-y-2">
              {EDITING_RULES.map(rule => (
                <div key={rule} className="text-xs text-white/40 flex items-center gap-2">
                  <span className="text-emerald-500/60">▸</span>
                  {rule}
                </div>
              ))}
            </div>
          </section>
        </div>
      </motion.div>
    </div>
  )
}

// --- Data ---

const DAILY_SCHEDULE = [
  { label: 'IG Reel', platform: 'instagram', color: '#e1306c' },
  { label: 'TikTok Short', platform: 'tiktok', color: '#00f2ea' },
  { label: 'YouTube Short', platform: 'youtube', color: '#ff0000' },
  { label: 'X Post', platform: 'x', color: '#1da1f2' },
  { label: 'LinkedIn Post', platform: 'linkedin', color: '#0a66c2' },
  { label: 'Reddit Post', platform: 'reddit', color: '#ff4500' },
]

const PIPELINE_STEPS = [
  { icon: '📹', label: 'Capture', desc: 'Record 20–60s bursts during natural work. Tripod at 45°, same angle daily.', time: 'during work', color: '#f59e0b' },
  { icon: '📂', label: 'Upload', desc: 'Upload to dashboard → goes to videos/{week}/uploads-{date}/', time: 'instant', color: '#8b5cf6' },
  { icon: '✂️', label: 'Extract', desc: 'Pick 2–5 clips per day. Categorize by building/studying/workout.', time: '10–20 min', color: '#3b82f6' },
  { icon: '🎬', label: 'Produce', desc: 'Open project from weekly tracker. Select sources, write script, edit in Premiere.', time: '15–25 min', color: '#ec4899' },
  { icon: '📤', label: 'Export', desc: 'Upload versioned exports (v1, v2, v3) to project folder.', time: '5 min', color: '#06b6d4' },
  { icon: '🚀', label: 'Post', desc: 'Publish to all platforms. Mark as posted in dashboard.', time: '5 min', color: '#22c55e' },
]

const VIDEO_SECTIONS = [
  { label: 'Hook', time: '0–3s', duration: 3, color: '#f59e0b', desc: 'Strong statement. Pattern interrupt.', elements: ['bold claim', 'question', 'visual shock'] },
  { label: 'Context', time: '3–8s', duration: 5, color: '#8b5cf6', desc: 'What you\'re doing / building.', elements: ['screen recording', 'talking head'] },
  { label: 'Proof', time: '8–25s', duration: 17, color: '#3b82f6', desc: 'Show the work. Mix formats.', elements: ['timelapse', 'talking clip', 'reaction', 'screen grab'] },
  { label: 'Payoff', time: '25–35s', duration: 10, color: '#10b981', desc: 'Result, insight, or progress shown.', elements: ['before/after', 'metric', 'breakthrough'] },
  { label: 'CTA', time: 'last 3s', duration: 3, color: '#06b6d4', desc: '"Building in public" — follow the journey.', elements: ['follow', 'comment prompt'] },
]

const CONTENT_TYPES = [
  { label: 'Build', color: '#f97316', items: ['Product demos', 'Bugs fixed', 'Progress updates', 'Feature launches'] },
  { label: 'Struggle', color: '#ef4444', items: ['Problems', 'Pressure', 'Failures', 'Honest moments'] },
  { label: 'Balance', color: '#6366f1', items: ['Startup + university', 'Time constraints', 'Tradeoffs'] },
  { label: 'Identity', color: '#22c55e', items: ['Daily operations', 'Routines', 'Discipline', 'Workflow'] },
]

const EDITING_RULES = [
  '9:16 aspect ratio preset',
  'Big captions (auto-generated)',
  'Fast cuts — 1–3 seconds each',
  '2–3 zooms per video',
  'Light background music',
  '15–25 minutes max editing time',
]

const RULES = [
  '70% build, 20% study, 10% life',
  'No over-editing',
  'No waiting for perfect',
  'Output > perfection',
  'One video per day minimum',
  'Record during natural work',
  'Every project gets its own folder',
  'Script.md in every project for Premiere',
]
