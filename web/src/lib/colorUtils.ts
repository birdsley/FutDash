/**
 * colorUtils.ts
 * Mirrors the Python get_effective_color() logic from statsbomb_v9.py.
 * Ensures team colors remain visible on the dark #0f1117 background.
 *
 * v2: Added color similarity detection — when home and away colors are too
 * visually close, the away color is replaced with white (#e2e8f0) so the
 * two teams remain distinguishable. Threshold is perceptual (WCAG-derived).
 */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ]
}

function linearize(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/**
 * WCAG 2.1 relative luminance (0 = black, 1 = white)
 */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  const lr = linearize(r)
  const lg = linearize(g)
  const lb = linearize(b)
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb
}

/**
 * Convert RGB to HLS (returns [h 0–1, l 0–1, s 0–1])
 */
function rgbToHls(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, l, 0]

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
    case g: h = ((b - r) / d + 2) / 6; break
    case b: h = ((r - g) / d + 4) / 6; break
  }
  return [h, l, s]
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1
  if (t > 1) t -= 1
  if (t < 1 / 6) return p + (q - p) * 6 * t
  if (t < 1 / 2) return q
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
  return p
}

function hlsToRgb(h: number, l: number, s: number): [number, number, number] {
  if (s === 0) return [l, l, l]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [
    hue2rgb(p, q, h + 1 / 3),
    hue2rgb(p, q, h),
    hue2rgb(p, q, h - 1 / 3),
  ]
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v * 255)))
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/**
 * Returns [effectiveHex, isDark].
 * Matches Python get_effective_color(hex, threshold=0.06).
 *
 * Dark colors (luminance < threshold) are lightened by +35pp in HLS
 * so they remain visible on the #0f1117 background.
 */
export function getEffectiveColor(
  hex: string,
  threshold = 0.06
): [string, boolean] {
  if (!hex || hex.length < 6) return [hex ?? '#6e7891', false]
  try {
    const lum = relativeLuminance(hex)
    if (lum >= threshold) return [hex, false]

    const [r, g, b] = hexToRgb(hex)
    const [h, l, s] = rgbToHls(r, g, b)
    const l2 = Math.min(l + 0.35, 0.88)
    const [r2, g2, b2] = hlsToRgb(h, l2, s)
    return [rgbToHex(r2, g2, b2), true]
  } catch {
    return [hex, false]
  }
}

/**
 * Compute the perceptual color distance between two hex colors.
 *
 * Uses a simplified CIELAB-approximation based on RGB differences
 * weighted by human luminance sensitivity. Returns a value in [0, 1]
 * where 0 = identical and 1 = maximally different.
 *
 * The distance is computed as:
 *   sqrt( (2 + r̄/256) · ΔR² + 4·ΔG² + (2 + (255-r̄)/256)·ΔB² ) / 764.83
 *
 * This is the "redmean" approximation, which is perceptually better than
 * plain Euclidean RGB distance.
 */
export function colorDistance(hexA: string, hexB: string): number {
  try {
    const [r1, g1, b1] = hexToRgb(hexA).map(v => v * 255)
    const [r2, g2, b2] = hexToRgb(hexB).map(v => v * 255)
    const rBar = (r1 + r2) / 2
    const dR = r1 - r2
    const dG = g1 - g2
    const dB = b1 - b2
    const raw = Math.sqrt(
      (2 + rBar / 256) * dR * dR +
      4 * dG * dG +
      (2 + (255 - rBar) / 256) * dB * dB
    )
    // Maximum possible raw value ≈ 764.83 (pure red vs pure cyan)
    return Math.min(raw / 764.83, 1)
  } catch {
    return 1
  }
}

/**
 * Hue distance in [0, 1] — how far apart are the colors on the color wheel?
 * 0 = same hue, 1 = opposite hue (180°).
 */
function hueDistance(hexA: string, hexB: string): number {
  try {
    const [rA, gA, bA] = hexToRgb(hexA)
    const [rB, gB, bB] = hexToRgb(hexB)
    const [hA] = rgbToHls(rA, gA, bA)
    const [hB] = rgbToHls(rB, gB, bB)
    const d = Math.abs(hA - hB)
    return Math.min(d, 1 - d) * 2  // normalize to [0,1] where 1 = 180° apart
  } catch {
    return 1
  }
}

/**
 * AWAY_WHITE: the color used when teams are too similar.
 * Slightly off-white for better readability on the dark background.
 */
export const AWAY_WHITE = '#e2e8f0'

/**
 * Determine the final colors to display for home and away teams.
 *
 * Steps:
 *  1. Apply luminance correction to both raw colors.
 *  2. Check perceptual distance between the two corrected colors.
 *  3. If distance < SIMILARITY_THRESHOLD (or hues are too close),
 *     override the away color with white.
 *
 * Returns { homeColor, awayColor, awayIsOverridden }.
 */
export function resolveTeamColors(
  rawHome: string,
  rawAway: string,
): {
  homeColor: string
  awayColor: string
  awayIsOverridden: boolean
} {
  const [homeColor] = getEffectiveColor(rawHome)
  const [awayColorEffective] = getEffectiveColor(rawAway)

  // Perceptual distance threshold — values below this are "too similar"
  const SIMILARITY_THRESHOLD = 0.22

  const dist = colorDistance(homeColor, awayColorEffective)
  const hueDist = hueDistance(homeColor, awayColorEffective)

  // Colors are too close if either:
  //   - Raw perceptual distance is below threshold, OR
  //   - Hue difference is small AND brightness difference is small
  const tooDark = relativeLuminance(homeColor) < 0.15 && relativeLuminance(awayColorEffective) < 0.15
  const tooSimilar = dist < SIMILARITY_THRESHOLD || tooDark || hueDist < 0.12

  if (tooSimilar) {
    return { homeColor, awayColor: AWAY_WHITE, awayIsOverridden: true }
  }

  return { homeColor, awayColor: awayColorEffective, awayIsOverridden: false }
}

/**
 * Returns an rgba string with the given hex color at reduced opacity.
 */
export function withAlpha(hex: string, alpha: number): string {
  try {
    const [r, g, b] = hexToRgb(hex).map(v => Math.round(v * 255))
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  } catch {
    return hex
  }
}

/**
 * Returns true if white text is more readable on a given background.
 */
export function preferWhiteText(hex: string): boolean {
  return relativeLuminance(hex) < 0.18
}
