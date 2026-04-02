import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useMatchStore } from './store/matchStore'
import Sidebar from './components/Sidebar'
import ScoreBanner from './components/ScoreBanner'
import TabBar from './components/TabBar'
import MatchDashboard from "./components/viz/MatchDashboard";
import { PredictionsView } from './views/PredictionsView'
import { ForecastView } from './views/ForecastView'

export default function App() {
  const { loadIndex, activeTab, currentMatch } = useMatchStore()

  useEffect(() => {
    loadIndex()
  }, [loadIndex])

  const showBanner = activeTab === 'match' && currentMatch !== null

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <Sidebar />

      <div
        style={{
          marginLeft: 260,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
        }}
        className="main-content"
      >
        {showBanner && <ScoreBanner />}
        <TabBar />

        <div style={{ flex: 1, padding: '1.75rem 2rem', overflow: 'hidden' }}>
          <Routes>
            <Route path="/" element={<Navigate to="/match" replace />} />
            <Route path="/match" element={<MatchDashboard />} />
            <Route path="/match/:id" element={<MatchDashboard />} />
            <Route path="/predict" element={<PredictionsView predictions={[]} />} />
            <Route path="/forecast" element={<ForecastView />} />
            <Route path="*" element={<Navigate to="/match" replace />} />
          </Routes>
        </div>
      </div>

      {/* Mobile styles */}
      <style>{`
        @media (max-width: 768px) {
          .main-content { margin-left: 0 !important; }
        }
      `}</style>
    </div>
  )
}
