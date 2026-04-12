/**
 * ShotMap.tsx — Pure SVG implementation
 *
 * Same rationale as PassNetwork.tsx: Plotly's initialisation race condition
 * causes blank charts. SVG renders synchronously and is guaranteed visible.
 */

import { useMemo, useState, useCallback } from 'react'
import type { Shot } from '../../types'

interface ShotMapProps {
  shots: Shot[]
  home: string
  away: string
  homeColor: string
  awayColor: string
}

// ── Reusable pitch (same as PassNetwork) ─────────────────────────
function SvgPitch() {
  const lc = 'rgba(201,209,217,0.55)'
  const sw = 0.55
  return (
    <g>
      <rect x={0} y={0} width={120} height={80} fill="#1c3a28" />
      <rect x={0} y={0} width={120} height={80} fill="none" stroke={lc} strokeWidth={sw} />
      <line x1={60} y1={0} x2={60} y2={80} stroke={lc} strokeWidth={sw} />
      <circle cx={60} cy={40} r={10} fill="none" stroke={lc} strokeWidth={sw} />
      <circle cx={60} cy={40} r={0.55} fill={lc} />
      <rect x={0} y={18} width={18} height={44} fill="none" stroke={lc} strokeWidth={sw} />
      <rect x={102} y={18} width={18} height={44} fill="none" stroke={lc} strokeWidth={sw} />
      <rect x={0} y={30} width={6} height={20} fill="none" stroke={lc} strokeWidth={sw} />
      <rect x={114} y={30} width={6} height={20} fill="none" stroke={lc} strokeWidth={sw} />
      <circle cx={12} cy={40} r={0.5} fill={lc} />
      <circle cx={108} cy={40} r={0.5} fill={lc} />
      <rect x={-2} y={36} width={2} height={8} fill="none" stroke={lc} strokeWidth={sw} />
      <rect x={120} y={36} width={2} height={8} fill="none" stroke={lc} strokeWidth={sw} />
    </g>
  )
}

// ── 5-pointed star polygon ────────────────────────────────────────
function Star({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const angle = (i * 36 - 90) * (Math.PI / 180)
    const rad = i % 2 === 0 ? r : r * 0.4
    return `${(cx + Math.cos(angle) * rad).toFixed(2)},${(cy + Math.sin(angle) * rad).toFixed(2)}`
  }).join(' ')
  return (
    <polygon
      points={pts}
      fill="#fbbf24"
      stroke="rgba(255,255,255,0.85)"
      strokeWidth={r * 0.08}
    />
  )
}

// ── Small info box on the pitch ───────────────────────────────────
function InfoBox({
  x, y, label, xg, goals, color,
}: {
  x: number; y: number; label: string; xg: number; goals: number; color: string
}) {
  const line1 = label.slice(0, 10)
  const line2 = `xG ${xg.toFixed(2)} / ${goals}G`
  const w = Math.max(line1.length, line2.length) * 1.65 + 2
  return (
    <g>
      <rect x={x - w / 2} y={y} width={w} height={6.5} rx={0.5}
        fill="rgba(15,17,23,0.82)" stroke={color} strokeWidth={0.3} />
      <text x={x} y={y + 2.3} textAnchor="middle" fontSize={2} fill={color}
        fontFamily="DM Mono, monospace" fontWeight="bold"
        style={{ pointerEvents: 'none', userSelect: 'none' }}>
        {line1}
      </text>
      <text x={x} y={y + 5.2} textAnchor="middle" fontSize={1.9} fill={color}
        fontFamily="DM Mono, monospace"
        style={{ pointerEvents: 'none', userSelect: 'none' }}>
        {line2}
      </text>
    </g>
  )
}

// ── Tooltip ───────────────────────────────────────────────────────
interface TooltipState {
  screenX: number
  screenY: number
  lines: string[]
}

