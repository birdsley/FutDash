import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useMatchStore } from '../../store/matchStore'
import { PassNetwork }   from './PassNetwork'
import { XgFlowChart }   from './XgFlowChart'
import { ShotMap }       from './ShotMap'
import { VaepBars }      from './VaepBars'
import { GameStateTable } from './GameStateTable'

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

// Pitch panels: use aspect-ratio to preserve 120:80 = 3:2 ratio
// This ensures the pitch is not distorted regardless of container width
const pitchContainer: React.CSSProperties = {
  width: '100%',
  // 80/120 = 0.667 → padding-top trick for aspect ratio
  position: 'relative',
  paddingTop: '66.7%', // 80/120 * 100%
}

const pitchInner: React.CSSProperties = {
  position: 'absolute',
  top: 0, left: 0, right: 0, bottom: 0,
}

const grid2: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '1.25rem',
  marginBottom: '1.25rem',
}

const grid1: React.CSSProperties = {
  marginBottom: '1.25rem',
}

const chartH: React.CSSProperties = { height: 280 }
const chartHsm: React.CSSProperties = { height: 220 }

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
          <span style={{ color: 'var(--muted2)', fontSize: 10, flexShrink: 0, marginTop: 2 }}>—</span>
          {ins}
        </div>
      ))}
    </div>
  )
}

// ── Skeleton placeholder ──────────────────────────────────────────
function Skeleton({ height }: { height: number | string }) {
  return (
    <div
      className="skeleton"
      style={{ height, borderRadius: 10, background: 'var(--border)' }}
    />
  )
}

// ── Empty state ───────────────────────────────────────────────────
function EmptyState() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '60vh', gap: '1rem', color: 'var(--muted2)',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        background: 'var(--surface2)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: 0.4,
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 8v4M12 16h.01"/>
        </svg>
      </div>
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
  const { id } = useParams<{ id?: string }>()
  const { currentMatch, isLoading, error, loadMatch } = useMatchStore()

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
          <Skeleton height={300} />
          <Skeleton height={300} />
        </div>
        <Skeleton height={280} />
        <div style={grid2}>
          <Skeleton height={300} />
          <Skeleton height={300} />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ color: 'var(--red)', fontFamily: "'DM Mono', monospace", fontSize: 12, padding: '2rem' }}>
        Error: {error}
      </div>
    )
  }

  if (!currentMatch) return <EmptyState />

  const { meta, xg_flow, shots, network_home, network_away, vaep, game_state, insights } = currentMatch
  const hc = meta.home_color
  const ac = meta.away_color

  return (
    <div style={{ animation: 'fadeInUp 0.3s ease both' }}>

      {insights.length > 0 && <InsightStrip insights={insights} />}

      {/* ── Section 1: Tactical Structure ── */}
      <SectionHeader num={1} title="Tactical Structure" question="How did both teams build play?" />

      {/* Pass networks with proper pitch aspect ratio */}
      <div style={grid2}>
        <div style={panel}>
          <div style={panelHeader}>
            <p style={{ ...panelTitle, color: hc }}>{meta.home} — Pass Network</p>
            <p style={panelSub}>Node size = pass involvement · Gold = playmaker · Click node to highlight connections</p>
          </div>
          {/* Pitch container with preserved aspect ratio */}
          <div style={pitchContainer}>
            <div style={pitchInner}>
              <PassNetwork network={network_home} teamColor={hc} teamName={meta.home} />
            </div>
          </div>
        </div>

        <div style={panel}>
          <div style={panelHeader}>
            <p style={{ ...panelTitle, color: ac }}>{meta.away} — Pass Network</p>
            <p style={panelSub}>Mirror view · Node size = pass involvement · Gold = playmaker</p>
          </div>
          <div style={pitchContainer}>
            <div style={pitchInner}>
              <PassNetwork network={network_away} teamColor={ac} teamName={meta.away} />
            </div>
          </div>
        </div>
      </div>

      {/* xG flow — full width */}
      <div style={grid1}>
        <div style={panel}>
          <div style={panelHeader}>
            <p style={panelTitle}>xG Flow — Cumulative Chance Quality Over Time</p>
            <p style={panelSub}>Each step up = a shot taken · Dashed verticals = goals scored</p>
          </div>
          <div style={chartH}>
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
      <SectionHeader num={2} title="Chance Creation" question="Where did shots come from?" />

      {/* Shot map with pitch aspect ratio */}
      <div style={grid1}>
        <div style={panel}>
          <div style={panelHeader}>
            <p style={panelTitle}>Shot Map — Both Teams</p>
            <p style={panelSub}>
              Home attacks right · Away attacks left · Star = goal · Size = xG value
            </p>
          </div>
          <div style={pitchContainer}>
            <div style={pitchInner}>
              <ShotMap
                shots={shots}
                home={meta.home} away={meta.away}
                homeColor={hc} awayColor={ac}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 3: Individual Impact ── */}
      <SectionHeader num={3} title="Individual Impact" question="Who made the difference?" />

      <div style={grid2}>
        <div style={panel}>
          <div style={panelHeader}>
            <p style={{ ...panelTitle, color: hc }}>{meta.home} — Player Value</p>
            <p style={panelSub}>VAEP: value added by each action relative to expected possession chain xG</p>
          </div>
          <div style={chartHsm}>
            <VaepBars players={vaep.home} teamColor={hc} teamName={meta.home} />
          </div>
        </div>

        <div style={panel}>
          <div style={panelHeader}>
            <p style={{ ...panelTitle, color: ac }}>{meta.away} — Player Value</p>
            <p style={panelSub}>VAEP: value added by each action relative to expected possession chain xG</p>
          </div>
          <div style={chartHsm}>
            <VaepBars players={vaep.away} teamColor={ac} teamName={meta.away} />
          </div>
        </div>
      </div>

      {/* ── Section 4: Game State ── */}
      <SectionHeader num={4} title="Game State Effects" question="Did the match change after the first goal?" />

      <div style={grid2}>
        <div style={panel}>
          <div style={panelHeader}>
            <p style={panelTitle}>Before vs After First Goal</p>
            <p style={panelSub}>
              {game_state.goal_minute
                ? `Comparison split at minute ${game_state.goal_minute}`
                : 'No goals scored in this match'}
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

        {/* Match summary */}
        <div style={panel}>
          <div style={panelHeader}>
            <p style={panelTitle}>Match Summary</p>
            <p style={panelSub}>Key metrics at a glance</p>
          </div>
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { label: 'Goals',      h: meta.score_home,                  a: meta.score_away },
              { label: 'xG',         h: (meta.xg_home ?? 0).toFixed(2),  a: (meta.xg_away ?? 0).toFixed(2) },
              { label: 'Shots',      h: meta.shots_home,                  a: meta.shots_away },
              { label: 'Possession', h: `${meta.possession_home}%`,       a: `${100 - meta.possession_home}%` },
            ].map(({ label, h, a }) => (
              <div key={label} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', alignItems: 'center', gap: 8 }}>
                <div style={{ textAlign: 'right', fontFamily: "'Syne', sans-serif", fontSize: 17, fontWeight: 700, color: hc }}>
                  {h}
                </div>
                <div style={{ textAlign: 'center', fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {label}
                </div>
                <div style={{ textAlign: 'left', fontFamily: "'Syne', sans-serif", fontSize: 17, fontWeight: 700, color: ac }}>
                  {a}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: none; }
        }
        @media (max-width: 900px) {
          .match-grid-2 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
