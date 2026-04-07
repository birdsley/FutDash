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
  // Mirror away shots so both teams attack right → easier comparison
  const allShots = useMemo(() =>
    shots
      .filter(s => s.x != null && s.y != null)
      .map(s =>
        s.team === 'away'
          ? { ...s, x: 120 - s.x!, y: 80 - s.y! }
          : { ...s, x: s.x!, y: s.y! }
      ),
    [shots]
  )

  const nonGoals = allShots.filter(s => !s.goal)
  const goals    = allShots.filter(s =>  s.goal)

  const traces = useMemo(() => [
    // Non-goal shots — filled circles, size proportional to xG
    {
      type: 'scatter' as const,
      mode: 'markers' as const,
      x: nonGoals.map(s => s.x),
      y: nonGoals.map(s => s.y),
      marker: {
        size: nonGoals.map(s => Math.max((s.xg ?? 0.05) * 30, 6)),
        color: nonGoals.map(s => s.team === 'home' ? homeColor : awayColor),
        opacity: 0.65,
        line: { width: 0 },
      },
      customdata: nonGoals.map(s => ({
        player: s.player_full || s.player,
        minute: s.minute ?? '—',
        xg: (s.xg ?? 0).toFixed(3),
        technique: s.technique || '—',
        body_part: s.body_part || '—',
        team: s.team === 'home' ? home : away,
      })),
      hovertemplate:
        '<b>%{customdata.player}</b><br>' +
        'Team: %{customdata.team}<br>' +
        'Minute: %{customdata.minute}\'<br>' +
        'xG: %{customdata.xg}<br>' +
        '%{customdata.technique} · %{customdata.body_part}' +
        '<extra></extra>',
      name: 'Shot',
      showlegend: false,
    },
    // Goals — gold star markers
    {
      type: 'scatter' as const,
      mode: 'markers' as const,
      x: goals.map(s => s.x),
      y: goals.map(s => s.y),
      marker: {
        symbol: 'star',
        size: 18,
        color: '#fbbf24',
        line: { color: '#ffffff', width: 1.2 },
      },
      customdata: goals.map(s => ({
        player: s.player_full || s.player,
        minute: s.minute ?? '—',
        xg: (s.xg ?? 0).toFixed(3),
        team: s.team === 'home' ? home : away,
      })),
      hovertemplate:
        '<b>GOAL — %{customdata.player}</b><br>' +
        'Team: %{customdata.team}<br>' +
        'Minute: %{customdata.minute}\'<br>' +
        'xG: %{customdata.xg}' +
        '<extra></extra>',
      name: 'Goal',
      showlegend: false,
    },
  ], [nonGoals, goals, homeColor, awayColor, home, away])

  // xG totals per team for annotation boxes
  const homeXg = allShots.filter(s => s.team === 'home').reduce((a, s) => a + (s.xg ?? 0), 0)
  const awayXg = allShots.filter(s => s.team === 'away').reduce((a, s) => a + (s.xg ?? 0), 0)
  const homeGoals = goals.filter(s => s.team === 'home').length
  const awayGoals = goals.filter(s => s.team === 'away').length

  const layout = useMemo(() => ({
    ...pitchLayout('Shot Map — Both Teams'),
    annotations: [
      // Home stats box (right side — home attacks right)
      {
        x: 108, y: 72,
        xref: 'x' as const, yref: 'y' as const,
        text: `<b>${home.split(' ').pop()}</b><br>xG ${homeXg.toFixed(2)} / ${homeGoals}G`,
        font: { color: homeColor, size: 9, family: "'DM Mono', monospace" },
        showarrow: false,
        bgcolor: 'rgba(15,17,23,0.75)',
        bordercolor: homeColor,
        borderwidth: 0.8,
        borderpad: 4,
        align: 'center' as const,
      },
      // Away stats box (left side — away team mirrored to attack right too)
      {
        x: 12, y: 72,
        xref: 'x' as const, yref: 'y' as const,
        text: `<b>${away.split(' ').pop()}</b><br>xG ${awayXg.toFixed(2)} / ${awayGoals}G`,
        font: { color: awayColor, size: 9, family: "'DM Mono', monospace" },
        showarrow: false,
        bgcolor: 'rgba(15,17,23,0.75)',
        bordercolor: awayColor,
        borderwidth: 0.8,
        borderpad: 4,
        align: 'center' as const,
      },
      // Direction labels
      {
        x: 30, y: 77,
        xref: 'x' as const, yref: 'y' as const,
        text: `← ${away.split(' ').pop()} attacks`,
        font: { color: awayColor, size: 8, family: "'DM Mono', monospace" },
        showarrow: false,
      },
      {
        x: 90, y: 77,
        xref: 'x' as const, yref: 'y' as const,
        text: `${home.split(' ').pop()} attacks →`,
        font: { color: homeColor, size: 8, family: "'DM Mono', monospace" },
        showarrow: false,
      },
    ],
    // Fix: readable hover text
    hoverlabel: {
      bgcolor: '#0f1117',
      bordercolor: '#4a5168',
      font: { color: '#e2e8f0', size: 12, family: "'DM Mono', monospace" },
    },
  }), [home, away, homeColor, awayColor, homeXg, awayXg, homeGoals, awayGoals])

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
