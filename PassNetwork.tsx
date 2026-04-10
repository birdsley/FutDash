import { useMemo, useState, useCallback } from 'react'
import Plot from 'react-plotly.js'
import type { Network } from '../../types'
import { pitchLayout, PLOTLY_CONFIG } from '../../lib/pitchLayout'

interface PassNetworkProps {
  network: Network
  teamColor: string
  teamName: string
}

export function PassNetwork({ network, teamColor, teamName }: PassNetworkProps) {
  const { nodes, edges } = network
  const [highlightedNode, setHighlightedNode] = useState<string | null>(null)

  const maxWeight = useMemo(() =>
    Math.max(...edges.map(e => e.weight), 1),
    [edges]
  )

  // Build a map from node id → position for edge drawing
  const posMap = useMemo(() => {
    const m: Record<string, { x: number; y: number }> = {}
    nodes.forEach(n => { m[n.id] = { x: n.x, y: n.y } })
    return m
  }, [nodes])

  // One trace per edge (needed for individual opacity/width)
  const edgeTraces = useMemo(() => {
    return edges.map(e => {
      const src = posMap[e.source]
      const tgt = posMap[e.target]
      if (!src || !tgt) return null

      const isHighlighted = !highlightedNode ||
        e.source === highlightedNode ||
        e.target === highlightedNode

      const baseAlpha = 0.18 + 0.60 * (e.weight / maxWeight)
      const alpha = isHighlighted ? baseAlpha : 0.05

      const edgeColor =
        e.direction === 'forward'  ? teamColor :
        e.direction === 'backward' ? '#484f58' :
        '#2dd4bf'

      return {
        type: 'scatter' as const,
        mode: 'lines' as const,
        x: [src.x, tgt.x, null as any],
        y: [src.y, tgt.y, null as any],
        line: {
          color: edgeColor,
          width: 0.8 + 3.5 * (e.weight / maxWeight),
        },
        opacity: alpha,
        hoverinfo: 'none' as const,
        showlegend: false,
      }
    }).filter(Boolean)
  }, [edges, posMap, maxWeight, highlightedNode, teamColor])

  // White glow ring trace (one point per node) — drawn behind nodes for visibility
  const glowTrace = useMemo(() => ({
    type: 'scatter' as const,
    mode: 'markers' as const,
    x: nodes.map(n => n.x),
    y: nodes.map(n => n.y),
    marker: {
      size: nodes.map(n => {
        const s = typeof n.size === 'number' && n.size > 0 ? n.size : 100
        return Math.max(Math.sqrt(s) * 1.15 + 5, 16)
      }),
      color: 'rgba(0,0,0,0)',
      line: { color: 'rgba(255,255,255,0.22)', width: 9 },
    },
    hoverinfo: 'none' as const,
    showlegend: false,
    name: '__glow__',
  }), [nodes])

  // Main node trace — visible filled circles with team color
  const nodeTrace = useMemo(() => ({
    type: 'scatter' as const,
    mode: 'markers+text' as const,
    x: nodes.map(n => n.x),
    y: nodes.map(n => n.y),
    marker: {
      size: nodes.map(n => {
        const s = typeof n.size === 'number' && n.size > 0 ? n.size : 100
        return Math.max(Math.sqrt(s) * 1.0, 12)
      }),
      // CRITICAL FIX: use explicit hex color string, not variable.
      // Plotly requires a concrete color value in the data, not a reference.
      color: nodes.map(n =>
        n.is_playmaker ? '#fbbf24' : teamColor
      ),
      line: {
        color: nodes.map(n =>
          n.is_playmaker ? '#fbbf24' :
          highlightedNode === n.id ? '#ffffff' :
          'rgba(255,255,255,0.80)'
        ),
        width: nodes.map(n => n.is_playmaker ? 2.5 : 1.8),
      },
      opacity: 0.95,
    },
    text: nodes.map(n => n.short || (n.id ? n.id.split(' ').pop()?.slice(0, 11) : '')),
    textposition: 'top center' as const,
    textfont: {
      size: 9,
      color: '#e6edf3',
      family: "'DM Mono', monospace",
    },
    customdata: nodes.map(n => ({
      id: n.id,
      betweenness: typeof n.betweenness === 'number' ? n.betweenness.toFixed(3) : '—',
      eigenvector: typeof n.eigenvector === 'number' ? n.eigenvector.toFixed(3) : '—',
    })),
    hovertemplate:
      '<b>%{customdata.id}</b><br>' +
      'Betweenness: %{customdata.betweenness}<br>' +
      'Influence: %{customdata.eigenvector}' +
      '<extra></extra>',
    showlegend: false,
    name: '__nodes__',
  }), [nodes, teamColor, highlightedNode])

  const playmasters = useMemo(() =>
    nodes.filter(n => n.is_playmaker).slice(0, 1),
    [nodes]
  )

  const layout = useMemo(() => ({
    ...pitchLayout(),
    // CRITICAL FIX: do NOT set autosize:false — let Plotly respond to container.
    // The container now has an explicit pixel height so Plotly will measure it correctly.
    annotations: playmasters.map(n => ({
      x: n.x,
      y: Math.min(n.y + 8, 76),
      xref: 'x' as const,
      yref: 'y' as const,
      text: `★ ${n.short || n.id.split(' ').pop()}`,
      font: { color: '#fbbf24', size: 8, family: "'DM Mono', monospace" },
      showarrow: false,
      bgcolor: 'rgba(22,29,39,0.88)',
      bordercolor: 'rgba(251,191,36,0.4)',
      borderwidth: 0.8,
      borderpad: 3,
    })),
    hoverlabel: {
      bgcolor: '#0f1117',
      bordercolor: '#4a5168',
      font: { color: '#e2e8f0', size: 11, family: "'DM Mono', monospace" },
    },
  }), [playmasters])

  const handleClick = useCallback((data: any) => {
    if (!data?.points?.length) return
    const pt = data.points[0]
    const totalTraces = edgeTraces.length + 2 // edges + glow + nodes
    if (pt.curveNumber !== totalTraces - 1) return
    const idx = pt.pointIndex
    const clicked = nodes[idx]?.id
    if (!clicked) return
    setHighlightedNode(prev => prev === clicked ? null : clicked)
  }, [edgeTraces.length, nodes])

  if (!nodes.length) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: 'var(--muted)',
        fontFamily: "'DM Mono', monospace", fontSize: 11,
      }}>
        No pass network data available
      </div>
    )
  }

  return (
    // CRITICAL FIX: fill 100% of parent — parent now has explicit 340px height
    <div style={{ width: '100%', height: '100%' }}>
      <Plot
        data={[...(edgeTraces as any[]), glowTrace, nodeTrace]}
        layout={layout as any}
        config={PLOTLY_CONFIG}
        // CRITICAL FIX: style must use 100% to fill the explicit-height parent
        style={{ width: '100%', height: '100%' }}
        onClick={handleClick}
        useResizeHandler
      />
    </div>
  )
}
