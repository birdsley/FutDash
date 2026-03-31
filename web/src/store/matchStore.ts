import { create } from 'zustand'
import type { MatchData, MatchIndex, PredictionMatch } from '../types'

type ActiveTab = 'match' | 'predict' | 'forecast'

interface MatchStore {
  // State
  currentMatch: MatchData | null
  matchIndex: MatchIndex | null
  predictions: PredictionMatch[]
  forecasts: PredictionMatch[]
  isLoading: boolean
  isIndexLoading: boolean
  error: string | null
  activeTab: ActiveTab

  // Actions
  loadIndex: () => Promise<void>
  loadMatch: (matchId: number) => Promise<void>
  loadPredictions: (leagueSlug: string, seasonSlug: string) => Promise<void>
  loadForecasts: (leagueSlug: string) => Promise<void>
  setTab: (tab: ActiveTab) => void
  clearError: () => void
}

/** Resolve the correct public base path for data files */
function dataPath(path: string): string {
  const base = import.meta.env.BASE_URL ?? '/FutDash/'
  return `${base}data/${path}`
}

export const useMatchStore = create<MatchStore>((set, get) => ({
  currentMatch: null,
  matchIndex: null,
  predictions: [],
  forecasts: [],
  isLoading: false,
  isIndexLoading: false,
  error: null,
  activeTab: 'match',

  loadIndex: async () => {
    if (get().matchIndex) return  // already loaded
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
      const data: MatchData = await res.json()
      set({ currentMatch: data, isLoading: false })
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : `Failed to load match ${matchId}`,
      })
    }
  },

  loadPredictions: async (leagueSlug: string, seasonSlug: string) => {
    set({ isLoading: true, error: null })
    try {
      const res = await fetch(dataPath(`predictions/${leagueSlug}/${seasonSlug}.json`))
      if (!res.ok) throw new Error(`Predictions not found for ${leagueSlug}/${seasonSlug}`)
      const data: PredictionMatch[] = await res.json()
      set({ predictions: data, isLoading: false })
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load predictions',
      })
    }
  },

  loadForecasts: async (leagueSlug: string) => {
    set({ isLoading: true, error: null })
    try {
      const res = await fetch(dataPath(`predictions/${leagueSlug}/upcoming.json`))
      if (!res.ok) {
        // Gracefully handle missing upcoming file — not a hard error
        set({ forecasts: [], isLoading: false })
        return
      }
      const data: PredictionMatch[] = await res.json()
      set({ forecasts: data, isLoading: false })
    } catch {
      set({ forecasts: [], isLoading: false })
    }
  },

  setTab: (tab: ActiveTab) => set({ activeTab: tab }),
  clearError: () => set({ error: null }),
}))
