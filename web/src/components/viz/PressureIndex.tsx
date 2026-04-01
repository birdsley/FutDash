/**
 * PressureIndex.tsx
 * Standalone panel showing rolling final-third pressure for both teams.
 * Can be toggled on/off — when off, it renders nothing (parent hides the panel).
 */
import { useMemo } from 'react'
import Plot from 'react-plotly.js'
import type { XgFlow } from '../../types'
import { CHART_LAYOUT, PLOTLY_CONFIG } from '../../lib/pitchLayout'

interface PressureIndexProps {
  xgFlow: XgFlow
  home: string
  away: string
  homeColor: string
  awayColor: string
}

export function PressureIndex({ xgFlow, home, away, homeColor, awayColor }: PressureIndexProps) {
  const { minutes, pressure_home, pressure_away } = xgFlow

  const traces = useMemo(() => [
    {
      type: 'scatter' as const,
      mode: 'lines' as const,
      fill: 'tozeroy' as const,
      x: minutes,
      y: pressure_home,
      name: home,
      line: { color: homeColor, width: 2 },
      fillcolor: `${homeColor}20`,
      hovertemplate: `${home}<br>Min: %{x}'<br>Pressure: %{y:.2f}<extra></extra>`,
    },
    {
      type: 'scatter' as const,
      mode: 'lines' as const,
      fill: 'tozeroy' as const,
      x: minutes,
      y: pressure_away,
      name: away,
      line: { color: awayColor, width: 2 },
      fillcolor: `${awayColor}20`,
      hovertemplate: `${away}<br>Min: %{x}'<br>Pressure: %{y:.2f}<extra></extra>`,
    },
  ], [minutes, pressure_home, pressure_away, home, away, homeColor, awayColor])

  const layout = useMemo(() => ({
    ...CHART_LAYOUT,
    xaxis: {
      ...CHART_LAYOUT.xaxis,
      title: { text: 'Match Minute', font: { size: 10 } },
      range: [0, 92],
    },
    yaxis: {
      ...CHART_LAYOUT.yaxis,
      title: { text: 'Final-Third Pressure (normalised)', font: { size: 10 } },
      range: [0, 1.05],
    },
    legend: {
      ...CHART_LAYOUT.legend,
      x: 0.02, y: 0.98,
      xanchor: 'left' as const,
      yanchor: 'top' as const,
    },
    shapes: [
      {
        type: 'line' as const,
        x0: 45, x1: 45, y0: 0, y1: 1,
        line: { color: 'rgba(139,148,158,0.3)', width: 1, dash: 'dot' as const },
      },
    ],
    annotations: [
      { x: 45, y: 1.02, text: 'HT', font: { size: 9, color: '#6e7891' }, showarrow: false },
    ],
  }), [])

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
