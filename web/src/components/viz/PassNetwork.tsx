/**
 * PassNetwork.tsx — Pure SVG implementation
 *
 * Why SVG instead of Plotly:
 *   Plotly.js initialises asynchronously and measures the DOM container AFTER
 *   React has mounted. When the container's computed height hasn't settled yet
 *   (common in flex/grid layouts) Plotly creates a 0×0 SVG — hover data still
 *   works because the trace coordinates are stored in memory, but nothing is
 *   visually drawn.  Replicating every fix attempt (explicit px heights,
 *   useResizeHandler, layout.height, etc.) still leaves this race condition.
 *
 *   Pure SVG renders synchronously in the same paint cycle as React — no
 *   initialisation delay, no timing race, guaranteed visible output.
 */

import { useMemo, useState, useCallback } from 'react'
import type { Network } from '../../types'

interface PassNetworkProps {
  network: Network
  teamColor: string
  teamName: string
}

// ── Pitch lines (StatsBomb 120×80 coordinate space) ──────────────
function SvgPitch() {
  const lc = 'rgba(201,209,217,0.55)'
  const sw = 0.55
  return (
    <g>
      {/* Background fill */}
      <rect x={0} y={0} width={120} height={80} fill="#1c3a28" />
      {/* Outer boundary */}
      <rect x={0} y={0} width={120} height={80} fill="none" stroke={lc} strokeWidth={sw} />
      {/* Half-way line */}
      <line x1={60} y1={0} x2={60} y2={80} stroke={lc} strokeWidth={sw} />
      {/* Centre circle */}
      <circle cx={60} cy={40} r={10} fill="none" stroke={lc} strokeWidth={sw} />
      {/* Centre spot */}
      <circle cx={60} cy={40} r={0.55} fill={lc} />
      {/* Left penalty area */}
      <rect x={0} y={18} width={18} height={44} fill="none" stroke={lc} strokeWidth={sw} />
      {/* Right penalty area */}
      <rect x={102} y={18} width={18} height={44} fill="none" stroke={lc} strokeWidth={sw} />
      {/* Left 6-yard box */}
      <rect x={0} y={30} width={6} height={20} fill="none" stroke={lc} strokeWidth={sw} />
      {/* Right 6-yard box */}
      <rect x={114} y={30} width={6} height={20} fill="none" stroke={lc} strokeWidth={sw} />
      {/* Penalty spots */}
      <circle cx={12} cy={40} r={0.5} fill={lc} />
      <circle cx={108} cy={40} r={0.5} fill={lc} />
      {/* Goals */}
      <rect x={-2} y={36} width={2} height={8} fill="none" stroke={lc} strokeWidth={sw} />
      <rect x={120} y={36} width={2} height={8} fill="none" stroke={lc} strokeWidth={sw} />
    </g>
  )
}

// ── Tooltip ───────────────────────────────────────────────────────
interface TooltipState {
  screenX: number
  screenY: number
  lines: string[]
}

