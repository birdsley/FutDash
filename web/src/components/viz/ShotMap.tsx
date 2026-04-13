/**
 * ShotMap.tsx — enlarged pure-SVG shot map
 * Tooltip fix: useRef + getBoundingClientRect → position:absolute, scroll-safe.
 */

import { useMemo, useState, useRef, useCallback } from 'react'
import type { Shot } from '../../types'

interface ShotMapProps {
  shots: Shot[]
  home: string
  away: string
  homeColor: string
  awayColor: string
}

function SvgPitch() {
  const lc = 'rgba(180,200,180,0.48)'
  const sw = 0.55
  return (
    <g>
      <defs>
        <linearGradient id="smGrass" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#1a3d24" />
          <stop offset="50%"  stopColor="#1e4429" />
          <stop offset="100%" stopColor="#1a3d24" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={120} height={80} fill="url(#smGrass)" />
      {[0,1,2,3,4,5].map(i => (
        <rect key={i} x={i*20} y={0} width={10} height={80}
          fill="rgba(0,0,0,0.055)" />
      ))}
      <rect x={0} y={0} width={120} height={80} fill="none" stroke={lc} strokeWidth={sw} />
      <line x1={60} y1={0} x2={60} y2={80} stroke={lc} strokeWidth={sw} />
      <circle cx={60} cy={40} r={10} fill="none" stroke={lc} strokeWidth={sw} />
      <circle cx={60} cy={40} r={0.6} fill={lc} />
      <rect x={0} y={18} width={18} height={44} fill="none" stroke={lc} strokeWidth={sw} />
      <rect x={102} y={18} width={18} height={44} fill="none" stroke={lc} strokeWidth={sw} />
      <rect x={0} y={30} width={6} height={20} fill="none" stroke={lc} strokeWidth={sw} />
      <rect x={114} y={30} width={6} height={20} fill="none" stroke={lc} strokeWidth={sw} />
      <path d="M18,31.8 A10,10 0 0,1 18,48.2" fill="none" stroke={lc} strokeWidth={sw} />
      <path d="M102,31.8 A10,10 0 0,0 102,48.2" fill="none" stroke={lc} strokeWidth={sw} />
      <circle cx={12} cy={40} r={0.55} fill={lc} />
      <circle cx={108} cy={40} r={0.55} fill={lc} />
      <rect x={-2.5} y={35.5} width={2.5} height={9} fill="none" stroke={lc} strokeWidth={sw} />
      <rect x={120} y={35.5} width={2.5} height={9} fill="none" stroke={lc} strokeWidth={sw} />
    </g>
  )
}

function Star({ cx, cy, r, color }: { cx: number; cy: number; r: number; color: string }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const angle = (i * 36 - 90) * (Math.PI / 180)
    const rad = i % 2 === 0 ? r : r * 0.42
    return `${(cx + Math.cos(angle) * rad).toFixed(3)},${(cy + Math.sin(angle) * rad).toFixed(3)}`
  }).join(' ')
  return <polygon points={pts} fill={color} stroke="rgba(255,255,255,0.9)" strokeWidth={r * 0.1} />
}

interface TipState {
  relX: number
  relY: number
  lines: string[]
  isGoal: boolean
}

