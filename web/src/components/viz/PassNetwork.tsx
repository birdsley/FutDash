import { useMemo, useState } from 'react'
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

  const edgeTraces = useMemo(() => edges.map(e => {
    const src = nodes.find(n => n.id === e.source)
    const tgt = nodes.find(n => n.id === e.target)
    if (!src || !tgt) return null

    const isHighlighted = !highlightedNode ||
      e.source === highlightedNode ||
      e.target === highlightedNode

    const baseAlpha = 0.15 + 0.55 * (e.weight / maxWeight)
    const alpha = isHighlighted ? baseAlpha : baseAlpha * 0.12

    const edgeColor =
      e.direction === 'forward'  ? teamColor :
      e.direction === 'backward' ? '#484f58' :
      '#2dd4bf'

    return {
      type: 'scatter' as const,
      mode: 'lines' as const,
      x: [src.x, tgt.x],
      y: [src.y, tgt.y],
      line: {
        color: edgeColor,
        width: 0.8 + 3.5 * (e.weight / maxWeight),
      },
      opacity: alpha,
      hoverinfo: 'none' as const,
      showlegend: false,
    }
  }).filter(Boolean), [edges, nodes, maxWeight, highlightedNode, teamColor])

  // White glow ring behind each node for dark-background visibility
  const glowTrace = useMemo(() => ({
    type: 'scatter' as const,
    mode: 'markers' as const,
    x: nodes.map(n => n.x),
    y: nodes.map(n => n.y),
    marker: {
      size: nodes.map(n => Math.max(Math.sqrt(Math.max(n.size, 55)) * 0.9, 8)),
      color: 'rgba(255,255,255,0)',
      line: { color: 'rgba(255,255,255,0.18)', width: 7 },
    },
    hoverinfo: 'none' as const,
    showlegend: false,
  }), [nodes])

  const nodeTrace = useMemo(() => ({
    type: 'scatter' as const,
    mode: 'markers+text' as const,
    x: nodes.map(n => n.x),
    y: nodes.map(n => n.y),
    marker: {
      size: nodes.map(n => Math.sqrt(Math.max(n.size, 55)) * 0.9),
      color: nodes.map(n => n.is_playmaker ? '#fbbf24' : teamColor),
      line: {
        color: nodes.map(n =>
          n.is_playmaker ? '#fbbf24' :
          highlightedNode === n.id ? '#ffffff' :
          'rgba(255,255,255,0.70)'
        ),
        width: nodes.map(n => n.is_playmaker ? 2.5 : 1.6),
      },
      opacity: 0.92,
    },
    text: nodes.map(n => n.short),
    textposition: 'top center' as const,
    textfont: { size: 9, color: '#e6edf3', family: "'DM Mono', monospace" },
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
  }), [nodes, teamColor, highlightedNode])

  const layout = useMemo(() => ({
    ...pitchLayout(),
    annotations: nodes
      .filter(n => n.is_playmaker)
      .slice(0, 1)
      .map(n => ({
        x: n.x,
        y: Math.min(n.y + 7, 76),
        xref: 'x' as const,
        yref: 'y' as const,
        text: `Playmaker: ${n.short}`,
        font: { color: '#fbbf24', size: 8, family: "'DM Mono', monospace" },
        showarrow: false,
        bgcolor: 'rgba(22,29,39,0.88)',
        bordercolor: 'rgba(251,191,36,0.35)',
        borderwidth: 0.8,
        borderpad: 3,
      })),
    // Fix: white text in hover tooltip
    hoverlabel: {
      bgcolor: '#0f1117',
      bordercolor: '#4a5168',
      font: { color: '#e2e8f0', size: 11, family: "'DM Mono', monospace" },
    },
  }), [nodes, teamName, teamColor])

  const handleClick = (data: any) => {
    if (!data?.points?.length) return
    const traceIdx = data.points[0].curveNumber
    const edgeCount = edgeTraces.length
    // Glow = edgeCount, Nodes = edgeCount+1
    if (traceIdx < edgeCount) return
    const idx = data.points[0].pointIndex
    const clicked = nodes[idx]?.id
    setHighlightedNode(prev => prev === clicked ? null : clicked)
  }

  if (!nodes.length) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: 'var(--muted)',
        fontFamily: "'DM Mono', monospace", fontSize: 11,
      }}>
        No pass network data
      </div>
    )
  }

  return (
    <Plot
      data={[...edgeTraces as any[], glowTrace, nodeTrace]}
      layout={layout as any}
      config={PLOTLY_CONFIG}
      style={{ width: '100%', height: '100%' }}
      onClick={handleClick}
      useResizeHandler
    />
  )
}
