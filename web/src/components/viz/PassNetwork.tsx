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
    const alpha     = isHighlighted ? baseAlpha : baseAlpha * 0.15

    const edgeColor = e.direction === 'forward'  ? teamColor  :
                      e.direction === 'backward' ? '#484f58'  :
                      '#3fb950'

    return {
      type: 'scatter' as const,
      mode: 'lines' as const,
      x: [src.x, tgt.x, null],
      y: [src.y, tgt.y, null],
      line: { color: edgeColor, width: 0.8 + 3.2 * (e.weight / maxWeight) },
      opacity: alpha,
      hoverinfo: 'none' as const,
      showlegend: false,
    }
  }).filter(Boolean), [edges, nodes, maxWeight, highlightedNode, teamColor])

  // White glow rings behind nodes
  const glowTrace = useMemo(() => ({
    type: 'scatter' as const,
    mode: 'markers' as const,
    x: nodes.map(n => n.x),
    y: nodes.map(n => n.y),
    marker: {
      size: nodes.map(n => Math.sqrt(n.size) * 0.85 + 5),
      color: 'rgba(255,255,255,0)',
      line: { color: 'rgba(255,255,255,0.12)', width: 6 },
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
      size: nodes.map(n => Math.sqrt(n.size) * 0.85),
      color: nodes.map(n =>
        n.is_playmaker ? '#fbbf24' : teamColor
      ),
      line: {
        color: nodes.map(n =>
          n.is_playmaker ? '#fbbf24' :
          highlightedNode === n.id ? '#fff' :
          'rgba(255,255,255,0.65)'
        ),
        width: nodes.map(n => n.is_playmaker ? 2.5 : 1.5),
      },
      opacity: 0.92,
    },
    text: nodes.map(n => n.short),
    textposition: 'top center' as const,
    textfont: { size: 9, color: '#e2e8f0', family: "'DM Mono', monospace" },
    customdata: nodes.map(n => ({
      id: n.id,
      betweenness: n.betweenness,
      eigenvector: n.eigenvector,
    })),
    hovertemplate:
      '<b>%{customdata.id}</b><br>' +
      'Betweenness: %{customdata.betweenness:.3f}<br>' +
      'Influence: %{customdata.eigenvector:.3f}<extra></extra>',
    showlegend: false,
  }), [nodes, teamColor, highlightedNode])

  const layout = useMemo(() => ({
    ...pitchLayout(),
    annotations: nodes
      .filter(n => n.is_playmaker)
      .slice(0, 1)
      .map(n => ({
        x: n.x,
        y: n.y + 6,
        xref: 'x' as const,
        yref: 'y' as const,
        text: `★ ${n.short}`,
        font: { color: '#fbbf24', size: 8, family: "'DM Mono', monospace" },
        showarrow: false,
        bgcolor: 'rgba(22,29,39,0.85)',
        bordercolor: '#fbbf2455',
        borderwidth: 0.5,
        borderpad: 2,
      })),
    title: {
      text: teamName,
      font: { size: 12, color: teamColor, family: "'Syne', sans-serif" },
      x: 0.5,
    },
  }), [nodes, teamName, teamColor])

  const handleClick = (data: any) => {
    if (!data?.points?.length) return
    const idx = data.points[0].pointIndex
    const clicked = nodes[idx]?.id
    setHighlightedNode(prev => prev === clicked ? null : clicked)
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