export function ShotMap({ shots, home, away, homeColor, awayColor }: ShotMapProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<TipState | null>(null)

  const processed = useMemo(() =>
    shots
      .filter(s => s.x != null && s.y != null)
      .map(s => ({
        ...s,
        px: s.team === 'away' ? 120 - s.x! : s.x!,
        py: s.team === 'away' ? 80 - s.y! : s.y!,
      })),
  [shots])

  const nonGoals = processed.filter(s => !s.goal)
  const goals    = processed.filter(s =>  s.goal)
  const homeXg    = processed.filter(s => s.team === 'home').reduce((a, s) => a + (s.xg ?? 0), 0)
  const awayXg    = processed.filter(s => s.team === 'away').reduce((a, s) => a + (s.xg ?? 0), 0)
  const homeGoals = goals.filter(s => s.team === 'home').length
  const awayGoals = goals.filter(s => s.team === 'away').length

  const relPos = useCallback((e: React.MouseEvent) => {
    const rect = wrapperRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }, [])

  const showTip = useCallback((e: React.MouseEvent, s: typeof processed[0]) => {
    const p = relPos(e)
    setTooltip({
      relX: p.x, relY: p.y,
      isGoal: s.goal,
      lines: [
        s.goal
          ? `⚽ GOAL — ${s.player_full || s.player || '—'}`
          : (s.player_full || s.player || '—'),
        `Team: ${s.team === 'home' ? home : away}`,
        `Minute: ${s.minute ?? '—'}'`,
        `xG: ${(s.xg ?? 0).toFixed(3)}`,
        ...(s.technique ? [`${s.technique}${s.body_part ? ' · ' + s.body_part : ''}`] : []),
      ],
    })
  }, [relPos, home, away])

  const moveTip = useCallback((e: React.MouseEvent) => {
    const p = relPos(e)
    setTooltip(t => t ? { ...t, relX: p.x, relY: p.y } : null)
  }, [relPos])

  const hideTip = useCallback(() => setTooltip(null), [])

  if (processed.length === 0) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: 'var(--muted)',
        fontFamily: "'DM Mono', monospace", fontSize: 11,
      }}>
        No shot data available
      </div>
    )
  }

  return (
    <div ref={wrapperRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg
        viewBox="-6 -10 132 102"
        style={{ width: '100%', height: '100%', display: 'block' }}
        preserveAspectRatio="xMidYMid meet"
      >
        <SvgPitch />

        {/* Direction labels above pitch */}
        <text x={30} y={-4} textAnchor="middle" fontSize={2.6} fill={awayColor}
          fontFamily="DM Mono, monospace" opacity={0.82}
          style={{ pointerEvents: 'none', userSelect: 'none' }}>
          ← {away.split(' ').pop()} attacks
        </text>
        <text x={90} y={-4} textAnchor="middle" fontSize={2.6} fill={homeColor}
          fontFamily="DM Mono, monospace" opacity={0.82}
          style={{ pointerEvents: 'none', userSelect: 'none' }}>
          {home.split(' ').pop()} attacks →
        </text>

        {/* Non-goal shots */}
        {nonGoals.map((s, i) => {
          const r = Math.max(Math.sqrt(s.xg ?? 0.05) * 3.2, 0.9)
          const color = s.team === 'home' ? homeColor : awayColor
          return (
            <circle key={`sh${i}`}
              cx={s.px} cy={s.py} r={r}
              fill={color} fillOpacity={0.68}
              stroke="rgba(255,255,255,0.22)" strokeWidth={0.22}
              style={{ cursor: 'pointer' }}
              onMouseEnter={e => showTip(e, s)}
              onMouseMove={moveTip}
              onMouseLeave={hideTip}
            />
          )
        })}

        {/* Goal stars */}
        {goals.map((s, i) => {
          const color = s.team === 'home' ? homeColor : awayColor
          return (
            <g key={`gl${i}`} style={{ cursor: 'pointer' }}
              onMouseEnter={e => showTip(e, s)}
              onMouseMove={moveTip}
              onMouseLeave={hideTip}>
              {/* Halo */}
              <circle cx={s.px} cy={s.py} r={3.5}
                fill="rgba(251,191,36,0.10)" stroke="rgba(251,191,36,0.35)"
                strokeWidth={0.3} />
              <Star cx={s.px} cy={s.py} r={2.4} color={color} />
            </g>
          )
        })}

        {/* Info boxes */}
        {/* Home — right side */}
        <g>
          <rect x={99} y={70} width={19} height={8} rx={0.6}
            fill="rgba(10,13,20,0.86)" stroke={homeColor} strokeWidth={0.3} />
          <text x={108.5} y={73} textAnchor="middle" fontSize={2.15}
            fill={homeColor} fontFamily="DM Mono, monospace" fontWeight="bold"
            style={{ pointerEvents: 'none', userSelect: 'none' }}>
            {(home.split(' ').pop() ?? home).slice(0, 10)}
          </text>
          <text x={108.5} y={76.5} textAnchor="middle" fontSize={1.95}
            fill={homeColor} fontFamily="DM Mono, monospace"
            style={{ pointerEvents: 'none', userSelect: 'none' }}>
            {homeGoals}G · xG {homeXg.toFixed(2)}
          </text>
        </g>
        {/* Away — left side */}
        <g>
          <rect x={2} y={70} width={19} height={8} rx={0.6}
            fill="rgba(10,13,20,0.86)" stroke={awayColor} strokeWidth={0.3} />
          <text x={11.5} y={73} textAnchor="middle" fontSize={2.15}
            fill={awayColor} fontFamily="DM Mono, monospace" fontWeight="bold"
            style={{ pointerEvents: 'none', userSelect: 'none' }}>
            {(away.split(' ').pop() ?? away).slice(0, 10)}
          </text>
          <text x={11.5} y={76.5} textAnchor="middle" fontSize={1.95}
            fill={awayColor} fontFamily="DM Mono, monospace"
            style={{ pointerEvents: 'none', userSelect: 'none' }}>
            {awayGoals}G · xG {awayXg.toFixed(2)}
          </text>
        </g>

        {/* Legend */}
        <g transform="translate(4, 84)">
          <circle cx={2} cy={1.5} r={1.4} fill="#6e7891" fillOpacity={0.7} />
          <text x={5} y={2.8} fontSize={2.1} fill="#6e7891" fontFamily="DM Mono, monospace">
            Shot (size = √xG) · hover for player detail
          </text>
          <Star cx={65} cy={1.5} r={1.8} color="#aaa" />
          <text x={68} y={2.8} fontSize={2.1} fill="#6e7891" fontFamily="DM Mono, monospace">
            Goal (★)
          </text>
          <circle cx={82} cy={1.5} r={1.4} fill={homeColor} fillOpacity={0.7} />
          <text x={85} y={2.8} fontSize={2.1} fill="#6e7891" fontFamily="DM Mono, monospace">
            {(home.split(' ').pop() ?? '').slice(0, 8)}
          </text>
          <circle cx={102} cy={1.5} r={1.4} fill={awayColor} fillOpacity={0.7} />
          <text x={105} y={2.8} fontSize={2.1} fill="#6e7891" fontFamily="DM Mono, monospace">
            {(away.split(' ').pop() ?? '').slice(0, 8)}
          </text>
        </g>
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'absolute',
          left: Math.min(tooltip.relX + 14, (wrapperRef.current?.offsetWidth ?? 500) - 240),
          top: Math.max(tooltip.relY - 100, 4),
          background: 'rgba(10,13,20,0.96)',
          border: `1px solid ${tooltip.isGoal ? 'rgba(251,191,36,0.5)' : '#4a5168'}`,
          borderLeft: `3px solid ${tooltip.isGoal ? '#fbbf24' : '#58a6ff'}`,
          borderRadius: 7,
          padding: '8px 12px',
          fontSize: 11,
          fontFamily: "'DM Mono', monospace",
          color: '#e2e8f0',
          pointerEvents: 'none',
          zIndex: 200,
          lineHeight: 1.85,
          maxWidth: 240,
          boxShadow: '0 6px 24px rgba(0,0,0,0.65)',
        }}>
          {tooltip.lines.map((line, i) => (
            <div key={i} style={{
              fontWeight: i === 0 ? 700 : 400,
              color: i === 0 ? (tooltip.isGoal ? '#fbbf24' : '#fff') : '#8b949e',
              fontSize: i === 0 ? 12 : 11,
            }}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
