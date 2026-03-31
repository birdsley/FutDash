import { useMatchStore } from '../store/matchStore'

export default function ScoreBanner() {
  const { currentMatch } = useMatchStore()
  if (!currentMatch) return null
  const { meta } = currentMatch
  const ph = meta.possession_home ?? 50

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'var(--surface2)', borderBottom: '1px solid var(--border)',
      padding: '1rem 2rem',
    }}>
      <div style={{
        fontFamily: "'DM Mono', monospace", fontSize: 10, textTransform: 'uppercase',
        letterSpacing: '0.1em', color: 'var(--muted)', textAlign: 'center', marginBottom: '0.5rem',
      }}>
        {meta.competition} · {meta.season}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '1rem', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: '1.1rem', fontWeight: 700, color: meta.home_color, textAlign: 'right' }}>
          {meta.home}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: "'Syne', sans-serif", fontSize: '2.4rem', fontWeight: 800, color: '#fff' }}>
          <span>{meta.score_home}</span>
          <span style={{ color: 'var(--muted)', fontSize: '1.8rem', fontWeight: 300 }}>–</span>
          <span>{meta.score_away}</span>
        </div>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: '1.1rem', fontWeight: 700, color: meta.away_color, textAlign: 'left' }}>
          {meta.away}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--muted)', marginBottom: '0.6rem' }}>
        <span>xG <span style={{ color: 'var(--text)', marginLeft: 4 }}>{meta.xg_home?.toFixed(2) ?? '–'} – {meta.xg_away?.toFixed(2) ?? '–'}</span></span>
        <span>Shots <span style={{ color: 'var(--text)', marginLeft: 4 }}>{meta.shots_home} – {meta.shots_away}</span></span>
        <span>Possession <span style={{ color: 'var(--text)', marginLeft: 4 }}>{ph}% – {100 - ph}%</span></span>
      </div>

      <div style={{ height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden', display: 'flex' }}>
        <div style={{ width: `${ph}%`, height: '100%', background: meta.home_color, transition: 'width 0.6s ease' }} />
        <div style={{ flex: 1, height: '100%', background: meta.away_color }} />
      </div>
    </div>
  )
}
