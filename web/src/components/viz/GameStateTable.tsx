import type { GameState } from '../../types'

interface GameStateTableProps {
  gameState: GameState
  home: string
  away: string
  homeColor: string
  awayColor: string
}

interface StatRowProps {
  label: string
  homeBefore: number
  homeAfter: number
  awayBefore: number
  awayAfter: number
  homeColor: string
  awayColor: string
  isPct?: boolean
}

function delta(before: number, after: number): { text: string; color: string } {
  const d = after - before
  return {
    text:  d > 0 ? `+${d}` : `${d}`,
    color: d > 0 ? '#3fb950' : d < 0 ? '#f87171' : '#6e7891',
  }
}

function StatRow({ label, homeBefore, homeAfter, awayBefore, awayAfter, homeColor, awayColor }: StatRowProps) {
  const dh = delta(homeBefore, homeAfter)
  const da = delta(awayBefore, awayAfter)

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '80px 1fr 1fr',
      gap: '0.5rem',
      alignItems: 'center',
      padding: '0.55rem 0',
      borderBottom: '1px solid #272b35',
    }}>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>

      {/* Home */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: homeColor, fontWeight: 600, fontFamily: "'DM Mono', monospace", fontSize: 13 }}>{homeBefore}</span>
        <span style={{ color: 'var(--muted2)' }}>→</span>
        <span style={{ color: '#fff', fontWeight: 700, fontFamily: "'DM Mono', monospace", fontSize: 13 }}>{homeAfter}</span>
        <span style={{ color: dh.color, fontSize: 10, fontFamily: "'DM Mono', monospace" }}>{dh.text}</span>
      </div>

      {/* Away */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: awayColor, fontWeight: 600, fontFamily: "'DM Mono', monospace", fontSize: 13 }}>{awayBefore}</span>
        <span style={{ color: 'var(--muted2)' }}>→</span>
        <span style={{ color: '#fff', fontWeight: 700, fontFamily: "'DM Mono', monospace", fontSize: 13 }}>{awayAfter}</span>
        <span style={{ color: da.color, fontSize: 10, fontFamily: "'DM Mono', monospace" }}>{da.text}</span>
      </div>
    </div>
  )
}

export function GameStateTable({ gameState, home, away, homeColor, awayColor }: GameStateTableProps) {
  if (!gameState.goal_minute) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)', fontSize: 12, fontStyle: 'italic', textAlign: 'center', padding: '1rem' }}>
        No goals scored — comparison not applicable
      </div>
    )
  }

  const { goal_minute, home_before, home_after, away_before, away_after } = gameState

  return (
    <div style={{ padding: '0.25rem 0' }}>
      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: '0.5rem', paddingBottom: '0.4rem', borderBottom: '1px solid #323744', marginBottom: '0.1rem' }}>
        <div />
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: homeColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {home.split(' ').pop()}
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: awayColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {away.split(' ').pop()}
        </div>
      </div>

      <StatRow label="Passes"    homeBefore={home_before.passes}    homeAfter={home_after.passes}    awayBefore={away_before.passes}    awayAfter={away_after.passes}    homeColor={homeColor} awayColor={awayColor} />
      <StatRow label="Shots"     homeBefore={home_before.shots}     homeAfter={home_after.shots}     awayBefore={away_before.shots}     awayAfter={away_after.shots}     homeColor={homeColor} awayColor={awayColor} />
      <StatRow label="Pressures" homeBefore={home_before.pressures} homeAfter={home_after.pressures} awayBefore={away_before.pressures} awayAfter={away_after.pressures} homeColor={homeColor} awayColor={awayColor} />

      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--muted2)', marginTop: '0.6rem', fontStyle: 'italic' }}>
        Before → after first goal at {goal_minute}' · Green = increase · Red = decrease
      </div>
    </div>
  )
}
