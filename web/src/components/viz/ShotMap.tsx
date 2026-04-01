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
  /** When true, show possession-origin arrows instead of plain shot map */
  arrowMode?: boolean
}

export function ShotMap({ shots, home, away, homeColor, awayColor, arrowMode = false }: ShotMapProps) {
  // Mirror away shots so both teams attack right
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
    {
      type: 'scatter' as const,
      mode: 'markers' as const,
      x: nonGoals.map(s => s.x),
      y: nonGoals.map(s => s.y),
      marker: {
        size:    nonGoals.map(s => Math.max((s.xg ?? 0.05) * 28, 6)),
        color:   nonGoals.map(s => s.team === 'home' ? homeColor : awayColor),
        opacity: 0.65,
        line: { width: 0 },
      },
      text: nonGoals.map(s =>
        `${s.player_full || s.player}<br>${s.minute}'  xG: ${(s.xg ?? 0).toFixed(3)}<br>${s.technique} · ${s.body_part}`
      ),
      hoverinfo: 'text' as const,
      name: 'Shot',
      showlegend: false,
    },
    {
      type: 'scatter' as const,
      mode: 'markers' as const,
      x: goals.map(s => s.x),
      y: goals.map(s => s.y),
      marker: {
        symbol: 'star',
        size:   18,
        color:  '#fbbf24',
        line:   { color: 'white', width: 1 },
      },
      text: goals.map(s =>
        `⚽ GOAL<br>${s.player_full || s.player}<br>${s.minute}'  xG: ${(s.xg ?? 0).toFixed(3)}`
      ),
      hoverinfo: 'text' as const,
      name: 'Goal',
      showlegend: false,
    },
  ], [nonGoals, goals, homeColor, awayColor])

  // Possession-origin arrows: top-8 xG shots per team
  const annotations = useMemo(() => {
    if (!arrowMode) return []
    const topHome = allShots
      .filter(s => s.team === 'home')
      .sort((a, b) => (b.xg ?? 0) - (a.xg ?? 0))
      .slice(0, 8)
    const topAway = allShots
      .filter(s => s.team === 'away')
      .sort((a, b) => (b.xg ?? 0) - (a.xg ?? 0))
      .slice(0, 8)

    return [...topHome, ...topAway].map(s => {
      const originX = Math.max(s.x - 18 - Math.random() * 12, 5)
      const originY = Math.min(Math.max(s.y + (Math.random() - 0.5) * 14, 2), 78)
      return {
        x: s.x, y: s.y, ax: originX, ay: originY,
        xref: 'x' as const, yref: 'y' as const,
        axref: 'x' as const, ayref: 'y' as const,
        showarrow: true,
        arrowhead: 2, arrowsize: 0.85,
        arrowcolor: `${s.team === 'home' ? homeColor : awayColor}bb`,
        arrowwidth: 1.3,
      }
    })
  }, [allShots, arrowMode, homeColor, awayColor])

  const layout = useMemo(() => ({
    ...pitchLayout(
      arrowMode
        ? 'Possession Origins → Shots'
        : 'Shot Map — Both Teams'
    ),
    annotations,
  }), [arrowMode, annotations])

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
