import { useNavigate } from 'react-router-dom'
import { useMatchStore } from '../store/matchStore'

const TABS = [
  { id: 'match',   label: 'Match Analysis' },
  { id: 'predict', label: 'Predictions' },
  { id: 'forecast',label: 'Forecast' },
] as const

export default function TabBar() {
  const { activeTab, setTab, currentMatch } = useMatchStore()
  const navigate = useNavigate()

  const accentColor = currentMatch?.meta?.home_color ?? 'var(--accent)'

  return (
    <div style={{
      display: 'flex', padding: '0 2rem',
      borderBottom: '1px solid var(--border)',
      background: 'var(--surface)',
      gap: 0, flexShrink: 0,
    }}>
      {TABS.map(t => (
        <div
          key={t.id}
          onClick={() => { setTab(t.id); navigate(`/${t.id}`) }}
          style={{
            padding: '0.75rem 1.25rem', cursor: 'pointer',
            fontFamily: "'DM Mono', monospace", fontSize: 11,
            textTransform: 'uppercase', letterSpacing: '0.08em',
            color: activeTab === t.id ? 'var(--text)' : 'var(--muted)',
            borderBottom: `2px solid ${activeTab === t.id ? accentColor : 'transparent'}`,
            transition: 'all 0.15s', marginBottom: -1,
          }}
          onMouseEnter={e => { if (activeTab !== t.id) (e.currentTarget as HTMLDivElement).style.color = 'var(--text)' }}
          onMouseLeave={e => { if (activeTab !== t.id) (e.currentTarget as HTMLDivElement).style.color = 'var(--muted)' }}
        >
          {t.label}
        </div>
      ))}
    </div>
  )
}
