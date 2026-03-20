export function Strategy() {
  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold">Content Strategy</h1>

      {/* Daily Loop Pipeline */}
      <section>
        <h2 className="text-sm text-zinc-500 uppercase tracking-wider mb-3">Daily Pipeline</h2>
        <div className="flex items-stretch gap-0 overflow-x-auto pb-2">
          {PIPELINE_STEPS.map((step, i) => (
            <div key={step.label} className="flex items-stretch">
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 min-w-[180px] flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{step.icon}</span>
                  <span className="text-sm font-semibold" style={{ color: step.color }}>{step.label}</span>
                </div>
                <p className="text-xs text-zinc-400 flex-1">{step.desc}</p>
                <div className="mt-2 text-[10px] text-zinc-600 font-mono">{step.time}</div>
              </div>
              {i < PIPELINE_STEPS.length - 1 && (
                <div className="flex items-center px-1 text-zinc-700 text-lg shrink-0">→</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Content Distribution */}
      <section>
        <h2 className="text-sm text-zinc-500 uppercase tracking-wider mb-3">Distribution</h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'building', pct: 70, color: '#f97316', examples: ['Nella demos', 'bugs', 'progress', 'features'] },
            { label: 'studying', pct: 20, color: '#6366f1', examples: ['deep work', 'learning', 'insights'] },
            { label: 'workout', pct: 10, color: '#ef4444', examples: ['discipline', 'routine', 'balance'] },
          ].map(cat => (
            <div key={cat.label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold capitalize" style={{ color: cat.color }}>{cat.label}</span>
                <span className="text-lg font-bold" style={{ color: cat.color }}>{cat.pct}%</span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-1.5 mb-3">
                <div className="h-1.5 rounded-full" style={{ width: `${cat.pct}%`, backgroundColor: cat.color }} />
              </div>
              <div className="flex flex-wrap gap-1">
                {cat.examples.map(e => (
                  <span key={e} className="text-[10px] bg-zinc-800 text-zinc-400 rounded px-1.5 py-0.5">{e}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Video Template Structure */}
      <section>
        <h2 className="text-sm text-zinc-500 uppercase tracking-wider mb-3">Video Template</h2>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="relative">
            {/* Timeline bar */}
            <div className="absolute left-[52px] top-0 bottom-0 w-px bg-zinc-800" />

            {VIDEO_SECTIONS.map((sec, i) => (
              <div key={sec.label} className="flex items-start gap-4 mb-4 last:mb-0 relative">
                {/* Time marker */}
                <div className="w-[44px] text-right shrink-0">
                  <span className="text-[10px] font-mono text-zinc-600">{sec.time}</span>
                </div>
                {/* Dot */}
                <div
                  className="w-2.5 h-2.5 rounded-full mt-1 shrink-0 z-10 ring-2 ring-zinc-900"
                  style={{ backgroundColor: sec.color }}
                />
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium" style={{ color: sec.color }}>{sec.label}</div>
                  <div className="text-xs text-zinc-400 mt-0.5">{sec.desc}</div>
                  {sec.elements && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {sec.elements.map(e => (
                        <span key={e} className="text-[10px] bg-zinc-800 text-zinc-500 rounded px-1.5 py-0.5">{e}</span>
                      ))}
                    </div>
                  )}
                </div>
                {/* Duration bar */}
                <div className="shrink-0 flex items-center gap-1 mt-0.5">
                  <div
                    className="h-1.5 rounded-full opacity-40"
                    style={{ width: `${sec.duration * 3}px`, backgroundColor: sec.color }}
                  />
                  <span className="text-[10px] font-mono text-zinc-600">{sec.duration}s</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Content Types Rotation */}
      <section>
        <h2 className="text-sm text-zinc-500 uppercase tracking-wider mb-3">Content Types — Rotate</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {CONTENT_TYPES.map(t => (
            <div key={t.label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              <div className="text-sm font-semibold mb-1" style={{ color: t.color }}>{t.label}</div>
              <div className="space-y-1">
                {t.items.map(item => (
                  <div key={item} className="text-xs text-zinc-400 flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-zinc-600 shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Editing & Setup Rules */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section>
          <h2 className="text-sm text-zinc-500 uppercase tracking-wider mb-3">Editing Checklist</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
            {EDITING_RULES.map(rule => (
              <div key={rule} className="text-xs text-zinc-400 flex items-center gap-2">
                <span className="text-emerald-500">▸</span>
                {rule}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm text-zinc-500 uppercase tracking-wider mb-3">Rules</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
            {RULES.map(rule => (
              <div key={rule} className="text-xs text-zinc-400 flex items-center gap-2">
                <span className="text-amber-500">◆</span>
                {rule}
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Platform Distribution */}
      <section>
        <h2 className="text-sm text-zinc-500 uppercase tracking-wider mb-3">Platforms</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Video</div>
            <div className="space-y-2">
              {['TikTok', 'Instagram Reels', 'YouTube Shorts'].map(p => (
                <div key={p} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span className="text-sm text-zinc-300">{p}</span>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-zinc-600 mt-2">Same video, minor caption tweaks</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Posts</div>
            <div className="space-y-2">
              {[
                { name: 'LinkedIn', note: 'Professional angle, founder journey' },
                { name: 'X', note: 'Short takes, threads, engagement' },
                { name: 'Reddit', note: 'Community-specific, value-first' },
              ].map(p => (
                <div key={p.name} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                  <div>
                    <span className="text-sm text-zinc-300">{p.name}</span>
                    <span className="text-[10px] text-zinc-600 ml-2">{p.note}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-zinc-600 mt-2">Repurpose video content as text posts</div>
          </div>
        </div>
      </section>
    </div>
  )
}

// --- Data ---

const PIPELINE_STEPS = [
  { icon: '📹', label: 'Capture', desc: 'Record 20–60s bursts. Tripod at 45°, same angle daily.', time: 'during work', color: '#f59e0b' },
  { icon: '📂', label: 'Raw Library', desc: 'Dump to /raw. No editing, no thinking. Organize by category.', time: 'instant', color: '#8b5cf6' },
  { icon: '✂️', label: 'Extract', desc: 'Pick 2–5 clips. Each = one idea. Delete unclear/boring.', time: '10–20 min', color: '#3b82f6' },
  { icon: '🎬', label: 'Produce', desc: 'Apply video template. Big captions, fast cuts, 2–3 zooms.', time: '15–25 min', color: '#ec4899' },
  { icon: '🚀', label: 'Post', desc: 'Same video → TikTok, Reels, Shorts. Minor caption tweaks.', time: '5 min', color: '#22c55e' },
]

const VIDEO_SECTIONS = [
  { label: 'Hook', time: '0–3s', duration: 3, color: '#f59e0b', desc: 'Strong statement. Pattern interrupt.', elements: ['bold claim', 'question', 'visual shock'] },
  { label: 'Context', time: '3–8s', duration: 5, color: '#8b5cf6', desc: 'What you\'re doing / building.', elements: ['screen recording', 'talking head'] },
  { label: 'Proof', time: '8–25s', duration: 17, color: '#3b82f6', desc: 'Show the work. Mix formats.', elements: ['timelapse', 'talking clip', 'reaction', 'screen grab'] },
  { label: 'Payoff', time: '25–35s', duration: 10, color: '#10b981', desc: 'Result, insight, or progress shown.', elements: ['before/after', 'metric', 'breakthrough'] },
  { label: 'CTA', time: 'last 3s', duration: 3, color: '#06b6d4', desc: '"Building in public" — follow the journey.', elements: ['follow', 'comment prompt'] },
]

const CONTENT_TYPES = [
  { label: 'Build', color: '#f97316', items: ['Nella demos', 'Bugs fixed', 'Progress updates'] },
  { label: 'Struggle', color: '#ef4444', items: ['Problems', 'Pressure', 'Failures'] },
  { label: 'Balance', color: '#6366f1', items: ['Startup + college', 'Time constraints', 'Tradeoffs'] },
  { label: 'Identity', color: '#22c55e', items: ['Daily operations', 'Routines', 'Discipline'] },
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
  'One video per day',
  'Record during natural work',
]
