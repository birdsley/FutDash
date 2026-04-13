/**
 * TacticalView.tsx
 * Combined full-pitch pass network — both teams on one field.
 *
 * Layout: home team on left half, away team mirrored to right half.
 * The halfway line naturally divides the two tactical shapes.
 *
 * Types used: Network, NetworkNode, NetworkEdge — all from existing types/index.ts
 * No new types needed.
 *
 * Tooltip fix: uses useRef + getBoundingClientRect so position is
 * relative to the wrapper div, not the viewport — scroll-safe.
 */

import { useMemo, useState, useRef, useCallback } from 'react'
import type { Network, NetworkNode } from '../../types'

interface TacticalViewProps {
  networkHome: Network
  networkAway: Network
  homeColor: string
  awayColor: string
  home: string
  away: string
}

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
      {/* Mowing stripes */}
      {[0,1,2,3,4,5].map(i => (
        <rect key={i} x={i*20} y={0} width={10} height={80}
          fill="rgba(0,0,0,0.055)" />
      ))}
      <rect x={0} y={0} width={120} height={80} fill="none" stroke={lc} strokeWidth={sw} />
      <line x1={60} y1={0} x2={60} y2={80} stroke={lc} strokeWidth={sw} />
      <circle cx={60} cy={40} r={10} fill="none" stroke={lc} strokeWidth={sw} />
      <circle cx={60} cy={40} r={0.6} fill={lc} />
      {/* Left penalty box */}
      <rect x={0} y={18} width={18} height={44} fill="none" stroke={lc} strokeWidth={sw} />
      {/* Right penalty box */}
      <rect x={102} y={18} width={18} height={44} fill="none" stroke={lc} strokeWidth={sw} />
      {/* Left 6-yard */}
      <rect x={0} y={30} width={6} height={20} fill="none" stroke={lc} strokeWidth={sw} />
      {/* Right 6-yard */}
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
  accentColor: string
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

  // Mirror away nodes for right-half display
  const awayMirrored = useMemo(() =>
    networkAway.nodes.map(n => ({ ...n, x: 120 - n.x, y: 80 - n.y })),
    [networkAway.nodes]
  )

  const maxWeight = useMemo(() => {
    const allWeights = [
      ...networkHome.edges.map(e => e.weight),
      ...networkAway.edges.map(e => e.weight),
      1,
    ]
    return Math.max(...allWeights)
  }, [networkHome.edges, networkAway.edges])

  // Position maps for O(1) edge coordinate lookup
  const homePosMap = useMemo(() => {
    const m: Record<string, [number, number]> = {}
    networkHome.nodes.forEach(n => { m[n.id] = [n.x, n.y] })
    return m
  }, [networkHome.nodes])

  const awayPosMap = useMemo(() => {
    const m: Record<string, [number, number]> = {}
    awayMirrored.forEach(n => { m[n.id] = [n.x, n.y] })
    return m
  }, [awayMirrored])

  // ── Tooltip helpers (relative to wrapper div, not viewport) ────
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
      accentColor: isAway ? awayColor : homeColor,
      lines: [
        `Team: ${isAway ? away : home}`,
        node.is_playmaker ? '★ Playmaker' : 'Field player',
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

  // ── Render edges ───────────────────────────────────────────────
  const renderEdges = (
    edges: Network['edges'],
    posMap: Record<string, [number, number]>,
    color: string,
  ) => edges.map((e, i) => {
    const [sx, sy] = posMap[e.source] ?? [-1, -1]
    const [tx, ty] = posMap[e.target] ?? [-1, -1]
    if (sx < 0 || tx < 0) return null

    const isHL = !highlighted || e.source === highlighted || e.target === highlighted
    const w01 = e.weight / maxWeight
    const opacity = isHL ? 0.14 + 0.65 * w01 : 0.03
    const sw = 0.2 + 1.4 * w01

    return (
      <line key={`e${i}`} x1={sx} y1={sy} x2={tx} y2={ty}
        stroke={color} strokeWidth={sw} strokeOpacity={opacity}
        strokeLinecap="round" />
    )
  })

  // ── Render nodes ───────────────────────────────────────────────
  const renderNodes = (
    nodes: NetworkNode[],
    posMap: Record<string, [number, number]>,
    color: string,
    isAway: boolean,
  ) => nodes.map(n => {
    const [cx, cy] = posMap[n.id] ?? [n.x, n.y]
    const r = Math.max(Math.sqrt(Math.max(n.size, 55)) * 0.20, 2.2)
    const isHL = !highlighted || highlighted === n.id
    const fill = n.is_playmaker ? '#fbbf24' : color
    const stroke = n.is_playmaker ? '#fbbf24' : (highlighted === n.id ? '#ffffff' : 'rgba(255,255,255,0.75)')
    const opacity = isHL ? 0.95 : 0.18
    const label = n.short || (n.id.split(' ').pop()?.slice(0, 13) ?? '')

    return (
      <g key={`n${n.id}${isAway ? 'a' : 'h'}`}
        style={{ cursor: 'pointer' }}
        onMouseEnter={e => showTip(e, n, isAway)}
        onMouseMove={moveTip}
        onMouseLeave={hideTip}
        onClick={() => setHighlighted(prev => prev === n.id ? null : n.id)}
      >
        {/* Glow ring */}
        <circle cx={cx} cy={cy} r={r + 1.3}
          fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth={2.2}
          opacity={opacity} />
        {/* Node */}
        <circle cx={cx} cy={cy} r={r}
          fill={fill} stroke={stroke}
          strokeWidth={n.is_playmaker ? 0.65 : 0.45}
          opacity={opacity} />
        {/* Label */}
        <text x={cx} y={cy - r - 0.8} textAnchor="middle"
          fontSize={2.25} fill="#e6edf3"
          fontFamily="DM Mono, monospace"
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
        No tactical data available for this match
      </div>
    )
  }

  return (
    <div ref={wrapperRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg
        viewBox="-6 -6 132 100"
        style={{ width: '100%', height: '100%', display: 'block' }}
        preserveAspectRatio="xMidYMid meet"
      >
        <FullPitch />

        {/* Edges first (drawn behind nodes) */}
        {renderEdges(networkHome.edges, homePosMap, homeColor)}
        {renderEdges(networkAway.edges, awayPosMap, awayColor)}

        {/* Nodes */}
        {renderNodes(networkHome.nodes, homePosMap, homeColor, false)}
        {renderNodes(awayMirrored, awayPosMap, awayColor, true)}

        {/* Bottom legend row */}
        <g transform="translate(2, 83)">
          {/* Home legend */}
          <circle cx={3} cy={2} r={2} fill={homeColor} opacity={0.9} />
          <text x={7} y={3.4} fontSize={2.4} fill="#8b949e"
            fontFamily="DM Mono, monospace">
            {home.length > 20 ? home.slice(0,19)+'…' : home}
            {homePlaymaker ? `  ★ ${homePlaymaker.short}` : ''}
          </text>
          {/* Away legend */}
          <circle cx={65} cy={2} r={2} fill={awayColor} opacity={0.9} />
          <text x={69} y={3.4} fontSize={2.4} fill="#8b949e"
            fontFamily="DM Mono, monospace">
            {away.length > 20 ? away.slice(0,19)+'…' : away}
            {awayPlaymaker ? `  ★ ${awayPlaymaker.short}` : ''}
          </text>
          {/* Interaction hint */}
          <text x={60} y={8.5} textAnchor="middle" fontSize={2.0}
            fill="#4a5168" fontFamily="DM Mono, monospace">
            Click node to highlight connections · Gold = playmaker
          </text>
        </g>
      </svg>

      {/* ── Tooltip: absolute positioned relative to wrapper ── */}
      {tooltip && (
        <div style={{
          position: 'absolute',
          // Offset right and slightly above cursor
          left: Math.min(tooltip.relX + 14, (wrapperRef.current?.offsetWidth ?? 400) - 230),
          top: Math.max(tooltip.relY - 90, 4),
          background: 'rgba(10,13,20,0.96)',
          border: `1px solid ${tooltip.accentColor}50`,
          borderLeft: `3px solid ${tooltip.accentColor}`,
          borderRadius: 7,
          padding: '8px 12px',
          fontSize: 11,
          fontFamily: "'DM Mono', monospace",
          color: '#e2e8f0',
          pointerEvents: 'none',
          zIndex: 200,
          lineHeight: 1.85,
          minWidth: 180,
          maxWidth: 230,
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
