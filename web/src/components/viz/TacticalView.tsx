/**
 * TacticalView.tsx — Combined pitch, both teams, inline coordinate math.
 *
 * COORDINATE SYSTEM:
 *   StatsBomb stores each team's events in a "attacking right" frame.
 *   _build_net() mirrors the away team's x (120-x) so the JSON stores
 *   both teams with GK at low-x and striker at high-x.
 *
 *   We remap to a single combined pitch:
 *     Home → left half:   displayX = rawX * 0.5         maps [0,120] → [0,60]
 *     Away → right half:  displayX = 60 + (120-rawX)*0.5 maps [0,120] → [60,120]
 *
 *   Critically, ALL coordinate math is done inline (no posMap lookup) to
 *   eliminate any possibility of a lookup mismatch causing wrong positions.
 */

import { useState, useRef, useCallback } from 'react'
import type { Network, NetworkNode } from '../../types'

interface TacticalViewProps {
  networkHome: Network
  networkAway: Network
  homeColor: string
  awayColor: string
  home: string
  away: string
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

// ── Main component ────────────────────────────────────────────────
export function TacticalView({
  networkHome, networkAway,
  homeColor, awayColor,
  home, away,
}: TacticalViewProps) {
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
      title: node.id,
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
