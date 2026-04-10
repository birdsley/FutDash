import { create } from 'zustand'
import type { MatchData, MatchIndex, PredictionMatch } from '../types'
import { resolveTeamColors } from '../lib/colorUtils'

type ActiveTab = 'match' | 'predict' | 'forecast'

interface MatchStore {
  // State
  currentMatch: MatchData | null
  matchIndex: MatchIndex | null
  predictions: PredictionMatch[]
  forecasts: PredictionMatch[]
  isLoading: boolean
  isIndexLoading: boolean
  isPredictionsLoading: boolean
  error: string | null
  activeTab: ActiveTab

  // Actions
  loadIndex: () => Promise<void>
  loadMatch: (matchId: number) => Promise<void>
  loadPredictions: (leagueSlug?: string, seasonSlug?: string) => Promise<void>
  loadForecasts: (leagueSlug: string) => Promise<void>
  setTab: (tab: ActiveTab) => void
  clearError: () => void
}

/** Resolve the correct public base path for data files */
function dataPath(path: string): string {
  const base = import.meta.env.BASE_URL ?? '/FutDash/'
  const b = base.endsWith('/') ? base : base + '/'
  return `${b}data/${path}`
}

/** Try fetching a URL, return null on error */
async function tryFetch(url: string): Promise<any | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Apply color conflict resolution to a loaded MatchData object.
 * Overwrites meta.home_color and meta.away_color with the resolved values
 * so all downstream components automatically get the correct colors.
 */
function applyColorResolution(data: MatchData): MatchData {
  const { homeColor, awayColor } = resolveTeamColors(
    data.meta.home_color,
    data.meta.away_color
  )
  return {
    ...data,
    meta: {
      ...data.meta,
      home_color: homeColor,
      away_color: awayColor,
    },
  }
}

export const useMatchStore = create<MatchStore>((set, get) => ({
  currentMatch: null,
  matchIndex: null,
  predictions: [],
  forecasts: [],
  isLoading: false,
  isIndexLoading: false,
  isPredictionsLoading: false,
  error: null,
  activeTab: 'match',

  loadIndex: async () => {
    if (get().matchIndex) return
    set({ isIndexLoading: true, error: null })
    try {
      const res = await fetch(dataPath('index.json'))
      if (!res.ok) throw new Error(`Failed to load match index (${res.status})`)
      const data: MatchIndex = await res.json()
      set({ matchIndex: data, isIndexLoading: false })
    } catch (err) {
      set({
        isIndexLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load index',
      })
    }
  },

  loadMatch: async (matchId: number) => {
    set({ isLoading: true, error: null })
    try {
      const res = await fetch(dataPath(`matches/${matchId}.json`))
      if (!res.ok) throw new Error(`Match ${matchId} not found (${res.status})`)
      const raw: MatchData = await res.json()
      // Apply color conflict resolution before storing
      const data = applyColorResolution(raw)
      set({ currentMatch: data, isLoading: false, activeTab: 'match' })
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : `Failed to load match ${matchId}`,
      })
    }
  },

  loadPredictions: async (leagueSlug?: string, seasonSlug?: string) => {
    set({ isPredictionsLoading: true })

    if (leagueSlug && seasonSlug) {
      const data = await tryFetch(dataPath(`predictions/${leagueSlug}/${seasonSlug}.json`))
      if (data) {
        const existing = get().predictions
        const newPreds = [...existing, ...data].filter(
          (m, i, arr) => arr.findIndex(x => x.match_id === m.match_id) === i
        )
        set({ predictions: newPreds, isPredictionsLoading: false })
        return
      }
      set({ isPredictionsLoading: false })
      return
    }

    const predIndex = await tryFetch(dataPath('predictions/_index.json'))
    const allPredictions: PredictionMatch[] = []

    if (predIndex?.leagues) {
      const TOP_LEAGUES = [
        { slug: 'premier_league', code: 'E0' },
        { slug: 'la_liga', code: 'SP1' },
        { slug: 'bundesliga', code: 'D1' },
        { slug: 'serie_a', code: 'I1' },
        { slug: 'ligue_1', code: 'F1' },
        { slug: 'championship', code: 'E1' },
      ]

      const toLoad: { slug: string; season: string }[] = []

      for (const league of predIndex.leagues) {
        const slug = league.league_slug as string
        const seasons = (league.seasons as string[]) || []
        if (!seasons.length) continue

        const isTop = TOP_LEAGUES.some(t => t.slug === slug || slug.includes(t.code.toLowerCase()))
        if (isTop || predIndex.leagues.length <= 8) {
          const recent = [...seasons].sort().reverse().slice(0, 2)
          for (const s of recent) {
            toLoad.push({ slug, season: s })
          }
        }
      }

      const fetches = toLoad.slice(0, 12).map(({ slug, season }) =>
        tryFetch(dataPath(`predictions/${slug}/${season}.json`))
      )
      const results = await Promise.all(fetches)
      results.forEach(r => {
        if (Array.isArray(r)) allPredictions.push(...r)
      })
    } else {
      const FALLBACK_LEAGUES = [
        { slug: 'premier_league', seasons: ['2024-25', '2023-24', '2022-23'] },
        { slug: 'la_liga',        seasons: ['2024-25', '2023-24'] },
        { slug: 'bundesliga',     seasons: ['2024-25', '2023-24'] },
      ]

      const fetches = FALLBACK_LEAGUES.flatMap(({ slug, seasons }) =>
        seasons.map(s => tryFetch(dataPath(`predictions/${slug}/${s}.json`)))
      )
      const results = await Promise.all(fetches)
      results.forEach(r => {
        if (Array.isArray(r)) allPredictions.push(...r)
      })
    }

    const unique = allPredictions.filter(
      (m, i, arr) => arr.findIndex(x => x.match_id === m.match_id) === i
    )

    unique.sort((a, b) => b.date.localeCompare(a.date))

    set({
      predictions: unique.filter(m => m.actual !== null),
      forecasts: unique.filter(m => m.actual === null),
      isPredictionsLoading: false,
    })
  },

  loadForecasts: async (leagueSlug: string) => {
    try {
      const data = await tryFetch(dataPath(`predictions/${leagueSlug}/upcoming.json`))
      if (data && Array.isArray(data)) {
        set(state => ({
          forecasts: [...state.forecasts, ...data].filter(
            (m, i, arr) => arr.findIndex(x => x.match_id === m.match_id) === i
          )
        }))
      }
    } catch {
      // graceful no-op
    }
  },

  setTab: (tab: ActiveTab) => set({ activeTab: tab }),
  clearError: () => set({ error: null }),
}))
