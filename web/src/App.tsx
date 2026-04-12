import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useMatchStore } from './store/matchStore'
import Sidebar from './components/Sidebar'
import ScoreBanner from './components/ScoreBanner'
import TabBar from './components/TabBar'
import MatchDashboard from './components/viz/MatchDashboard'
import { PredictionsView } from './views/PredictionsView'
import { ForecastView } from './views/ForecastView'

// Leagues that fetch_fixtures.py writes upcoming.json for.
// These are loaded on app mount so the Forecast tab is pre-populated.
const FORECAST_LEAGUES = [
  'premier_league',
  'la_liga',
  'bundesliga',
  'serie_a',
  'ligue_1',
  'eredivisie',
  'primeira_liga',
]

export default function App() {
  const {
    loadIndex,
    loadPredictions,
    loadForecasts,
    activeTab,
    currentMatch,
    predictions,
    forecasts,
    loadMatch,
  } = useMatchStore()

  useEffect(() => {
    // Load match index (sidebar)
    loadIndex()

    // Load historical predictions AND upcoming fixtures.
    // loadPredictions now internally fetches upcoming.json for every
    // FORECAST_LEAGUES entry, so a single call populates both tabs.
    loadPredictions()

    // Also call loadForecasts individually for each league as a belt-and-
    // suspenders approach — this handles the case where loadPredictions
    // runs before the upcoming.json files are available (slow networks, etc.)
    FORECAST_LEAGUES.forEach(slug => loadForecasts(slug))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const showBanner = activeTab === 'match' && currentMatch !== null

  function handleViewMatch(matchId: number) {
    loadMatch(matchId)
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <Sidebar />

      <div
        className="main-content"
        style={{
          marginLeft: 260,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
        }}
      >
        {showBanner && <ScoreBanner />}
        <TabBar />

        <div style={{ flex: 1, padding: '1.75rem 2rem', overflow: 'hidden' }}>
          <Routes>
            <Route path="/" element={<Navigate to="/match" replace />} />
            <Route path="/match" element={<MatchDashboard />} />
            <Route path="/match/:id" element={<MatchDashboard />} />
            <Route
              path="/predict"
              element={
                <PredictionsView
                  predictions={predictions}
                  onViewMatch={handleViewMatch}
                />
              }
            />
            <Route
              path="/forecast"
              element={
                <ForecastView
                  allPredictions={[...predictions, ...forecasts]}
                  onViewMatch={handleViewMatch}
                />
              }
            />
            <Route path="*" element={<Navigate to="/match" replace />} />
          </Routes>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .main-content { margin-left: 0 !important; }
        }
      `}</style>
    </div>
  )
}
