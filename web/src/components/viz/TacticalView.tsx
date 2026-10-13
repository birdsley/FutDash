/**
 * TacticalView.tsx — Combined pitch, both teams, inline coordinate math.
 *
 * COORDINATE SYSTEM:
 *   StatsBomb stores each team's events in a "attacking right" frame.
 *   _build_net() does NOT mirror either team — both have GK at low-x (~5)
 *   and strikers at high-x (~110) in the JSON.
 *
 *   We remap to a single combined pitch:
 *     Home → left half:   displayX = rawX * 0.5         maps [0,120] → [0,60]
 *     Away → right half:  displayX = 60 + (120-rawX)*0.5 maps [0,120] → [60,120]
 *       (this inverts away team so their GK is on the right edge)
 *
 *   Critically, ALL coordinate math is done inline (no posMap lookup) to
 *   eliminate any possibility of a lookup mismatch causing wrong positions.
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import type { Network, NetworkNode, Phases, PhaseShape } from '../../types'

interface CombinedPitchProps {
  networkHome: Network
  networkAway: Network
  homeColor: string
  awayColor: string
  home: string
  away: string
}

interface TacticalViewProps extends CombinedPitchProps {
  phases?: Phases
}

// ── Coordinate transforms ─────────────────────────────────────────
// Home team: compress [0,120] → [0,60] (left half)
const hx = (x: number) => x * 0.5
// Away team: invert + compress [0,120] → [60,120] (right half)
const ax = (x: number) => 60 + (120 - x) * 0.5

// ── Full pitch ────────────────────────────────────────────────────
function FullPitch() {
  const lc = 'rgba(180,200,180,0.48)'
  const sw = 0.55
  return (
    <g>
      <defs>
        <linearGradient id="tvGrass" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#1a3d24" />
          <stop offset="50%"  stopColor="#1e4429" />
          <stop offset="100%" stopColor="#1a3d24" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={120} height={80} fill="url(#tvGrass)" />
      {[0,1,2,3,4,5].map(i => (
        <rect key={i} x={i*20} y={0} width={10} height={80} fill="rgba(0,0,0,0.055)" />
      ))}
      <rect x={0} y={0} width={120} height={80} fill="none" stroke={lc} strokeWidth={sw} />
      <line x1={60} y1={0} x2={60} y2={80} stroke={lc} strokeWidth={sw} />
      <circle cx={60} cy={40} r={10} fill="none" stroke={lc} strokeWidth={sw} />
      <circle cx={60} cy={40} r={0.6} fill={lc} />
      {/* Left penalty box */}
      <rect x={0} y={18} width={18} height={44} fill="none" stroke={lc} strokeWidth={sw} />
      {/* Right penalty box */}
      <rect x={102} y={18} width={18} height={44} fill="none" stroke={lc} strokeWidth={sw} />
      {/* 6-yard boxes */}
      <rect x={0} y={30} width={6} height={20} fill="none" stroke={lc} strokeWidth={sw} />
      <rect x={114} y={30} width={6} height={20} fill="none" stroke={lc} strokeWidth={sw} />
      {/* Penalty arcs */}
      <path d="M18,31.8 A10,10 0 0,1 18,48.2" fill="none" stroke={lc} strokeWidth={sw} />
      <path d="M102,31.8 A10,10 0 0,0 102,48.2" fill="none" stroke={lc} strokeWidth={sw} />
      {/* Penalty spots */}
      <circle cx={12} cy={40} r={0.55} fill={lc} />
      <circle cx={108} cy={40} r={0.55} fill={lc} />
      {/* Goals */}
      <rect x={-2.5} y={35.5} width={2.5} height={9} fill="none" stroke={lc} strokeWidth={sw} />
      <rect x={120} y={35.5} width={2.5} height={9} fill="none" stroke={lc} strokeWidth={sw} />
    </g>
  )
}

// ── Tooltip state ─────────────────────────────────────────────────
interface TipState {
  relX: number
  relY: number
  title: string
  lines: string[]
  color: string
}

