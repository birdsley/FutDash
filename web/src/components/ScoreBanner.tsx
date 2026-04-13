import { useMatchStore } from '../store/matchStore'

export default function ScoreBanner() {
  const { currentMatch } = useMatchStore()
  if (!currentMatch) return null
  const { meta } = currentMatch
  const ph = meta.possession_home ?? 50

  const hasPenalties = meta.has_penalties && 
    meta.penalty_home != null && 
    meta.penalty_away != null

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'var(--surface2)', borderBottom: '1px solid var(--border)',
      padding: '1rem 2rem',
    }}>
      {/* Competition & Season */}
      <div style={{
        fontFamily: "'DM Mono', monospace", fontSize: 10, textTransform: 'uppercase',
        letterSpacing: '0.1em', color: 'var(--muted)', textAlign: 'center', marginBottom: '0.5rem',
      }}>
        {meta.competition} · {meta.season}
      </div>

      {/* Team Names + Score */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '1rem', alignItems: 'center', marginBottom: hasPenalties ? '0.25rem' : '0.75rem' }}>
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

      {/* Penalty Score (if applicable) */}
      {hasPenalties && (
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem',
          fontFamily: "'DM Mono', monospace", fontSize: 11, 
          marginBottom: '0.75rem',
        }}>
          <span style={{ color: 'var(--muted)' }}>Penalties</span>
          <span style={{
            background: 'rgba(251, 191, 36, 0.15)',
            color: '#fbbf24',
            padding: '2px 10px',
            borderRadius: 4,
            fontWeight: 600,
          }}>
            {meta.penalty_home} – {meta.penalty_away}
          </span>
        </div>
      )}

      {/* Stats Grid: xG, Shots, Possession - Stacked vertically */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '0.35rem',
        marginBottom: '0.75rem',
        fontFamily: "'DM Mono', monospace",
        fontSize: 11,
      }}>
        {/* xG Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '1rem', alignItems: 'center' }}>
          <div style={{ textAlign: 'right', color: meta.home_color, fontWeight: 600 }}>
            {meta.xg_home?.toFixed(2) ?? '–'}
          </div>
          <div style={{ color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 70, textAlign: 'center' }}>
            xG
          </div>
          <div style={{ textAlign: 'left', color: meta.away_color, fontWeight: 600 }}>
            {meta.xg_away?.toFixed(2) ?? '–'}
          </div>
        </div>

        {/* Shots Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '1rem', alignItems: 'center' }}>
          <div style={{ textAlign: 'right', color: 'var(--text)' }}>
            {meta.shots_home}
          </div>
          <div style={{ color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 70, textAlign: 'center' }}>
            Shots
          </div>
          <div style={{ textAlign: 'left', color: 'var(--text)' }}>
            {meta.shots_away}
          </div>
        </div>

        {/* Possession Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '1rem', alignItems: 'center' }}>
          <div style={{ textAlign: 'right', color: 'var(--text)' }}>
            {ph}%
          </div>
          <div style={{ color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 70, textAlign: 'center' }}>
            Possession
          </div>
          <div style={{ textAlign: 'left', color: 'var(--text)' }}>
            {100 - ph}%
          </div>
        </div>
      </div>

      {/* Possession Bar */}
      <div style={{ height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden', display: 'flex' }}>
        <div style={{ width: `${ph}%`, height: '100%', background: meta.home_color, transition: 'width 0.6s ease' }} />
        <div style={{ flex: 1, height: '100%', background: meta.away_color }} />
      </div>
    </div>
  )
}
