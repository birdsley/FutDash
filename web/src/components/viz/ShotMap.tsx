import { useMemo } from 'react'
import Plot from 'react-plotly.js'
import type { Shot } from '../../types'
import { pitchLayout, PLOTLY_CONFIG } from '../../lib/pitchLayout'

interface ShotMapProps {
  shots: Shot[]
  home: string
  away: string
  homeColor: string
  awayColor: string
}

export function ShotMap({ shots, home, away, homeColor, awayColor }: ShotMapProps) {
  // Filter valid shots and mirror away shots so both teams attack right
  const processedShots = useMemo(() =>
    shots
      .filter(s => s.x != null && s.y != null)
      .map(s => {
        const x = s.x!
        const y = s.y!
        if (s.team === 'away') {
          return { ...s, x: 120 - x, y: 80 - y }
        }
        return { ...s, x, y }
      }),
    [shots]
  )

  const nonGoals = processedShots.filter(s => !s.goal)
  const goals    = processedShots.filter(s =>  s.goal)

  const traces = useMemo(() => [
    // Non-goal shots
    {
      type: 'scatter' as const,
      mode: 'markers' as const,
      x: nonGoals.map(s => s.x),
      y: nonGoals.map(s => s.y),
      marker: {
        size: nonGoals.map(s => {
          const xg = s.xg ?? 0.05
          return Math.max(xg * 35, 7)
        }),
        color: nonGoals.map(s => s.team === 'home' ? homeColor : awayColor),
        opacity: 0.70,
        line: { width: 0.5, color: 'rgba(255,255,255,0.2)' },
      },
      customdata: nonGoals.map(s => ({
        player: s.player_full || s.player || '—',
        minute: s.minute ?? '—',
        xg: (s.xg ?? 0).toFixed(3),
        technique: s.technique || '—',
        body_part: s.body_part || '—',
        team: s.team === 'home' ? home : away,
      })) as any[],
      hovertemplate:
        '<b>%{customdata.player}</b><br>' +
        'Team: %{customdata.team}<br>' +
        'Minute: %{customdata.minute}\'<br>' +
        'xG: %{customdata.xg}<br>' +
        '%{customdata.technique} · %{customdata.body_part}' +
        '<extra></extra>',
      name: 'Shot',
      showlegend: true,
    },
    // Goal shots (gold stars)
    {
      type: 'scatter' as const,
      mode: 'markers' as const,
      x: goals.map(s => s.x),
      y: goals.map(s => s.y),
      marker: {
        symbol: 'star',
        size: 20,
        color: '#fbbf24',
        line: { color: '#ffffff', width: 1.2 },
      },
      customdata: goals.map(s => ({
        player: s.player_full || s.player || '—',
        minute: s.minute ?? '—',
        xg: (s.xg ?? 0).toFixed(3),
        team: s.team === 'home' ? home : away,
      })) as any[],
      hovertemplate:
        '<b>GOAL — %{customdata.player}</b><br>' +
        'Team: %{customdata.team}<br>' +
        'Minute: %{customdata.minute}\'<br>' +
        'xG: %{customdata.xg}' +
        '<extra></extra>',
      name: 'Goal',
      showlegend: true,
    },
  ], [nonGoals, goals, homeColor, awayColor, home, away])

  // Stat summaries for annotation boxes
  const homeXg = processedShots.filter(s => s.team === 'home').reduce((a, s) => a + (s.xg ?? 0), 0)
  const awayXg = processedShots.filter(s => s.team === 'away').reduce((a, s) => a + (s.xg ?? 0), 0)
  const homeGoalCount = goals.filter(s => s.team === 'home').length
  const awayGoalCount = goals.filter(s => s.team === 'away').length

  const layout = useMemo(() => ({
    ...pitchLayout(undefined),
    showlegend: true,
    legend: {
      x: 0.5,
      y: -0.02,
      xanchor: 'center' as const,
      yanchor: 'top' as const,
      orientation: 'h' as const,
      bgcolor: 'rgba(15,17,23,0.7)',
      font: { size: 10, color: '#e2e8f0', family: "'DM Mono', monospace" },
    },
    annotations: [
      // Home stats box (right — home attacks right)
      {
        x: 110, y: 74,
        xref: 'x' as const, yref: 'y' as const,
        text: `<b>${home.split(' ').pop()}</b><br>xG ${homeXg.toFixed(2)} / ${homeGoalCount}G`,
        font: { color: homeColor, size: 9, family: "'DM Mono', monospace" },
        showarrow: false,
        bgcolor: 'rgba(15,17,23,0.82)',
        bordercolor: homeColor,
        borderwidth: 0.8,
        borderpad: 4,
        align: 'center' as const,
      },
      // Away stats box (left)
      {
        x: 10, y: 74,
        xref: 'x' as const, yref: 'y' as const,
        text: `<b>${away.split(' ').pop()}</b><br>xG ${awayXg.toFixed(2)} / ${awayGoalCount}G`,
        font: { color: awayColor, size: 9, family: "'DM Mono', monospace" },
        showarrow: false,
        bgcolor: 'rgba(15,17,23,0.82)',
        bordercolor: awayColor,
        borderwidth: 0.8,
        borderpad: 4,
        align: 'center' as const,
      },
      // Direction labels at top
      {
        x: 30, y: 79,
        xref: 'x' as const, yref: 'y' as const,
        text: `← ${away.split(' ').pop()} attacks`,
        font: { color: awayColor, size: 8, family: "'DM Mono', monospace" },
        showarrow: false,
      },
      {
        x: 90, y: 79,
        xref: 'x' as const, yref: 'y' as const,
        text: `${home.split(' ').pop()} attacks →`,
        font: { color: homeColor, size: 8, family: "'DM Mono', monospace" },
        showarrow: false,
      },
    ],
    hoverlabel: {
      bgcolor: '#0f1117',
      bordercolor: '#4a5168',
      font: { color: '#e2e8f0', size: 12, family: "'DM Mono', monospace" },
    },
  }), [home, away, homeColor, awayColor, homeXg, awayXg, homeGoalCount, awayGoalCount])

  if (processedShots.length === 0) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: 'var(--muted)',
        fontFamily: "'DM Mono', monospace", fontSize: 11,
      }}>
        No shot data available
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
