import { useMatchStore } from '../store/matchStore'
import { getScorers, groupScorers, formatMinute, type Scorer } from '../lib/scorers'

// Past this many goals for one side, list each player once with all their minutes
const GROUP_THRESHOLD = 5

const MINUTE = { fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--muted)' } as const
const NAME = { fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 500, color: 'var(--text)' } as const
const TAG = { fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--muted)', marginLeft: '0.35em' } as const

const NAME_CELL = {
  fontFamily: "'Syne', sans-serif", fontSize: '1.1rem', fontWeight: 700,
  // Explicit line box + a little bottom room so descenders (g, y, p, j, q)
  // never sit on the edge of the cell, whatever the inherited line-height.
  lineHeight: 1.25, paddingBottom: '0.1em', overflow: 'visible',
  textWrap: 'balance',
} as const

function ScorerList({ scorers, side, color, grouped }: {
  scorers: Scorer[]; side: 'home' | 'away'; color: string; grouped: boolean
}) {
  if (scorers.length === 0) return <div className={`sb-scorers sb-scorers-${side}`} />
  const home = side === 'home'
  return (
    <ul
      className={`sb-scorers sb-scorers-${side}`}
      aria-label={`${side === 'home' ? 'Home' : 'Away'} goals`}
      style={{
        listStyle: 'none', margin: 0, padding: 0,
        justifySelf: home ? 'end' : 'start',
        display: 'flex', flexDirection: 'column', gap: '0.35rem',
        alignItems: home ? 'flex-end' : 'flex-start',
        // Team colour lives only in this rule on the edge facing the stats
        [home ? 'borderRight' : 'borderLeft']: `2px solid ${color}`,
        [home ? 'paddingRight' : 'paddingLeft']: '0.75rem',
      }}
    >
      {grouped
        ? groupScorers(scorers).map((g, i) => (
          <li key={i} style={{ maxWidth: '22rem', lineHeight: 1.45, textAlign: home ? 'right' : 'left' }}>
            <span style={NAME}>{g.name}</span>
            {g.isOwnGoal && <span style={TAG}>(OG)</span>}
            <span style={{ ...MINUTE, marginLeft: '0.45rem' }}>
              {g.goals.map((m, j) => (
                <span key={j} style={{ whiteSpace: 'nowrap' }}>
                  {formatMinute(m.minute, m.period)}
                  {m.isPen && <span style={TAG}>(pen)</span>}
                  {j < g.goals.length - 1 && ', '}
                </span>
              ))}
            </span>
          </li>
        ))
        : scorers.map((s, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem', whiteSpace: 'nowrap', lineHeight: 1.45 }}>
            <span style={{ ...MINUTE, minWidth: '3ch', textAlign: 'right' }}>
              {formatMinute(s.minute, s.period)}
            </span>
            <span style={NAME}>
              {s.name}
              {s.isPen && <span style={TAG}>(pen)</span>}
              {s.isOwnGoal && <span style={TAG}>(OG)</span>}
            </span>
          </li>
        ))}
    </ul>
  )
}

export default function ScoreBanner() {
  const { currentMatch } = useMatchStore()
  if (!currentMatch) return null
  const { meta, shots, own_goals } = currentMatch
  const ph = meta.possession_home ?? 50
  const homeScorers = getScorers(shots, 'home', own_goals)
  const awayScorers = getScorers(shots, 'away', own_goals)
  // Both sides switch together so the two columns read the same way
  const grouped = Math.max(homeScorers.length, awayScorers.length) > GROUP_THRESHOLD

  const hasPenalties = meta.has_penalties && 
    meta.penalty_home != null && 
    meta.penalty_away != null

  return (
    <div className="sb-banner" style={{
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
        <div className="sb-name" style={{ ...NAME_CELL, color: meta.home_color, textAlign: 'right' }}>
          {meta.home}
        </div>
        <div className="sb-score" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: "'Syne', sans-serif", fontSize: '2.4rem', fontWeight: 800, color: '#fff' }}>
          <span>{meta.score_home}</span>
          <span style={{ color: 'var(--muted)', fontSize: '1.8rem', fontWeight: 300 }}>–</span>
          <span>{meta.score_away}</span>
        </div>
        <div className="sb-name" style={{ ...NAME_CELL, color: meta.away_color, textAlign: 'left' }}>
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

      {/* Home scorers | stats | away scorers. Equal outer tracks keep the stats centred. */}
      <div className="sb-stats-row" style={{
        display: 'grid', gridTemplateColumns: '1fr auto 1fr', columnGap: '1.5rem',
        alignItems: 'start', marginBottom: '0.75rem',
      }}>
      <ScorerList scorers={homeScorers} side="home" color={meta.home_color} grouped={grouped} />

      {/* Stats Grid: xG, Shots, Possession - Stacked vertically */}
      <div className="sb-stats" style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        // Fixed width so every row's 1fr tracks match and the labels stay in one column
        width: 230,
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
            {+(100 - ph).toFixed(1)}%
          </div>
        </div>
      </div>

      <ScorerList scorers={awayScorers} side="away" color={meta.away_color} grouped={grouped} />
      </div>

      {/* Possession Bar */}
      <div style={{ height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden', display: 'flex' }}>
        <div style={{ width: `${ph}%`, height: '100%', background: meta.home_color, transition: 'width 0.6s ease' }} />
        <div style={{ flex: 1, height: '100%', background: meta.away_color }} />
      </div>

      <style>{`
        @media (max-width: 768px) {
          .sb-banner { padding: 0.85rem 1rem !important; }
          .sb-name { font-size: 0.95rem !important; min-width: 0; overflow-wrap: anywhere; }
          .sb-score { font-size: 2rem !important; }
          .sb-stats-row {
            grid-template-columns: 1fr 1fr !important;
            grid-template-areas: "stats stats" "home away";
            row-gap: 0.75rem;
          }
          .sb-stats { grid-area: stats; justify-self: center; max-width: 100%; }
          .sb-scorers-home { grid-area: home; }
          .sb-scorers-away { grid-area: away; }
          .sb-scorers li { white-space: normal !important; }
        }
      `}</style>
    </div>
  )
}