// ── Combined pitch (both teams) ───────────────────────────────────
function CombinedPitch({
  networkHome, networkAway,
  homeColor, awayColor,
  home, away,
}: CombinedPitchProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<TipState | null>(null)
  const [highlighted, setHighlighted] = useState<string | null>(null)

  // Build quick lookup maps for edge rendering (node id → raw x,y from JSON)
  // These are ONLY used for edges, not nodes. Nodes use inline math.
  const homeRawPos: Record<string, [number, number]> = {}
  networkHome.nodes.forEach(n => { homeRawPos[n.id] = [n.x, n.y] })

  const awayRawPos: Record<string, [number, number]> = {}
  networkAway.nodes.forEach(n => { awayRawPos[n.id] = [n.x, n.y] })

  const maxWeight = Math.max(
    ...networkHome.edges.map(e => e.weight),
    ...networkAway.edges.map(e => e.weight),
    1,
  )

  const relPos = useCallback((e: React.MouseEvent) => {
    const rect = wrapperRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }, [])

  const showTip = useCallback((
    e: React.MouseEvent, node: NetworkNode, isAway: boolean
  ) => {
    const p = relPos(e)
    setTooltip({
      relX: p.x, relY: p.y,
      title: node.name || node.id,
      color: isAway ? awayColor : homeColor,
      lines: [
        `Team: ${isAway ? away : home}`,
        node.is_playmaker ? '★ Playmaker' : 'Player',
        `Influence: ${typeof node.eigenvector === 'number' ? node.eigenvector.toFixed(3) : '—'}`,
        `Betweenness: ${typeof node.betweenness === 'number' ? node.betweenness.toFixed(3) : '—'}`,
      ],
    })
    setHighlighted(node.id)
  }, [relPos, home, away, homeColor, awayColor])

  const moveTip = useCallback((e: React.MouseEvent) => {
    const p = relPos(e)
    setTooltip(t => t ? { ...t, relX: p.x, relY: p.y } : null)
  }, [relPos])

  const hideTip = useCallback(() => {
    setTooltip(null)
    setHighlighted(null)
  }, [])

  // ── Render edges — inline coord math, no lookup failure possible ──
  const renderHomeEdges = () =>
    networkHome.edges.map((e, i) => {
      const src = homeRawPos[e.source]
      const tgt = homeRawPos[e.target]
      if (!src || !tgt) return null
      // Apply home transform inline
      const x1 = hx(src[0]); const y1 = src[1]
      const x2 = hx(tgt[0]); const y2 = tgt[1]
      const isHL = !highlighted || e.source === highlighted || e.target === highlighted
      const w01 = e.weight / maxWeight
      const opacity = isHL ? 0.12 + 0.65 * w01 : 0.03
      const sw = 0.2 + 1.4 * w01
      return (
        <line key={`he${i}`} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={homeColor} strokeWidth={sw} strokeOpacity={opacity}
          strokeLinecap="round" />
      )
    })

  const renderAwayEdges = () =>
    networkAway.edges.map((e, i) => {
      const src = awayRawPos[e.source]
      const tgt = awayRawPos[e.target]
      if (!src || !tgt) return null
      // Apply away transform inline
      const x1 = ax(src[0]); const y1 = src[1]
      const x2 = ax(tgt[0]); const y2 = tgt[1]
      const isHL = !highlighted || e.source === highlighted || e.target === highlighted
      const w01 = e.weight / maxWeight
      const opacity = isHL ? 0.12 + 0.65 * w01 : 0.03
      const sw = 0.2 + 1.4 * w01
      return (
        <line key={`ae${i}`} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={awayColor} strokeWidth={sw} strokeOpacity={opacity}
          strokeLinecap="round" />
      )
    })

  // ── Render nodes — INLINE coord math, guaranteed correct ─────────
  const renderHomeNodes = () =>
    networkHome.nodes.map(n => {
      // INLINE transform: no posMap lookup, no intermediate state
      const cx = hx(n.x)
      const cy = n.y
      const r = Math.max(Math.sqrt(Math.max(n.size, 55)) * 0.20, 2.2)
      const isHL = !highlighted || highlighted === n.id
      const fill = n.is_playmaker ? '#fbbf24' : homeColor
      const stroke = n.is_playmaker ? '#fbbf24' : (highlighted === n.id ? '#ffffff' : 'rgba(255,255,255,0.75)')
      const opacity = isHL ? 0.95 : 0.18
      const label = n.short || (n.id.split(' ').pop()?.slice(0, 13) ?? '')
      return (
        <g key={`hn${n.id}`} style={{ cursor: 'pointer' }}
          onMouseEnter={e => showTip(e, n, false)}
          onMouseMove={moveTip}
          onMouseLeave={hideTip}
          onClick={() => setHighlighted(prev => prev === n.id ? null : n.id)}
        >
          <circle cx={cx} cy={cy} r={r + 1.3}
            fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth={2.2}
            opacity={opacity} />
          <circle cx={cx} cy={cy} r={r}
            fill={fill} stroke={stroke}
            strokeWidth={n.is_playmaker ? 0.65 : 0.45}
            opacity={opacity} />
          <text x={cx} y={cy - r - 0.8} textAnchor="middle"
            fontSize={2.25} fill="#e6edf3" fontFamily="DM Mono, monospace"
            opacity={opacity}
            style={{ pointerEvents: 'none', userSelect: 'none' }}>
            {label}
          </text>
        </g>
      )
    })

  const renderAwayNodes = () =>
    networkAway.nodes.map(n => {
      // INLINE transform for away team — maps [0,120] → [60,120]
      const cx = ax(n.x)
      const cy = n.y
      const r = Math.max(Math.sqrt(Math.max(n.size, 55)) * 0.20, 2.2)
      const isHL = !highlighted || highlighted === n.id
      const fill = n.is_playmaker ? '#fbbf24' : awayColor
      const stroke = n.is_playmaker ? '#fbbf24' : (highlighted === n.id ? '#ffffff' : 'rgba(255,255,255,0.75)')
      const opacity = isHL ? 0.95 : 0.18
      const label = n.short || (n.id.split(' ').pop()?.slice(0, 13) ?? '')
      return (
        <g key={`an${n.id}`} style={{ cursor: 'pointer' }}
          onMouseEnter={e => showTip(e, n, true)}
          onMouseMove={moveTip}
          onMouseLeave={hideTip}
          onClick={() => setHighlighted(prev => prev === n.id ? null : n.id)}
        >
          <circle cx={cx} cy={cy} r={r + 1.3}
            fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth={2.2}
            opacity={opacity} />
          <circle cx={cx} cy={cy} r={r}
            fill={fill} stroke={stroke}
            strokeWidth={n.is_playmaker ? 0.65 : 0.45}
            opacity={opacity} />
          <text x={cx} y={cy - r - 0.8} textAnchor="middle"
            fontSize={2.25} fill="#e6edf3" fontFamily="DM Mono, monospace"
            opacity={opacity}
            style={{ pointerEvents: 'none', userSelect: 'none' }}>
            {label}
          </text>
        </g>
      )
    })

  const hasData = networkHome.nodes.length > 0 || networkAway.nodes.length > 0
  const homePlaymaker = networkHome.nodes.find(n => n.is_playmaker)
  const awayPlaymaker = networkAway.nodes.find(n => n.is_playmaker)

  if (!hasData) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: 'var(--muted)',
        fontFamily: "'DM Mono', monospace", fontSize: 12,
      }}>
        No tactical data available
      </div>
    )
  }

  return (
    <div ref={wrapperRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg
        viewBox="-6 -6 132 100"
        style={{ width: '100%', height: '100%', display: 'block' }}
        preserveAspectRatio="xMidYMid meet"
      >
        <FullPitch />

        {/* Edges behind nodes */}
        {renderHomeEdges()}
        {renderAwayEdges()}

        {/* Nodes on top */}
        {renderHomeNodes()}
        {renderAwayNodes()}

        {/* Legend */}
        <g transform="translate(2,83)">
          <circle cx={3} cy={2} r={2} fill={homeColor} opacity={0.9} />
          <text x={7} y={3.4} fontSize={2.4} fill="#8b949e" fontFamily="DM Mono, monospace">
            {home.length > 22 ? home.slice(0,21)+'…' : home}
            {homePlaymaker ? `  ★ ${homePlaymaker.short}` : ''}
          </text>
          <circle cx={65} cy={2} r={2} fill={awayColor} opacity={0.9} />
          <text x={69} y={3.4} fontSize={2.4} fill="#8b949e" fontFamily="DM Mono, monospace">
            {away.length > 22 ? away.slice(0,21)+'…' : away}
            {awayPlaymaker ? `  ★ ${awayPlaymaker.short}` : ''}
          </text>
          <text x={60} y={8.5} textAnchor="middle" fontSize={2.0}
            fill="#4a5168" fontFamily="DM Mono, monospace">
            Click node to highlight connections · Gold = playmaker · Hover for stats
          </text>
        </g>
      </svg>

      {/* Tooltip — absolute within wrapper, scroll-safe */}
      {tooltip && (
        <div style={{
          position: 'absolute',
          left: Math.min(tooltip.relX + 14, (wrapperRef.current?.offsetWidth ?? 400) - 240),
          top: Math.max(tooltip.relY - 95, 4),
          background: 'rgba(10,13,20,0.96)',
          border: `1px solid ${tooltip.color}50`,
          borderLeft: `3px solid ${tooltip.color}`,
          borderRadius: 7,
          padding: '8px 12px',
          fontSize: 11,
          fontFamily: "'DM Mono', monospace",
          color: '#e2e8f0',
          pointerEvents: 'none',
          zIndex: 200,
          lineHeight: 1.85,
          minWidth: 185,
          maxWidth: 240,
          boxShadow: '0 6px 24px rgba(0,0,0,0.65)',
        }}>
          <div style={{ fontWeight: 700, color: '#fff', fontSize: 12, marginBottom: 4 }}>
            {tooltip.title}
          </div>
          {tooltip.lines.map((line, i) => (
            <div key={i} style={{ color: '#8b949e' }}>{line}</div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Possession phases (StatsBomb 360 matches only) ────────────────
type View = 'both' | 'home' | 'away'

const AUTO_MS = 6000
const FADE_MS = 400
const mono = "'DM Mono', monospace"

function usePrefersReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)'
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/**
 * Entry point. Without 360 phases this renders the combined pitch exactly as
 * before; with them it adds a view switch and two possession-phase pitches.
 */
export function TacticalView({ phases, ...props }: TacticalViewProps) {
  if (!phases?.available) return <CombinedPitch {...props} />
  return <PhasedTacticalView phases={phases} {...props} />
}

function PhasedTacticalView({ phases, ...props }: CombinedPitchProps & { phases: Phases }) {
  const { home, away, homeColor, awayColor } = props
  const [view, setView] = useState<View>('both')
  const [autoPlay, setAutoPlay] = useState(false)
  const [hovered, setHovered] = useState(false)
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    if (!autoPlay || hovered || reducedMotion) return
    const t = window.setTimeout(() => setView(v => (v === 'home' ? 'away' : 'home')), AUTO_MS)
    return () => window.clearTimeout(t)
  }, [autoPlay, hovered, reducedMotion, view])

  const choose = (v: View) => { setAutoPlay(false); setView(v) }
  const toggleAuto = () => {
    if (autoPlay) { setAutoPlay(false); return }
    if (view === 'both') setView('home')
    setAutoPlay(true)
  }

  const options: { id: View; label: string; color: string }[] = [
    { id: 'both', label: 'Both teams', color: 'var(--accent)' },
    { id: 'home', label: `${home} in possession`, color: homeColor },
    { id: 'away', label: `${away} in possession`, color: awayColor },
  ]
  // Layers are stacked in a fixed-size stage, so switching never shifts layout.
  const layer = (active: boolean): React.CSSProperties => ({
    position: 'absolute', inset: 0,
    opacity: active ? 1 : 0,
    visibility: active ? 'visible' : 'hidden',
    pointerEvents: active ? 'auto' : 'none',
    transition: reducedMotion ? 'none' : `opacity ${FADE_MS}ms ease, visibility ${FADE_MS}ms`,
  })

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="tv-phase-bar" role="group" aria-label="Tactical view">
        {options.map(o => {
          const active = view === o.id
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={active}
              onClick={() => choose(o.id)}
              className="tv-phase-btn"
              style={{
                color: active ? 'var(--text)' : 'var(--muted)',
                borderBottomColor: active ? o.color : 'transparent',
              }}
            >
              {o.label}
            </button>
          )
        })}
        {!reducedMotion && (
          <button
            type="button"
            aria-pressed={autoPlay}
            onClick={toggleAuto}
            className="tv-phase-btn tv-phase-auto"
            style={{ color: autoPlay ? 'var(--text)' : 'var(--muted)' }}
          >
            {autoPlay ? 'Pause' : 'Auto-play'}
          </button>
        )}
      </div>

      {/* Hovering the pitch (not the controls) pauses auto-play, so the
          click that starts it doesn't immediately pause it. */}
      <div
        style={{ flex: 1, minHeight: 0, position: 'relative' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div style={layer(view === 'both')} aria-hidden={view !== 'both'}>
          <CombinedPitch {...props} />
        </div>
        <div style={layer(view === 'home')} aria-hidden={view !== 'home'}>
          <PhasePitch
            network={props.networkHome} attackColor={homeColor} attacking={home}
            shape={phases.home_possession} defendColor={awayColor} defending={away}
            grid={phases.grid} maxWeight={edgeMax(props)}
          />
        </div>
        <div style={layer(view === 'away')} aria-hidden={view !== 'away'}>
          <PhasePitch
            network={props.networkAway} attackColor={awayColor} attacking={away}
            shape={phases.away_possession} defendColor={homeColor} defending={home}
            grid={phases.grid} maxWeight={edgeMax(props)}
          />
        </div>
      </div>

      <style>{`
        .tv-phase-bar {
          display: flex; align-items: stretch; gap: 0;
          padding: 0 1rem; border-bottom: 1px solid var(--border);
          overflow-x: auto; scrollbar-width: none; flex-shrink: 0;
        }
        .tv-phase-bar::-webkit-scrollbar { display: none; }
        .tv-phase-btn {
          background: none; border: 0; border-bottom: 2px solid transparent;
          margin-bottom: -1px; padding: 0.6rem 0.9rem; cursor: pointer;
          font-family: ${mono}; font-size: 11px; letter-spacing: 0.08em;
          text-transform: uppercase; white-space: nowrap;
          transition: color 0.15s, border-color 0.15s;
        }
        .tv-phase-btn:hover { color: var(--text) !important; }
        .tv-phase-btn:focus-visible { outline: 1px solid var(--accent); outline-offset: -3px; }
        .tv-phase-auto { margin-left: auto; }
        .tv-phase-foot {
          display: flex; align-items: center; gap: 0.5rem 1rem; flex-wrap: wrap;
          padding: 0.55rem 1rem 0.75rem;
        }
        .tv-chips { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .tv-chip {
          font-family: ${mono}; font-size: 11px; color: var(--muted);
          background: var(--surface2); border: 1px solid var(--border);
          border-radius: 3px; padding: 0.3rem 0.6rem; white-space: nowrap;
        }
        .tv-chip b { color: var(--text); font-weight: 500; }
        .tv-caption {
          font-family: ${mono}; font-size: 10px; color: var(--muted2);
          margin: 0; line-height: 1.5; flex: 1 1 260px;
        }
        @media (max-width: 768px) {
          .tv-phase-bar { padding: 0 0.25rem; }
          .tv-phase-btn { padding: 0.6rem 0.65rem; }
          .tv-chips { flex-direction: column; align-items: flex-start; }
        }
      `}</style>
    </div>
  )
}

// Same edge scale as the combined pitch, so line weights match between views.
function edgeMax({ networkHome, networkAway }: CombinedPitchProps) {
  return Math.max(...networkHome.edges.map(e => e.weight), ...networkAway.edges.map(e => e.weight), 1)
}

interface PhasePitchProps {
  network: Network
  attackColor: string
  attacking: string
  shape: PhaseShape
  defendColor: string
  defending: string
  grid: { cols: number; rows: number }
  maxWeight: number
}

/** One full pitch: possessing team attacks right, defenders' heat behind it. */
function PhasePitch({
  network, attackColor, attacking, shape, defendColor, defending, grid, maxWeight,
}: PhasePitchProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<TipState | null>(null)
  const [highlighted, setHighlighted] = useState<string | null>(null)

  const rawPos: Record<string, [number, number]> = {}
  network.nodes.forEach(n => { rawPos[n.id] = [n.x, n.y] })

  const cw = 120 / grid.cols
  const ch = 80 / grid.rows
  const lineX = 120 - shape.line_height
  const filterId = `tvHeatBlur-${attacking.replace(/[^a-z0-9]/gi, '')}`
  const clipId = `${filterId}-clip`

  const relPos = (e: React.MouseEvent) => {
    const rect = wrapperRef.current?.getBoundingClientRect()
    return rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : { x: 0, y: 0 }
  }
  const showTip = (e: React.MouseEvent, node: NetworkNode) => {
    const p = relPos(e)
    setTooltip({
      relX: p.x, relY: p.y,
      title: node.name || node.id,
      color: attackColor,
      lines: [
        `Team: ${attacking}`,
        node.is_playmaker ? '★ Playmaker' : 'Player',
        `Influence: ${typeof node.eigenvector === 'number' ? node.eigenvector.toFixed(3) : '—'}`,
        `Betweenness: ${typeof node.betweenness === 'number' ? node.betweenness.toFixed(3) : '—'}`,
      ],
    })
    setHighlighted(node.id)
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div ref={wrapperRef} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <svg
          viewBox="-4 -7 128 90"
          style={{ width: '100%', height: '100%', display: 'block' }}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`${attacking} pass network with ${defending}'s defensive shape`}
        >
          <defs>
            <filter id={filterId} x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation={4.5} />
            </filter>
            <clipPath id={clipId}><rect x={0} y={0} width={120} height={80} /></clipPath>
          </defs>
          <FullPitch />

          {/* Defending team's presence: blurred 5-yard cells, low alpha */}
          <g clipPath={`url(#${clipId})`}>
            {/* crispEdges: anti-aliased seams between cells would survive the blur as a grid */}
            <g filter={`url(#${filterId})`} shapeRendering="crispEdges">
              {shape.defense_heat.map((v, i) => v < 0.02 ? null : (
                <rect key={i}
                  x={(i % grid.cols) * cw} y={Math.floor(i / grid.cols) * ch}
                  width={cw} height={ch}
                  fill={defendColor} fillOpacity={0.62 * Math.pow(v, 0.8)} />
              ))}
            </g>
          </g>

          {/* Defensive line */}
          <line x1={lineX} y1={0.6} x2={lineX} y2={79.4}
            stroke={defendColor} strokeWidth={0.45} strokeDasharray="1.6 1.2" strokeOpacity={0.9} />
          <text x={lineX - 1} y={-1.6} textAnchor="end" fontSize={2.2}
            fill="#8b949e" fontFamily="DM Mono, monospace">
            {defending} line
          </text>

          <text x={120} y={-1.6} textAnchor="end" fontSize={2.2}
            fill="#8b949e" fontFamily="DM Mono, monospace">
            Attacking →
          </text>
          <text x={0} y={-1.6} fontSize={2.2} fill={attackColor} fontFamily="DM Mono, monospace">
            {attacking} in possession
          </text>

          {/* Pass network, unchanged coordinates (attacking right) */}
          {network.edges.map((e, i) => {
            const src = rawPos[e.source]; const tgt = rawPos[e.target]
            if (!src || !tgt) return null
            const isHL = !highlighted || e.source === highlighted || e.target === highlighted
            const w01 = e.weight / maxWeight
            return (
              <line key={`pe${i}`} x1={src[0]} y1={src[1]} x2={tgt[0]} y2={tgt[1]}
                stroke={attackColor} strokeWidth={0.2 + 1.4 * w01}
                strokeOpacity={isHL ? 0.12 + 0.65 * w01 : 0.03} strokeLinecap="round" />
            )
          })}
          {network.nodes.map(n => {
            const r = Math.max(Math.sqrt(Math.max(n.size, 55)) * 0.20, 2.2)
            const isHL = !highlighted || highlighted === n.id
            const fill = n.is_playmaker ? '#fbbf24' : attackColor
            const stroke = n.is_playmaker ? '#fbbf24' : (highlighted === n.id ? '#ffffff' : 'rgba(255,255,255,0.75)')
            const opacity = isHL ? 0.95 : 0.18
            const label = n.short || (n.id.split(' ').pop()?.slice(0, 13) ?? '')
            return (
              <g key={`pn${n.id}`} style={{ cursor: 'pointer' }}
                onMouseEnter={e => showTip(e, n)}
                onMouseMove={e => { const p = relPos(e); setTooltip(t => t ? { ...t, relX: p.x, relY: p.y } : null) }}
                onMouseLeave={() => { setTooltip(null); setHighlighted(null) }}
                onClick={() => setHighlighted(prev => prev === n.id ? null : n.id)}
              >
                <circle cx={n.x} cy={n.y} r={r + 1.3} fill="none"
                  stroke="rgba(255,255,255,0.13)" strokeWidth={2.2} opacity={opacity} />
                <circle cx={n.x} cy={n.y} r={r} fill={fill} stroke={stroke}
                  strokeWidth={n.is_playmaker ? 0.65 : 0.45} opacity={opacity} />
                <text x={n.x} y={n.y - r - 0.8} textAnchor="middle"
                  fontSize={2.25} fill="#e6edf3" fontFamily="DM Mono, monospace"
                  opacity={opacity} style={{ pointerEvents: 'none', userSelect: 'none' }}>
                  {label}
                </text>
              </g>
            )
          })}
        </svg>

        {tooltip && (
          <div style={{
            position: 'absolute',
            left: Math.min(tooltip.relX + 14, (wrapperRef.current?.offsetWidth ?? 400) - 240),
            top: Math.max(tooltip.relY - 95, 4),
            background: 'rgba(10,13,20,0.96)',
            border: `1px solid ${tooltip.color}50`,
            borderLeft: `3px solid ${tooltip.color}`,
            borderRadius: 7, padding: '8px 12px', fontSize: 11, fontFamily: mono,
            color: '#e2e8f0', pointerEvents: 'none', zIndex: 200, lineHeight: 1.85,
            minWidth: 185, maxWidth: 240, boxShadow: '0 6px 24px rgba(0,0,0,0.65)',
          }}>
            <div style={{ fontWeight: 700, color: '#fff', fontSize: 12, marginBottom: 4 }}>{tooltip.title}</div>
            {tooltip.lines.map((line, i) => <div key={i} style={{ color: '#8b949e' }}>{line}</div>)}
          </div>
        )}
      </div>

      <div className="tv-phase-foot">
        <div className="tv-chips">
          <span className="tv-chip" style={{ borderLeft: `2px solid ${defendColor}` }}>
            Defensive line <b>{shape.line_height.toFixed(1)}</b> yds from goal
          </span>
          <span className="tv-chip" style={{ borderLeft: `2px solid ${defendColor}` }}>
            Width <b>{shape.width.toFixed(1)}</b> yds
          </span>
          <span className="tv-chip" style={{ borderLeft: `2px solid ${defendColor}` }}>
            Depth <b>{shape.depth.toFixed(1)}</b> yds
          </span>
        </div>
        <p className="tv-caption">
          Defensive shape from StatsBomb 360 freeze frames: players visible to the broadcast
          camera only, individuals not identified. Coordinates in StatsBomb yards.
        </p>
      </div>
    </div>
  )
}