function Tooltip({ tip }: { tip: TooltipState }) {
  return (
    <div
      style={{
        position: 'fixed',
        left: tip.screenX + 14,
        top: tip.screenY - 28,
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
        maxWidth: 200,
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
      }}
    >
      {tip.lines.map((line, i) => (
        <div key={i} style={{ fontWeight: i === 0 ? 700 : 400, color: i === 0 ? '#fff' : '#a0aab8' }}>
          {line}
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────
export function PassNetwork({ network, teamColor, teamName }: PassNetworkProps) {
  const { nodes, edges } = network
  const [highlightedNode, setHighlightedNode] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const maxWeight = useMemo(
    () => Math.max(...edges.map(e => e.weight), 1),
    [edges]
  )

  // pre-compute a position map for O(1) edge lookup
  const posMap = useMemo(() => {
    const m: Record<string, { x: number; y: number }> = {}
    nodes.forEach(n => { m[n.id] = { x: n.x, y: n.y } })
    return m
  }, [nodes])

  const handleNodeClick = useCallback((id: string) => {
    setHighlightedNode(prev => (prev === id ? null : id))
  }, [])

  const handleNodeEnter = useCallback((e: React.MouseEvent, node: (typeof nodes)[0]) => {
    setTooltip({
      screenX: e.clientX,
      screenY: e.clientY,
      lines: [
        node.id,
        `Betweenness: ${typeof node.betweenness === 'number' ? node.betweenness.toFixed(3) : '—'}`,
        `Influence:   ${typeof node.eigenvector === 'number' ? node.eigenvector.toFixed(3) : '—'}`,
      ],
    })
  }, [])

  const handleNodeMove = useCallback((e: React.MouseEvent) => {
    setTooltip(t => (t ? { ...t, screenX: e.clientX, screenY: e.clientY } : null))
  }, [])

  const handleNodeLeave = useCallback(() => setTooltip(null), [])

  if (!nodes.length) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--muted)',
          fontFamily: "'DM Mono', monospace",
          fontSize: 11,
        }}
      >
        No pass network data available
      </div>
    )
  }

  const playmaker = nodes.filter(n => n.is_playmaker)[0]

  return (
    // Outer div fills whatever height the parent gives it (340px from pitchContainer)
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg
        // viewBox slightly wider than pitch so goals don't clip
        viewBox="-4 -4 128 88"
        // These two lines make SVG fill the div while keeping aspect ratio
        style={{ width: '100%', height: '100%', display: 'block' }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* ── Pitch ── */}
        <SvgPitch />

        {/* ── Edges / pass lines ── */}
        {edges.map((e, i) => {
          const src = posMap[e.source]
          const tgt = posMap[e.target]
          if (!src || !tgt) return null

          const isHighlighted =
            !highlightedNode ||
            e.source === highlightedNode ||
            e.target === highlightedNode

          const weight01 = e.weight / maxWeight
          const alpha = isHighlighted ? 0.18 + 0.65 * weight01 : 0.04
          const sw = 0.25 + 1.5 * weight01

          const color =
            e.direction === 'forward'
              ? teamColor
              : e.direction === 'backward'
              ? '#484f58'
              : '#2dd4bf'

          return (
            <line
              key={`e-${i}`}
              x1={src.x}
              y1={src.y}
              x2={tgt.x}
              y2={tgt.y}
              stroke={color}
              strokeWidth={sw}
              strokeOpacity={alpha}
              strokeLinecap="round"
            />
          )
        })}

        {/* ── Glow rings (drawn before nodes so nodes render on top) ── */}
        {nodes.map(n => {
          const r = Math.max(Math.sqrt(Math.max(n.size, 55)) * 0.19, 2.2)
          return (
            <circle
              key={`glow-${n.id}`}
              cx={n.x}
              cy={n.y}
              r={r + 1.1}
              fill="none"
              stroke="rgba(255,255,255,0.18)"
              strokeWidth={2}
            />
          )
        })}

        {/* ── Nodes ── */}
        {nodes.map(n => {
          const r = Math.max(Math.sqrt(Math.max(n.size, 55)) * 0.19, 2.2)
          const fill = n.is_playmaker ? '#fbbf24' : teamColor
          const stroke =
            n.is_playmaker
              ? '#fbbf24'
              : highlightedNode === n.id
              ? '#ffffff'
              : 'rgba(255,255,255,0.75)'
          const sw = n.is_playmaker ? 0.7 : 0.5
          const label =
            n.short ||
            (n.id ? n.id.split(' ').pop()?.slice(0, 12) : '') ||
            ''

          return (
            <g
              key={`n-${n.id}`}
              style={{ cursor: 'pointer' }}
              onClick={() => handleNodeClick(n.id)}
              onMouseEnter={ev => handleNodeEnter(ev, n)}
              onMouseMove={handleNodeMove}
              onMouseLeave={handleNodeLeave}
            >
              <circle
                cx={n.x}
                cy={n.y}
                r={r}
                fill={fill}
                stroke={stroke}
                strokeWidth={sw}
                opacity={0.95}
              />
              {/* Player name label above node */}
              <text
                x={n.x}
                y={n.y - r - 0.9}
                textAnchor="middle"
                fontSize={2.4}
                fill="#e6edf3"
                fontFamily="DM Mono, monospace"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {label}
              </text>
            </g>
          )
        })}

        {/* ── Playmaker annotation ── */}
        {playmaker && (() => {
          const pm = playmaker
          const label = `★ ${pm.short || pm.id.split(' ').pop() || ''}`
          const bx = Math.min(pm.x + 2, 110)
          const by = Math.min(pm.y + 4, 76)
          const textW = label.length * 1.65 + 2
          return (
            <g key="playmaker-label">
              <rect
                x={bx}
                y={by}
                width={textW}
                height={3.8}
                rx={0.4}
                fill="rgba(22,29,39,0.88)"
                stroke="rgba(251,191,36,0.4)"
                strokeWidth={0.25}
              />
              <text
                x={bx + 1}
                y={by + 2.7}
                fontSize={2.1}
                fill="#fbbf24"
                fontFamily="DM Mono, monospace"
                style={{ pointerEvents: 'none' }}
              >
                {label}
              </text>
            </g>
          )
        })()}
      </svg>

      {/* ── Tooltip (rendered outside SVG so it can overflow the container) ── */}
      {tooltip && <Tooltip tip={tooltip} />}
    </div>
  )
}
