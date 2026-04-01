import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useMatchStore } from '../store/matchStore'
import { PassNetwork }    from '../components/viz/PassNetwork'
import { XgFlowChart }   from '../components/viz/XgFlowChart'
import { ShotMap }        from '../components/viz/ShotMap'
import { VaepBars }       from '../components/viz/VaepBars'
import { GameStateTable } from '../components/viz/GameStateTable'

// ── Design tokens ─────────────────────────────────────────────────
const panel: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  overflow: 'hidden',
}

const panelHeader: React.CSSProperties = {
  padding: '0.7rem 1rem',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  flexDirection: 'column',
}

const panelTitle: React.CSSProperties = {
  fontFamily: "'Syne', sans-serif",
  fontSize: 12,
  fontWeight: 700,
  color: '#fff',
  margin: 0,
}

const panelSub: React.CSSProperties = {
  fontFamily: "'DM Mono', monospace",
  fontSize: 10,
  color: 'var(--muted)',
  margin: 0,
}

const chartH    = { height: 340 }
const chartHlg  = { height: 280 }
const chartHsm  = { height: 220 }

const grid2: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '1.25rem',
  marginBottom: '1.25rem',
}

const grid1: React.CSSProperties = {
  marginBottom: '1.25rem',
}

// ── Section header ────────────────────────────────────────────────
function SectionHeader({ num, title, question }: { num: number; title: string; question: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: '1rem',
      paddingBottom: '1rem', borderBottom: '1px solid var(--border)',
      marginBottom: '1.25rem',
    }}>
      <div style={{
        fontFamily: "'Syne', sans-serif", fontSize: '3rem', fontWeight: 800,
        opacity: 0.07, lineHeight: 1, flexShrink: 0, color: '#fff',
      }}>
        {num}
      </div>
      <div>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', marginTop: 2 }}>
          {question}
        </div>
      </div>
    </div>
  )
}

// ── Insight strip ─────────────────────────────────────────────────
function InsightStrip({ insights }: { insights: string[] }) {
  return (
    <div style={{
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '0.9rem 1.25rem', marginBottom: '1.5rem',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      {insights.map((ins, i) => (
        <div key={i} style={{ fontSize: 12, color: i === 0 ? 'var(--gold)' : 'var(--muted)', display: 'flex', gap: 8 }}>
          <span style={{ color: 'var(--muted2)', fontSize: 10, flexShrink: 0, marginTop: 2 }}>▸</span>
          {ins}
        </div>
      ))}
    </div>
  )
}

// ── Skeleton placeholder ──────────────────────────────────────────
function Skeleton({ height }: { height: number }) {
  return (
    <div
      className="skeleton"
      style={{ height, borderRadius: 10, background: 'var(--border)' }}
    />
  )
}

// ── Empty / error states ──────────────────────────────────────────
function EmptyState() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '60vh', gap: '1rem', color: 'var(--muted2)',
    }}>
      <div style={{ fontSize: '3rem', opacity: 0.3 }}>⚽</div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: '1.2rem', fontWeight: 700, color: 'var(--muted)' }}>
        Select a match to begin
      </div>
      <div style={{ fontSize: 12, maxWidth: 280, textAlign: 'center', lineHeight: 1.7 }}>
        Choose a competition and match from the sidebar to load the full analytics dashboard.
      </div>
    </div>
  )
}

