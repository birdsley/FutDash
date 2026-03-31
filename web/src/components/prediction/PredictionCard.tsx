import { ProbabilityBars, type ProbabilitySet } from "./ProbabilityBars";

// ── Types ─────────────────────────────────────────────────────────
export interface PredictionMatch {
  match_id: string;
  date: string;                 // "YYYY-MM-DD"
  home: string;
  away: string;
  home_color: string;
  away_color: string;
  predicted: ProbabilitySet;
  actual: {
    home_goals: number;
    away_goals: number;
    outcome: "H" | "D" | "A";
  } | null;
  is_upset: boolean;
  has_statsbomb: boolean;
  statsbomb_match_id: number | null;
}

interface PredictionCardProps {
  match: PredictionMatch;
  onViewMatch?: (matchId: number) => void;
  animationDelay?: number;
}

// ── Helpers ───────────────────────────────────────────────────────
function formatDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

function topPrediction(predicted: ProbabilitySet): keyof ProbabilitySet {
  return (Object.entries(predicted) as [keyof ProbabilitySet, number][])
    .sort(([, a], [, b]) => b - a)[0][0];
}

function isCorrect(match: PredictionMatch): boolean {
  if (!match.actual) return false;
  const top = topPrediction(match.predicted);
  const outcomeMap: Record<"H" | "D" | "A", keyof ProbabilitySet> = {
    H: "home_win",
    D: "draw",
    A: "away_win",
  };
  return top === outcomeMap[match.actual.outcome];
}

function maxProb(predicted: ProbabilitySet): number {
  return Math.max(predicted.home_win, predicted.draw, predicted.away_win);
}

// ── Badge ─────────────────────────────────────────────────────────
type BadgeVariant = "upset" | "correct" | "wrong" | "future" | "confident";

const BADGE_STYLES: Record<BadgeVariant, React.CSSProperties> = {
  upset:     { background: "#3d1f0f", color: "#fb923c" },
  correct:   { background: "#052e16", color: "#4ade80" },
  wrong:     { background: "#3d0f0f", color: "#f87171" },
  future:    { background: "#0c1f3a", color: "#60a5fa" },
  confident: { background: "#1a1040", color: "#a78bfa" },
};

function Badge({ variant, label }: { variant: BadgeVariant; label: string }) {
  return (
    <span style={{
      ...BADGE_STYLES[variant],
      fontFamily: "'DM Mono', monospace",
      fontSize: 9,
      padding: "3px 8px",
      borderRadius: 99,
      textTransform: "uppercase" as const,
      letterSpacing: "0.06em",
      flexShrink: 0,
      fontWeight: 500,
    }}>
      {label}
    </span>
  );
}

function getBadge(match: PredictionMatch): React.ReactElement {
  if (match.actual) {
    if (match.is_upset)           return <Badge variant="upset"   label="⚡ Upset" />;
    if (isCorrect(match))         return <Badge variant="correct" label="✓ Correct" />;
    return                               <Badge variant="wrong"   label="✗ Wrong" />;
  }
  const mp = maxProb(match.predicted);
  if (mp > 0.55)  return <Badge variant="confident" label="High Confidence" />;
  return                 <Badge variant="future"    label="Predicted" />;
}

// ── Card ──────────────────────────────────────────────────────────
export function PredictionCard({
  match,
  onViewMatch,
  animationDelay = 0,
}: PredictionCardProps) {
  const correct = match.actual ? isCorrect(match) : null;

  const cardBorder = match.is_upset
    ? "1px solid #3d1f0f"
    : correct === false
    ? "1px solid #3d0f0f"
    : correct === true
    ? "1px solid #0d2618"
    : "1px solid #272b35";

  return (
    <div style={{
      background: "#161d27",
      border: cardBorder,
      borderRadius: 10,
      padding: "1.25rem",
      transition: "transform 0.15s, box-shadow 0.15s",
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 24px rgba(0,0,0,0.3)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.transform = "";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "";
      }}
    >
      {/* Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: "1rem",
        gap: 8,
      }}>
        <div style={{ minWidth: 0 }}>
          {/* Team names */}
          <div style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: 14,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap" as const,
          }}>
            <span style={{ color: match.home_color }}>{match.home}</span>
            <span style={{ color: "#4a5168", fontSize: 12 }}>vs</span>
            <span style={{ color: match.away_color }}>{match.away}</span>
          </div>
          {/* Date */}
          <div style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 10,
            color: "#4a5168",
            marginTop: 3,
          }}>
            {formatDate(match.date)}
          </div>
        </div>
        {getBadge(match)}
      </div>

      {/* Probability bars */}
      <div style={{ marginBottom: "1rem" }}>
        <ProbabilityBars
          predicted={match.predicted}
          homeColor={match.home_color}
          awayColor={match.away_color}
          actualOutcome={match.actual?.outcome ?? null}
          animationDelay={animationDelay}
        />
      </div>

      {/* Footer: result or upcoming */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingTop: "0.75rem",
        borderTop: "1px solid #272b35",
        fontFamily: "'DM Mono', monospace",
        fontSize: 11,
        color: "#6e7891",
        gap: 8,
      }}>
        {match.actual ? (
          <>
            <span>
              Result:{" "}
              <span style={{ fontSize: 14, fontWeight: 500, color: "#e2e8f0" }}>
                {match.actual.home_goals}–{match.actual.away_goals}
              </span>
            </span>
            {match.has_statsbomb && match.statsbomb_match_id && onViewMatch && (
              <button
                onClick={() => onViewMatch(match.statsbomb_match_id!)}
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 10,
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: "1px solid #323744",
                  background: "transparent",
                  color: "#6e7891",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.05em",
                  whiteSpace: "nowrap" as const,
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "#4ade80";
                  (e.currentTarget as HTMLButtonElement).style.color = "#4ade80";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "#323744";
                  (e.currentTarget as HTMLButtonElement).style.color = "#6e7891";
                }}
              >
                View Analysis →
              </button>
            )}
          </>
        ) : (
          <span style={{ color: "#60a5fa", fontFamily: "'DM Mono', monospace", fontSize: 10 }}>
            Upcoming fixture
          </span>
        )}
      </div>
    </div>
  );
}
