/**
 * pitchLayout.ts
 * Generates Plotly layout configs and shape arrays for a standard
 * StatsBomb-coordinate pitch (120 × 80 yards).
 */

import type { Layout, Shape } from 'plotly.js'

const PITCH_GREEN = '#1c3a28'
const LINE_ALPHA  = 0.55
const LINE_WIDTH  = 1.2

/** All pitch line shapes for a 120×80 StatsBomb pitch */
export function pitchShapes(alpha = LINE_ALPHA): Partial<Shape>[] {
  const lc = `rgba(201,209,217,${alpha})`
  const lw = LINE_WIDTH

  return [
    // Pitch fill
    {
      type: 'rect',
      x0: 0, y0: 0, x1: 120, y1: 80,
      fillcolor: PITCH_GREEN,
      line: { color: lc, width: lw },
    },
    // Centre line
    {
      type: 'line',
      x0: 60, y0: 0, x1: 60, y1: 80,
      line: { color: lc, width: lw },
    },
    // Centre circle
    {
      type: 'circle',
      x0: 50, y0: 30, x1: 70, y1: 50,
      fillcolor: 'rgba(0,0,0,0)',
      line: { color: lc, width: lw },
    },
    // Centre spot
    {
      type: 'circle',
      x0: 59.5, y0: 39.5, x1: 60.5, y1: 40.5,
      fillcolor: lc,
      line: { color: lc, width: 0 },
    },
    // Left penalty area (18-yard box)
    {
      type: 'rect',
      x0: 0, y0: 18, x1: 18, y1: 62,
      fillcolor: 'rgba(0,0,0,0)',
      line: { color: lc, width: lw },
    },
    // Right penalty area
    {
      type: 'rect',
      x0: 102, y0: 18, x1: 120, y1: 62,
      fillcolor: 'rgba(0,0,0,0)',
      line: { color: lc, width: lw },
    },
    // Left 6-yard box
    {
      type: 'rect',
      x0: 0, y0: 30, x1: 6, y1: 50,
      fillcolor: 'rgba(0,0,0,0)',
      line: { color: lc, width: lw },
    },
    // Right 6-yard box
    {
      type: 'rect',
      x0: 114, y0: 30, x1: 120, y1: 50,
      fillcolor: 'rgba(0,0,0,0)',
      line: { color: lc, width: lw },
    },
    // Left goal
    {
      type: 'rect',
      x0: -2, y0: 36, x1: 0, y1: 44,
      fillcolor: 'rgba(0,0,0,0)',
      line: { color: lc, width: lw },
    },
    // Right goal
    {
      type: 'rect',
      x0: 120, y0: 36, x1: 122, y1: 44,
      fillcolor: 'rgba(0,0,0,0)',
      line: { color: lc, width: lw },
    },
    // Left penalty spot
    {
      type: 'circle',
      x0: 11.5, y0: 39.5, x1: 12.5, y1: 40.5,
      fillcolor: lc,
      line: { color: lc, width: 0 },
    },
    // Right penalty spot
    {
      type: 'circle',
      x0: 107.5, y0: 39.5, x1: 108.5, y1: 40.5,
      fillcolor: lc,
      line: { color: lc, width: 0 },
    },
  ]
}

/** Base Plotly layout for a pitch visualization */
export function pitchLayout(title?: string): Partial<Layout> {
  return {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: PITCH_GREEN,
    xaxis: {
      range: [-4, 124],
      showgrid: false,
      zeroline: false,
      showticklabels: false,
      fixedrange: true,
      // NO scaleanchor here — it causes distortion in flex containers
    },
    yaxis: {
      range: [-4, 84],
      showgrid: false,
      zeroline: false,
      showticklabels: false,
      fixedrange: true,
      // NO scaleanchor — pitch proportions handled by container CSS aspect-ratio
    },
    shapes: pitchShapes() as Shape[],
    margin: { t: title ? 30 : 8, r: 8, b: 8, l: 8 },
    title: title
      ? {
          text: title,
          font: {
            size: 12,
            color: '#e2e8f0',
            family: "'Syne', sans-serif",
          },
          x: 0.5,
        }
      : undefined,
    showlegend: false,
    font: { family: "'DM Mono', monospace", color: '#e2e8f0' },
    hoverlabel: {
      bgcolor: '#0f1117',
      bordercolor: '#4a5168',
      font: { family: "'DM Mono', monospace", size: 11, color: '#e2e8f0' },
    },
  }
}

/** Base Plotly layout for standard (non-pitch) charts */
export const CHART_LAYOUT: Partial<Layout> = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: '#161d27',
  font: { family: "'DM Mono', monospace", color: '#e2e8f0', size: 11 },
  margin: { t: 20, r: 24, b: 44, l: 54 },
  xaxis: {
    gridcolor: '#272b35',
    gridwidth: 0.5,
    zerolinecolor: '#272b35',
    tickfont: { size: 10 },
    linecolor: '#272b35',
  },
  yaxis: {
    gridcolor: '#272b35',
    gridwidth: 0.5,
    zerolinecolor: '#272b35',
    tickfont: { size: 10 },
    linecolor: '#272b35',
  },
  legend: {
    bgcolor: 'rgba(22,29,39,0.85)',
    bordercolor: '#272b35',
    borderwidth: 1,
    font: { size: 11 },
  },
  hovermode: 'closest',
  hoverlabel: {
    bgcolor: '#0f1117',
    bordercolor: '#4a5168',
    font: { family: "'DM Mono', monospace", size: 11, color: '#e2e8f0' },
  },
}

export const PLOTLY_CONFIG = {
  displayModeBar: false,
  responsive: true,
  scrollZoom: false,
}
