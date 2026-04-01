import { useMemo } from 'react'
import Plot from 'react-plotly.js'
import type { XgFlow, Shot } from '../../types'
import { CHART_LAYOUT, PLOTLY_CONFIG } from '../../lib/pitchLayout'

interface XgFlowChartProps {
  xgFlow: XgFlow
  home: string
  away: string
  homeColor: string
  awayColor: string
  shots: Shot[]
}

export function XgFlowChart({ xgFlow, home, away, homeColor, awayColor, shots }: XgFlowChartProps) {
  const { minutes, home: cumH, away: cumA, pressure_home, pressure_away } = xgFlow

  const yMax = useMemo(() =>
    Math.max(...cumH, ...cumA, 0.1) * 1.18,
    [cumH, cumA]
  )

  const goalShots = useMemo(() =>
    shots.filter(s => s.goal && s.minute != null),
    [shots]
  )

  const traces = useMemo(() => [
    // Pressure index — home (very faint, drawn first)
    {
      type: 'scatter' as const,
      mode: 'none' as const,
      fill: 'tozeroy' as const,
      x: minutes,
      y: pressure_home.map(v => v * yMax),
      fillcolor: `${homeColor}0a`,
      line: { color: 'transparent' },
      hoverinfo: 'none' as const,
      showlegend: false,
      name: 'Pressure H',
    },
    // Pressure index — away
    {
      type: 'scatter' as const,
      mode: 'none' as const,
      fill: 'tozeroy' as const,
      x: minutes,
      y: pressure_away.map(v => v * yMax),
      fillcolor: `${awayColor}0a`,
      line: { color: 'transparent' },
      hoverinfo: 'none' as const,
      showlegend: false,
      name: 'Pressure A',
    },
    // Home cumulative xG
    {
      type: 'scatter' as const,
      mode: 'lines' as const,
      fill: 'tozeroy' as const,
      x: minutes,
      y: cumH,
      name: home,
      line: { color: homeColor, width: 2.5 },
      fillcolor: `${homeColor}10`,
      hovertemplate: `${home}<br>Min: %{x}'<br>xG: %{y:.3f}<extra></extra>`,
    },
    // Away cumulative xG
    {
      type: 'scatter' as const,
      mode: 'lines' as const,
      fill: 'tozeroy' as const,
      x: minutes,
      y: cumA,
      name: away,
      line: { color: awayColor, width: 2.5 },
      fillcolor: `${awayColor}10`,
      hovertemplate: `${away}<br>Min: %{x}'<br>xG: %{y:.3f}<extra></extra>`,
    },
  ], [minutes, cumH, cumA, pressure_home, pressure_away, home, away, homeColor, awayColor, yMax])

  const layout = useMemo(() => ({
    ...CHART_LAYOUT,
    shapes: [
      // HT shaded band
      { type: 'rect' as const, x0: 44, x1: 46, y0: 0, y1: yMax, fillcolor: 'rgba(139,148,158,0.06)', line: { width: 0 } },
      { type: 'line' as const, x0: 45, x1: 45, y0: 0, y1: yMax, line: { color: 'rgba(139,148,158,0.3)', width: 1, dash: 'dot' as const } },
      // Goal lines
      ...goalShots.map(s => ({
        type: 'line' as const,
        x0: s.minute!, x1: s.minute!, y0: 0, y1: yMax,
        line: { color: s.team === 'home' ? homeColor : awayColor, width: 1.5, dash: 'dash' as const },
      })),
    ],
    annotations: [
      { x: 45, y: yMax * 0.93, text: 'HT', font: { size: 9, color: '#6e7891' }, showarrow: false },
      { x: 92, y: cumH[91] ?? 0, text: (cumH[91] ?? 0).toFixed(2), font: { size: 10, color: homeColor }, showarrow: false, xanchor: 'left' as const },
      { x: 92, y: cumA[91] ?? 0, text: (cumA[91] ?? 0).toFixed(2), font: { size: 10, color: awayColor }, showarrow: false, xanchor: 'left' as const },
    ],
    xaxis: { ...CHART_LAYOUT.xaxis, title: { text: 'Match Minute', font: { size: 10 } }, range: [0, 95] },
    yaxis: { ...CHART_LAYOUT.yaxis, title: { text: 'Cumulative xG', font: { size: 10 } } },
    legend: { ...CHART_LAYOUT.legend, x: 0.02, y: 0.98, xanchor: 'left' as const, yanchor: 'top' as const },
  }), [cumH, cumA, yMax, goalShots, homeColor, awayColor])

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
