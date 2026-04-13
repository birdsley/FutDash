import { useMemo } from 'react'
import Plot from 'react-plotly.js'
import type { XgFlow, Shot, MatchMeta } from '../../types'
import { CHART_LAYOUT, PLOTLY_CONFIG } from '../../lib/pitchLayout'

interface XgFlowChartProps {
  xgFlow: XgFlow
  home: string
  away: string
  homeColor: string
  awayColor: string
  shots: Shot[]
  meta?: MatchMeta  // Optional meta for extra time info
}

export function XgFlowChart({ xgFlow, home, away, homeColor, awayColor, shots, meta }: XgFlowChartProps) {
  const { minutes, home: cumH, away: cumA, pressure_home, pressure_away } = xgFlow

  // Determine max minute - use meta.max_minute if available, otherwise infer from data
  const maxMinute = useMemo(() => {
    if (meta?.max_minute && meta.max_minute > 90) {
      return meta.max_minute
    }
    // Check if there's data beyond 90 minutes
    const dataMaxMinute = Math.max(
      ...shots.filter(s => s.minute != null).map(s => s.minute!),
      minutes.length - 1
    )
    // If shots went past 90, extend the chart
    if (dataMaxMinute > 92) {
      return Math.min(Math.ceil(dataMaxMinute / 5) * 5 + 5, 130) // Round up, cap at 130
    }
    return 92
  }, [meta, shots, minutes])

  // Check if extra time
  const hasExtraTime = maxMinute > 95

  const yMax = useMemo(() =>
    Math.max(...cumH, ...cumA, 0.1) * 1.18,
    [cumH, cumA]
  )

  const goalShots = useMemo(() =>
    shots.filter(s => s.goal && s.minute != null),
    [shots]
  )

  const traces = useMemo(() => [
    // Pressure index — home (very faint background area)
    {
      type: 'scatter' as const,
      mode: 'none' as const,
      fill: 'tozeroy' as const,
      x: minutes.slice(0, maxMinute),
      y: pressure_home.slice(0, maxMinute).map(v => v * yMax),
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
      x: minutes.slice(0, maxMinute),
      y: pressure_away.slice(0, maxMinute).map(v => v * yMax),
      fillcolor: `${awayColor}0a`,
      line: { color: 'transparent' },
      hoverinfo: 'none' as const,
      showlegend: false,
      name: 'Pressure A',
    },
    // Home cumulative xG — step chart so each shot shows as a step up
    {
      type: 'scatter' as const,
      mode: 'lines' as const,
      fill: 'tozeroy' as const,
      x: minutes.slice(0, maxMinute),
      y: cumH.slice(0, maxMinute),
      name: home,
      line: {
        color: homeColor,
        width: 2.5,
        shape: 'hv' as const,  // horizontal-then-vertical step: flat until shot, then jump
      },
      fillcolor: `${homeColor}12`,
      hovertemplate: `<b>${home}</b><br>Minute: %{x}'<br>Cumulative xG: %{y:.3f}<extra></extra>`,
    },
    // Away cumulative xG — step chart
    {
      type: 'scatter' as const,
      mode: 'lines' as const,
      fill: 'tozeroy' as const,
      x: minutes.slice(0, maxMinute),
      y: cumA.slice(0, maxMinute),
      name: away,
      line: {
        color: awayColor,
        width: 2.5,
        shape: 'hv' as const,
      },
      fillcolor: `${awayColor}12`,
      hovertemplate: `<b>${away}</b><br>Minute: %{x}'<br>Cumulative xG: %{y:.3f}<extra></extra>`,
    },
  ], [minutes, cumH, cumA, pressure_home, pressure_away, home, away, homeColor, awayColor, yMax, maxMinute])

  // Build shapes for HT, FT, and ET markers
  const shapes = useMemo(() => {
    const result: any[] = [
      // Half-time band
      {
        type: 'rect' as const,
        x0: 44, x1: 46, y0: 0, y1: yMax,
        fillcolor: 'rgba(139,148,158,0.06)',
        line: { width: 0 },
      },
      {
        type: 'line' as const,
        x0: 45, x1: 45, y0: 0, y1: yMax,
        line: { color: 'rgba(139,148,158,0.30)', width: 1, dash: 'dot' as const },
      },
    ]

    // Add FT marker if extra time
    if (hasExtraTime) {
      result.push(
        {
          type: 'rect' as const,
          x0: 89, x1: 91, y0: 0, y1: yMax,
          fillcolor: 'rgba(139,148,158,0.06)',
          line: { width: 0 },
        },
        {
          type: 'line' as const,
          x0: 90, x1: 90, y0: 0, y1: yMax,
          line: { color: 'rgba(139,148,158,0.30)', width: 1, dash: 'dot' as const },
        }
      )
      // ET half-time at 105'
      if (maxMinute > 105) {
        result.push({
          type: 'line' as const,
          x0: 105, x1: 105, y0: 0, y1: yMax,
          line: { color: 'rgba(139,148,158,0.20)', width: 1, dash: 'dot' as const },
        })
      }
    }

    // Goal marker lines
    goalShots.forEach(s => {
      result.push({
        type: 'line' as const,
        x0: s.minute!, x1: s.minute!, y0: 0, y1: yMax,
        line: {
          color: s.team === 'home' ? homeColor : awayColor,
          width: 1.5,
          dash: 'dash' as const,
        },
      })
    })

    return result
  }, [yMax, goalShots, homeColor, awayColor, hasExtraTime, maxMinute])

  // Annotations
  const annotations = useMemo(() => {
    const result: any[] = [
      { x: 45, y: yMax * 0.94, text: 'HT', font: { size: 9, color: '#6e7891' }, showarrow: false },
    ]

    // Final xG labels at the end of the chart
    const endMinute = Math.min(maxMinute - 1, cumH.length - 1)
    result.push(
      {
        x: maxMinute + 1,
        y: cumH[endMinute] ?? 0,
        text: (cumH[endMinute] ?? 0).toFixed(2),
        font: { size: 10, color: homeColor },
        showarrow: false,
        xanchor: 'left' as const,
      },
      {
        x: maxMinute + 1,
        y: cumA[endMinute] ?? 0,
        text: (cumA[endMinute] ?? 0).toFixed(2),
        font: { size: 10, color: awayColor },
        showarrow: false,
        xanchor: 'left' as const,
      }
    )

    // Extra time markers
    if (hasExtraTime) {
      result.push(
        { x: 90, y: yMax * 0.94, text: 'FT', font: { size: 9, color: '#6e7891' }, showarrow: false }
      )
      if (maxMinute > 105) {
        result.push(
          { x: 105, y: yMax * 0.94, text: 'ET HT', font: { size: 8, color: '#6e7891' }, showarrow: false }
        )
      }
    }

    return result
  }, [cumH, cumA, yMax, homeColor, awayColor, hasExtraTime, maxMinute])

  const layout = useMemo(() => ({
    ...CHART_LAYOUT,
    shapes,
    annotations,
    xaxis: {
      ...CHART_LAYOUT.xaxis,
      title: { text: hasExtraTime ? 'Match Minute (incl. Extra Time)' : 'Match Minute', font: { size: 10 } },
      range: [0, maxMinute + 3],
      tickvals: hasExtraTime 
        ? [0, 15, 30, 45, 60, 75, 90, 105, 120]
        : [0, 15, 30, 45, 60, 75, 90],
    },
    yaxis: {
      ...CHART_LAYOUT.yaxis,
      title: { text: 'Cumulative xG', font: { size: 10 } },
    },
    legend: {
      ...CHART_LAYOUT.legend,
      x: 0.02, y: 0.98,
      xanchor: 'left' as const,
      yanchor: 'top' as const,
    },
    // Fix: readable hover text
    hoverlabel: {
      bgcolor: '#0f1117',
      bordercolor: '#4a5168',
      font: { color: '#e2e8f0', size: 12, family: "'DM Mono', monospace" },
    },
  }), [shapes, annotations, hasExtraTime, maxMinute])

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
