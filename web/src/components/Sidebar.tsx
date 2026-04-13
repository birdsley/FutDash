import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMatchStore } from '../store/matchStore'
import type { MatchSummary } from '../types'

function formatDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return d }
}

export default function Sidebar() {
  const { matchIndex, isIndexLoading, loadMatch, setTab, currentMatch, activeTab } = useMatchStore()
  const navigate = useNavigate()
  const [selectedComp, setSelectedComp] = useState('')
  const [selectedSeason, setSelectedSeason] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)

  // Get seasons available for the selected competition (or all if none selected)
  const availableSeasons = Array.from(new Set(
    (matchIndex?.competitions ?? [])
      .filter(c => !selectedComp || String(c.id) === selectedComp)
      .flatMap(c => c.seasons.map(s => s.name))
  )).sort().reverse()

  // Reset season selection if it's not valid for the selected competition
  const handleCompChange = (compId: string) => {
    setSelectedComp(compId)
    // Check if current season is valid for new competition
    if (compId) {
      const comp = matchIndex?.competitions.find(c => String(c.id) === compId)
      const validSeasons = comp?.seasons.map(s => s.name) ?? []
      if (selectedSeason && !validSeasons.includes(selectedSeason)) {
        setSelectedSeason('')
      }
    }
  }

  async function handleMatchClick(m: MatchSummary) {
    setTab('match')
    await loadMatch(m.match_id)
    navigate(`/match/${m.match_id}`)
    setMobileOpen(false)
  }

  const filtered = (matchIndex?.competitions ?? []).filter(c =>
    !selectedComp || String(c.id) === selectedComp
  ).flatMap(c => c.seasons
    .filter(s => !selectedSeason || s.name === selectedSeason)
    .map(s => ({ comp: c, season: s }))
  )

  const sidebarContent = (
    <>
      {/* Header */}
      <div style={{ padding: '1.5rem 1.25rem 1rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: '1.4rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', boxShadow: '0 0 8px var(--accent)' }} />
          FutDash
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Match Intelligence Hub
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: '1rem 0', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
        {[
          { tab: 'match' as const, icon: '⚽', label: 'Match Analysis', path: '/match' },
          { tab: 'predict' as const, icon: '📊', label: 'Predictions', path: '/predict' },
          { tab: 'forecast' as const, icon: '🔭', label: 'Forecast', path: '/forecast' },
        ].map(({ tab, icon, label, path }) => (
          <div
            key={tab}
            onClick={() => { setTab(tab); navigate(path); setMobileOpen(false) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '0.55rem 1.25rem', cursor: 'pointer',
              transition: 'background 0.15s',
              color: activeTab === tab ? 'var(--accent)' : 'var(--muted)',
              background: activeTab === tab ? 'rgba(74,222,128,0.06)' : 'transparent',
              fontFamily: "'DM Mono', monospace", fontSize: 11,
              textTransform: 'uppercase', letterSpacing: '0.04em',
            }}
            onMouseEnter={e => { if (activeTab !== tab) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)' }}
            onMouseLeave={e => { if (activeTab !== tab) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
          >
            <span style={{ fontSize: 14, width: 20, textAlign: 'center' }}>{icon}</span>
            {label}
          </div>
        ))}
      </nav>

      {/* Filters */}
      <div style={{ padding: '0.75rem 1.25rem 0.5rem' }}>
        <select value={selectedComp} onChange={e => handleCompChange(e.target.value)} style={{ width: '100%', marginBottom: 6 }}>
          <option value="">All Competitions</option>
          {(matchIndex?.competitions ?? []).map(c => (
            <option key={c.id} value={String(c.id)}>{c.flag ?? ''} {c.name}</option>
          ))}
        </select>
        <select value={selectedSeason} onChange={e => setSelectedSeason(e.target.value)} style={{ width: '100%' }}>
          <option value="">All Seasons</option>
          {availableSeasons.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {selectedComp && availableSeasons.length === 0 && (
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>
            No seasons available for this competition
          </div>
        )}
      </div>

      {/* Match list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0' }}>
        {isIndexLoading && (
          <div style={{ padding: '1rem 1.25rem' }}>
            {[1,2,3,4].map(i => (
              <div key={i} className="skeleton" style={{ height: 56, borderRadius: 8, marginBottom: 8, animationDelay: `${i*0.15}s` }} />
            ))}
          </div>
        )}
        {!isIndexLoading && filtered.length === 0 && (
          <div style={{ padding: '2rem 1.25rem', color: 'var(--muted2)', fontSize: 12, fontFamily: "'DM Mono', monospace", textAlign: 'center' }}>
            No matches found
          </div>
        )}
        {filtered.map(({ comp, season }) => (
          <div key={`${comp.id}-${season.id}`}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted2)', padding: '0.4rem 1.25rem 0.3rem' }}>
              {comp.flag ?? ''} {comp.name} · {season.name}
            </div>
            {season.matches.map(m => {
              const isActive = currentMatch?.meta.match_id === m.match_id
              return (
                <div
                  key={m.match_id}
                  onClick={() => handleMatchClick(m)}
                  style={{
                    padding: '0.65rem 1.25rem', cursor: 'pointer',
                    borderLeft: `3px solid ${isActive ? m.home_color : 'transparent'}`,
                    background: isActive ? 'rgba(255,255,255,0.05)' : 'transparent',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)' }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                >
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <span>{m.home}</span>
                    <span style={{
                      fontFamily: "'DM Mono', monospace", fontSize: 11,
                      background: 'var(--surface2)', padding: '1px 6px', borderRadius: 4,
                      color: m.score_home > m.score_away ? m.home_color : m.score_away > m.score_home ? m.away_color : 'var(--text)',
                    }}>
                      {m.score_home}–{m.score_away}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2 }}>{m.away}</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--muted2)' }}>{formatDate(m.date)}</div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside style={{
        position: 'fixed', left: 0, top: 0, bottom: 0, width: 260,
        background: 'var(--surface)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', zIndex: 100,
      }} className="desktop-sidebar">
        {sidebarContent}
      </aside>

      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(o => !o)}
        style={{
          display: 'none', position: 'fixed', bottom: '1.5rem', left: '1.5rem',
          zIndex: 200, background: 'var(--accent)', color: 'var(--bg)', border: 'none',
          width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', fontSize: 18,
          boxShadow: '0 4px 20px rgba(74,222,128,0.4)',
        }}
        className="mobile-toggle"
      >
        ☰
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{ display: 'none', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99, backdropFilter: 'blur(2px)' }}
          className="mobile-overlay"
        />
      )}

      {/* Mobile drawer */}
      <aside style={{
        position: 'fixed', left: 0, top: 0, bottom: 0, width: 260,
        background: 'var(--surface)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', zIndex: 101,
        transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.3s cubic-bezier(.4,0,.2,1)',
      }} className="mobile-sidebar">
        {sidebarContent}
      </aside>

      <style>{`
        @media (max-width: 768px) {
          .desktop-sidebar { display: none !important; }
          .mobile-toggle { display: flex !important; align-items: center; justify-content: center; }
          .mobile-overlay { display: block !important; }
        }
        @media (min-width: 769px) {
          .mobile-sidebar { display: none !important; }
        }
      `}</style>
    </>
  )
}
