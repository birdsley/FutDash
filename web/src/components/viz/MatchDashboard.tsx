import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useMatchStore } from '../../store/matchStore'
import { TacticalView }  from './TacticalView'
import { XgFlowChart }   from './XgFlowChart'
import { ShotMap }       from './ShotMap'
import { VaepBars }      from './VaepBars'
import { GameStateTable } from './GameStateTable'

// ── Panel styles ──────────────────────────────────────────────────
// overflow: visible so absolute-positioned tooltips aren't clipped
const panel: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  overflow: 'visible',
}

// For charts with Plotly (VaepBars, XgFlowChart) overflow:hidden is fine
const panelClip: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  overflow: 'hidden',
}

// Panels need a clipping wrapper for the header border-radius only
const panelHead: React.CSSProperties = {
  padding: '0.7rem 1rem',
  borderBottom: '1px solid var(--border)',
  borderRadius: '10px 10px 0 0',
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  flexDirection: 'column',
  background: 'var(--surface)',
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

// ── Container heights ─────────────────────────────────────────────
// Tactical view (combined pitch): tall enough to see all 11 players per side
const tacticalH = 500
// Shot map: wide+tall for visibility
const shotH = 480
const flowH = 280
const vaepH = 220

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

function InsightStrip({ insights }: { insights: string[] }) {
  return (
    <div style={{
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '0.9rem 1.25rem', marginBottom: '1.5rem',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      {insights.map((ins, i) => (
        <div key={i} style={{
          fontSize: 12, color: i === 0 ? 'var(--gold)' : 'var(--muted)',
          display: 'flex', gap: 8,
        }}>
          <span style={{ color: 'var(--muted2)', fontSize: 10, flexShrink: 0, marginTop: 2 }}>—</span>
          {ins}
        </div>
      ))}
    </div>
  )
}

function Skeleton({ height }: { height: number | string }) {
  return (
    <div className="skeleton"
      style={{ height, borderRadius: 10, background: 'var(--border)' }} />
  )
}

function EmptyState() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '60vh', gap: '1rem', color: 'var(--muted2)',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        background: 'var(--surface2)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.4,
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      </div>
      <div style={{
        fontFamily: "'Syne', sans-serif", fontSize: '1.2rem',
        fontWeight: 700, color: 'var(--muted)',
      }}>
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
        <Skeleton height={tacticalH + 60} />
        <Skeleton height={flowH + 60} />
        <Skeleton height={shotH + 60} />
        <div className="dash-grid-2">
          <Skeleton height={vaepH + 60} />
          <Skeleton height={vaepH + 60} />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        color: 'var(--red)', fontFamily: "'DM Mono', monospace",
        fontSize: 12, padding: '2rem',
      }}>
        Error: {error}
      </div>
    )
  }

  if (!currentMatch) return <EmptyState />

  const {
    meta, xg_flow, shots,
    network_home, network_away,
    vaep, game_state, insights,
  } = currentMatch
  const hc = meta.home_color
  const ac = meta.away_color

  return (
    <div style={{ animation: 'fadeInUp 0.3s ease both' }}>
      <style>{`
        @keyframes fadeInUp {
          from { opacity:0; transform:translateY(8px); }
          to   { opacity:1; transform:none; }
        }
        /* Two-column: side-by-side on desktop, stacked on mobile */
        .dash-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.25rem;
          margin-bottom: 1.25rem;
        }
        .dash-mb { margin-bottom: 1.25rem; }
        @media (max-width: 768px) {
          .dash-grid-2 { grid-template-columns: 1fr; }
        }
      `}</style>

      {insights.length > 0 && <InsightStrip insights={insights} />}

      {/* ══ SECTION 1: Tactical Structure — combined full-pitch ══ */}
      <SectionHeader num={1} title="Tactical Structure"
        question="How did both teams build play? Home (left) vs Away (right)" />

      <div className="dash-mb" style={panel}>
        <div style={panelHead}>
          <p style={panelTitle}>
            <span style={{ color: hc }}>{meta.home}</span>
            <span style={{ color: 'var(--muted)', margin: '0 0.5rem' }}>vs</span>
            <span style={{ color: ac }}>{meta.away}</span>
            {' '}— Combined Pass Network
          </p>
          <p style={panelSub}>
            Home on left half · Away mirrored to right · Gold = playmaker ·
            Click node to isolate connections · Hover for stats
          </p>
        </div>
        {/* TacticalView needs an explicit pixel height so SVG can fill it */}
        <div style={{ width: '100%', height: tacticalH, position: 'relative' }}>
          <TacticalView
            networkHome={network_home}
            networkAway={network_away}
            homeColor={hc}
            awayColor={ac}
            home={meta.home}
            away={meta.away}
          />
        </div>
      </div>

      {/* xG flow — full width */}
      <div className="dash-mb" style={panelClip}>
        <div style={panelHead}>
          <p style={panelTitle}>xG Flow — Cumulative Chance Quality Over Time</p>
          <p style={panelSub}>
            Each step up = a shot taken · Dashed verticals = goals · Shaded = territorial pressure
          </p>
        </div>
        <div style={{ height: flowH }}>
          <XgFlowChart
            xgFlow={xg_flow}
            home={meta.home} away={meta.away}
            homeColor={hc}  awayColor={ac}
            shots={shots}
            meta={meta}
          />
        </div>
      </div>

      {/* ══ SECTION 2: Chance Creation — enlarged shot map ══ */}
      <SectionHeader num={2} title="Chance Creation"
        question="Where did shots originate? Hover any shot for details" />

      <div className="dash-mb" style={panel}>
        <div style={panelHead}>
          <p style={panelTitle}>Shot Map — Both Teams</p>
          <p style={panelSub}>
            Both teams attack right · ★ = goal (colored by team) ·
            Circle size = √xG · Hover for player & details
          </p>
        </div>
        <div style={{ width: '100%', height: shotH, position: 'relative' }}>
          <ShotMap
            shots={shots}
            home={meta.home} away={meta.away}
            homeColor={hc} awayColor={ac}
          />
        </div>
      </div>

      {/* ══ SECTION 3: Individual Impact ══ */}
      <SectionHeader num={3} title="Individual Impact"
        question="Who made the biggest contribution?" />

      <div className="dash-grid-2">
        <div style={panelClip}>
          <div style={panelHead}>
            <p style={{ ...panelTitle, color: hc }}>{meta.home} — Player Value (VAEP)</p>
            <p style={panelSub}>Value Added by Each Action vs possession chain xG expectation</p>
          </div>
          <div style={{ height: vaepH }}>
            <VaepBars players={vaep.home} teamColor={hc} teamName={meta.home} />
          </div>
        </div>

        <div style={panelClip}>
          <div style={panelHead}>
            <p style={{ ...panelTitle, color: ac }}>{meta.away} — Player Value (VAEP)</p>
            <p style={panelSub}>Value Added by Each Action vs possession chain xG expectation</p>
          </div>
          <div style={{ height: vaepH }}>
            <VaepBars players={vaep.away} teamColor={ac} teamName={meta.away} />
          </div>
        </div>
      </div>

      {/* ══ SECTION 4: Game State ══ */}
      <SectionHeader num={4} title="Game State Effects"
        question="Did the match change after the first goal?" />

      <div className="dash-grid-2">
        <div style={panelClip}>
          <div style={panelHead}>
            <p style={panelTitle}>Before vs After First Goal</p>
            <p style={panelSub}>
              {game_state.goal_minute
                ? `Split at minute ${game_state.goal_minute}'`
                : 'No goals — comparison not available'}
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

        <div style={panelClip}>
          <div style={panelHead}>
            <p style={panelTitle}>Match Summary</p>
            <p style={panelSub}>Key metrics at a glance</p>
          </div>
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {([
              { label: 'Goals',      h: meta.score_home,                  a: meta.score_away },
              { label: 'xG',         h: (meta.xg_home ?? 0).toFixed(2),  a: (meta.xg_away ?? 0).toFixed(2) },
              { label: 'Shots',      h: meta.shots_home,                  a: meta.shots_away },
              { label: 'Possession', h: `${meta.possession_home}%`,       a: `${100 - meta.possession_home}%` },
            ] as const).map(({ label, h, a }) => (
              <div key={label}
                style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', alignItems: 'center', gap: 8 }}>
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
    </div>
  )
}
