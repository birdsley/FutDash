import { useMemo } from 'react'
import Plot from 'react-plotly.js'
import type { VaepPlayer } from '../../types'
import { CHART_LAYOUT, PLOTLY_CONFIG } from '../../lib/pitchLayout'

const ROLE_BADGE: Record<string, string> = {
  Finisher:    '🎯',
  Progressor:  '↑',
  Carrier:     '⚡',
  Presser:     '⚔',
  Defender:    '🛡',
  Contributor: '·',
}

interface VaepBarsProps {
  players: VaepPlayer[]
  teamColor: string
  teamName: string
}

export function VaepBars({ players, teamColor, teamName }: VaepBarsProps) {
  const sorted = useMemo(() =>
    [...players].sort((a, b) => a.vaep - b.vaep),
    [players]
  )

  const avg = sorted.length
    ? sorted.reduce((s, p) => s + p.vaep, 0) / sorted.length
    : 0

  const labels = sorted.map(p =>
    `${ROLE_BADGE[p.role] ?? '·'} ${p.short}`
  )
  const vals = sorted.map(p => p.vaep)

  const traces = useMemo(() => [
    {
      type: 'bar' as const,
      orientation: 'h' as const,
      x: vals,
      y: labels,
      marker: {
        color: vals.map((_, i) => {
          const opacity = Math.round((0.5 + 0.45 * (i / Math.max(vals.length - 1, 1))) * 255)
            .toString(16).padStart(2, '0')
          return `${teamColor}${opacity}`
        }),
        line: { width: 0 },
      },
      text: vals.map(v => v.toFixed(3)),
      textposition: 'inside' as const,
      textfont: { color: 'white', size: 10 },
      customdata: sorted.map(p => [p.role, p.n_actions]),
      hovertemplate:
        '<b>%{y}</b><br>' +
        'VAEP: %{x:.4f}<br>' +
        'Role: %{customdata[0]}<br>' +
        'Actions: %{customdata[1]}<extra></extra>',
      name: 'VAEP',
    },
    // Team average line
    {
      type: 'scatter' as const,
      mode: 'lines' as const,
      x: [avg, avg],
      y: [labels[0], labels[labels.length - 1]],
      line: { color: 'rgba(255,255,255,0.28)', width: 1.5, dash: 'dash' as const },
      hovertemplate: `Team avg: ${avg.toFixed(3)}<extra></extra>`,
      showlegend: false,
      name: 'Average',
    },
  ], [vals, labels, sorted, teamColor, avg])

  const layout = useMemo(() => ({
    ...CHART_LAYOUT,
    xaxis: {
      ...CHART_LAYOUT.xaxis,
      title: { text: 'VAEP (ΔxG contributed)', font: { size: 10 } },
    },
    yaxis: {
      ...CHART_LAYOUT.yaxis,
      autorange: 'reversed' as const,
      tickfont: { size: 10 },
    },
    margin: { t: 14, r: 80, b: 44, l: 90 },
    showlegend: false,
    title: {
      text: teamName,
      font: { size: 12, color: teamColor, family: "'Syne', sans-serif" },
      x: 0.5,
    },
  }), [teamColor, teamName])

  if (!players.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)', fontFamily: "'DM Mono', monospace", fontSize: 11 }}>
        No VAEP data
      </div>
    )
  }

  return (
    <Plot
      data={traces}
      layout={layout as any}
      config={PLOTLY_CONFIG}
      style={{ width: '100%', height: '100%' }}
      useResizeHandler
    />
  )
}