// ── Main dashboard ────────────────────────────────────────────────
export default function MatchDashboard() {
  const { id }                             = useParams<{ id?: string }>()
  const { currentMatch, isLoading, error, loadMatch } = useMatchStore()

  // If navigated to /match/:id directly, load that match
  useEffect(() => {
    if (id && !currentMatch) {
      loadMatch(parseInt(id, 10))
    }
  }, [id, currentMatch, loadMatch])

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <Skeleton height={60} />
        <div style={grid2}>
          <Skeleton height={340} />
          <Skeleton height={340} />
        </div>
        <Skeleton height={280} />
        <div style={grid2}>
          <Skeleton height={340} />
          <Skeleton height={340} />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ color: 'var(--red)', fontFamily: "'DM Mono', monospace", fontSize: 12, padding: '2rem' }}>
        ✗ {error}
      </div>
    )
  }

  if (!currentMatch) return <EmptyState />

  const { meta, xg_flow, shots, network_home, network_away, vaep, game_state, insights } = currentMatch
  const hc = meta.home_color
  const ac = meta.away_color

  return (
    <div style={{ animation: 'fadeInUp 0.3s ease both' }}>
      {/* Insights */}
      {insights.length > 0 && <InsightStrip insights={insights} />}

      {/* ── Section 1: Tactical Structure ── */}
      <SectionHeader num={1} title="Tactical Structure" question="How did both teams build play?" />

      <div style={grid2}>
        {/* Home pass network */}
        <div style={panel}>
          <div style={panelHeader}>
            <p style={{ ...panelTitle, color: hc }}>{meta.home}</p>
            <p style={panelSub}>Pass Network · Click node to highlight edges</p>
          </div>
          <div style={chartH}>
            <PassNetwork network={network_home} teamColor={hc} teamName={meta.home} />
          </div>
        </div>

        {/* Away pass network */}
        <div style={panel}>
          <div style={panelHeader}>
            <p style={{ ...panelTitle, color: ac }}>{meta.away}</p>
            <p style={panelSub}>Pass Network · Mirror view</p>
          </div>
          <div style={chartH}>
            <PassNetwork network={network_away} teamColor={ac} teamName={meta.away} />
          </div>
        </div>
      </div>

      {/* xG flow — full width */}
      <div style={grid1}>
        <div style={panel}>
          <div style={panelHeader}>
            <p style={panelTitle}>xG Flow — How Did Chances Build?</p>
            <p style={panelSub}>Steeper slope = burst of danger · Dashed lines = goals · Faint area = final-third pressure</p>
          </div>
          <div style={chartHlg}>
            <XgFlowChart
              xgFlow={xg_flow}
              home={meta.home} away={meta.away}
              homeColor={hc}  awayColor={ac}
              shots={shots}
            />
          </div>
        </div>
      </div>

      {/* ── Section 2: Chance Creation ── */}
      <SectionHeader num={2} title="Chance Creation" question="Where did danger come from?" />

      <div style={grid2}>
        {/* Possession origins */}
        <div style={panel}>
          <div style={panelHeader}>
            <p style={panelTitle}>Possession Origins → Shots</p>
            <p style={panelSub}>Arrow = possession start → shot endpoint</p>
          </div>
          <div style={chartH}>
            <ShotMap
              shots={shots} home={meta.home} away={meta.away}
              homeColor={hc} awayColor={ac} arrowMode
            />
          </div>
        </div>

        {/* Shot map */}
        <div style={panel}>
          <div style={panelHeader}>
            <p style={panelTitle}>Shot Map — Both Teams</p>
            <p style={panelSub}>Both teams attack right · Gold star = goal · Size = xG</p>
          </div>
          <div style={chartH}>
            <ShotMap
              shots={shots} home={meta.home} away={meta.away}
              homeColor={hc} awayColor={ac}
            />
          </div>
        </div>
      </div>

      {/* ── Section 3: Individual Impact ── */}
      <SectionHeader num={3} title="Individual Impact" question="Who made the difference?" />

      <div style={grid2}>
        {/* Home VAEP */}
        <div style={panel}>
          <div style={panelHeader}>
            <p style={{ ...panelTitle, color: hc }}>{meta.home} — VAEP</p>
            <p style={panelSub}>Value Added by Expected Possession · role badge shown</p>
          </div>
          <div style={chartHsm}>
            <VaepBars players={vaep.home} teamColor={hc} teamName={meta.home} />
          </div>
        </div>

        {/* Away VAEP */}
        <div style={panel}>
          <div style={panelHeader}>
            <p style={{ ...panelTitle, color: ac }}>{meta.away} — VAEP</p>
            <p style={panelSub}>Value Added by Expected Possession · role badge shown</p>
          </div>
          <div style={chartHsm}>
            <VaepBars players={vaep.away} teamColor={ac} teamName={meta.away} />
          </div>
        </div>
      </div>

      {/* ── Section 4: Game State ── */}
      <SectionHeader num={4} title="Game State Effects" question="Did the match change after goals?" />

      <div style={grid2}>
        {/* Game state table */}
        <div style={panel}>
          <div style={panelHeader}>
            <p style={panelTitle}>Before vs After Goal</p>
            <p style={panelSub}>
              {game_state.goal_minute
                ? `First goal at ${game_state.goal_minute}'`
                : 'No goals scored'}
            </p>
          </div>
          <div style={{ padding: '1rem' }}>
            <GameStateTable
              gameState={game_state}
              home={meta.home} away={meta.away}
              homeColor={hc}  awayColor={ac}
            />
          </div>
        </div>

        {/* Summary stats panel */}
        <div style={panel}>
          <div style={panelHeader}>
            <p style={panelTitle}>Match Summary</p>
            <p style={panelSub}>Key metrics at a glance</p>
          </div>
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Goals',      h: meta.score_home,                    a: meta.score_away },
              { label: 'xG',        h: (meta.xg_home ?? 0).toFixed(2),    a: (meta.xg_away ?? 0).toFixed(2) },
              { label: 'Shots',      h: meta.shots_home,                    a: meta.shots_away },
              { label: 'Possession', h: `${meta.possession_home}%`,        a: `${100 - meta.possession_home}%` },
            ].map(({ label, h, a }) => (
              <div key={label} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', alignItems: 'center', gap: 8 }}>
                <div style={{ textAlign: 'right', fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700, color: hc }}>
                  {h}
                </div>
                <div style={{ textAlign: 'center', fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {label}
                </div>
                <div style={{ textAlign: 'left', fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700, color: ac }}>
                  {a}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile responsive override */}
      <style>{`
        @media (max-width: 768px) {
          .match-grid-2 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