// ── Main component ────────────────────────────────────────────────
export function ShotMap({ shots, home, away, homeColor, awayColor }: ShotMapProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  // Mirror away shots so both teams attack right
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

  const handleEnter = useCallback((e: React.MouseEvent, s: typeof processed[0]) => {
    setTooltip({
      screenX: e.clientX,
      screenY: e.clientY,
      lines: [
        s.goal ? `⚽ GOAL — ${s.player_full || s.player || '—'}` : (s.player_full || s.player || '—'),
        `Team: ${s.team === 'home' ? home : away}`,
        `Minute: ${s.minute ?? '—'}'`,
        `xG: ${(s.xg ?? 0).toFixed(3)}`,
        ...(s.technique ? [`${s.technique} · ${s.body_part || ''}`] : []),
      ],
    })
  }, [home, away])

  const handleMove = useCallback((e: React.MouseEvent) => {
    setTooltip(t => (t ? { ...t, screenX: e.clientX, screenY: e.clientY } : null))
  }, [])

  const handleLeave = useCallback(() => setTooltip(null), [])

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
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg
        viewBox="-4 -4 128 92"
        style={{ width: '100%', height: '100%', display: 'block' }}
        preserveAspectRatio="xMidYMid meet"
      >
        <SvgPitch />

        {/* Direction labels */}
        <text x={28} y={85} textAnchor="middle" fontSize={2.2} fill={awayColor}
          fontFamily="DM Mono, monospace" opacity={0.75}
          style={{ pointerEvents: 'none', userSelect: 'none' }}>
          ← {away.split(' ').pop()} attacks
        </text>
        <text x={92} y={85} textAnchor="middle" fontSize={2.2} fill={homeColor}
          fontFamily="DM Mono, monospace" opacity={0.75}
          style={{ pointerEvents: 'none', userSelect: 'none' }}>
          {home.split(' ').pop()} attacks →
        </text>

        {/* Non-goal shots */}
        {nonGoals.map((s, i) => {
          const r = Math.max(Math.sqrt(s.xg ?? 0.05) * 2.8, 0.9)
          const color = s.team === 'home' ? homeColor : awayColor
          return (
            <circle
              key={`shot-${i}`}
              cx={s.px}
              cy={s.py}
              r={r}
              fill={color}
              fillOpacity={0.72}
              stroke="rgba(255,255,255,0.2)"
              strokeWidth={0.2}
              style={{ cursor: 'pointer' }}
              onMouseEnter={ev => handleEnter(ev, s)}
              onMouseMove={handleMove}
              onMouseLeave={handleLeave}
            />
          )
        })}

        {/* Goal stars */}
        {goals.map((s, i) => (
          <g key={`goal-${i}`}
            style={{ cursor: 'pointer' }}
            onMouseEnter={ev => handleEnter(ev, s)}
            onMouseMove={handleMove}
            onMouseLeave={handleLeave}
          >
            <Star cx={s.px} cy={s.py} r={2.2} />
          </g>
        ))}

        {/* Info boxes */}
        <InfoBox x={110} y={68} label={home.split(' ').pop() || home}
          xg={homeXg} goals={homeGoals} color={homeColor} />
        <InfoBox x={10} y={68} label={away.split(' ').pop() || away}
          xg={awayXg} goals={awayGoals} color={awayColor} />
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'fixed',
          left: tooltip.screenX + 14,
          top: tooltip.screenY - 28,
          background: '#0f1117',
          border: '1px solid #4a5168',
          borderRadius: 6,
          padding: '6px 10px',
          fontSize: 11,
          fontFamily: "'DM Mono', monospace",
          color: '#e2e8f0',
          pointerEvents: 'none',
          zIndex: 9999,
          lineHeight: 1.7,
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}>
          {tooltip.lines.map((line, i) => (
            <div key={i} style={{ fontWeight: i === 0 ? 700 : 400, color: i === 0 ? '#fff' : '#a0aab8' }}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
