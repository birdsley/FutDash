import { useMemo } from 'react'
import Plot from 'react-plotly.js'
import type { VaepPlayer } from '../../types'
import { CHART_LAYOUT, PLOTLY_CONFIG } from '../../lib/pitchLayout'

const ROLE_LABEL: Record<string, string> = {
  Finisher:    'Finisher',
  Progressor:  'Progressor',
  Carrier:     'Carrier',
  Presser:     'Presser',
  Defender:    'Defender',
  Contributor: 'Contributor',
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

  const labels = sorted.map(p => {
    const role = ROLE_LABEL[p.role] ?? p.role
    return `${p.short}  [${role}]`
  })
  const vals = sorted.map(p => p.vaep)

  const traces = useMemo(() => [
    {
      type: 'bar' as const,
      orientation: 'h' as const,
      x: vals,
      y: labels,
      marker: {
        color: vals.map((_, i) => {
          const opacity = Math.round(
            (0.5 + 0.45 * (i / Math.max(vals.length - 1, 1))) * 255
          ).toString(16).padStart(2, '0')
          return `${teamColor}${opacity}`
        }),
        line: { width: 0 },
      },
      text: vals.map(v => v.toFixed(3)),
      textposition: 'inside' as const,
      textfont: { color: '#e2e8f0', size: 10 },
      customdata: sorted.map(p => ({
        player: p.player,
        role: ROLE_LABEL[p.role] ?? p.role,
        vaep: p.vaep.toFixed(4),
        n: p.n_actions,
      })),
      hovertemplate:
        '<b>%{customdata.player}</b><br>' +
        'VAEP: %{customdata.vaep}<br>' +
        'Role: %{customdata.role}<br>' +
        'Actions: %{customdata.n}' +
        '<extra></extra>',
      name: 'VAEP',
    },
    // Team average dashed line
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
      title: { text: 'VAEP (delta xG contributed)', font: { size: 10 } },
    },
    yaxis: {
      ...CHART_LAYOUT.yaxis,
      autorange: 'reversed' as const,
      tickfont: { size: 10 },
    },
    margin: { t: 14, r: 80, b: 44, l: 130 },
    showlegend: false,
    title: {
      text: teamName,
      font: { size: 12, color: teamColor, family: "'Syne', sans-serif" },
      x: 0.5,
    },
    // Fix: readable hover text
    hoverlabel: {
      bgcolor: '#0f1117',
      bordercolor: '#4a5168',
      font: { color: '#e2e8f0', size: 12, family: "'DM Mono', monospace" },
    },
  }), [teamColor, teamName])

  if (!players.length) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: 'var(--muted)',
        fontFamily: "'DM Mono', monospace", fontSize: 11,
      }}>
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
