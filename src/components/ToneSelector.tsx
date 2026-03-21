import { TONE_LABELS, TONE_DESCRIPTIONS, type TonePreset } from '../lib/types'

const TONES: TonePreset[] = ['builder', 'technical', 'storytelling']

const TONE_COLORS: Record<TonePreset, string> = {
  builder: '#f97316',
  technical: '#3b82f6',
  storytelling: '#a855f7',
}

interface Props {
  value: TonePreset
  onChange: (tone: TonePreset) => void
}

export function ToneSelector({ value, onChange }: Props) {
  return (
    <div className="flex gap-2">
      {TONES.map(tone => {
        const active = value === tone
        const color = TONE_COLORS[tone]
        return (
          <button
            key={tone}
            onClick={() => onChange(tone)}
            className="flex-1 text-left px-3 py-2 rounded-lg border transition-all duration-150"
            style={{
              borderColor: active ? color : 'rgba(255,255,255,0.06)',
              background: active ? `${color}15` : 'transparent',
            }}
          >
            <div className="text-sm font-medium" style={{ color: active ? color : 'rgba(255,255,255,0.7)' }}>
              {TONE_LABELS[tone]}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: active ? `${color}bb` : 'rgba(255,255,255,0.3)' }}>
              {TONE_DESCRIPTIONS[tone]}
            </div>
          </button>
        )
      })}
    </div>
  )
}
