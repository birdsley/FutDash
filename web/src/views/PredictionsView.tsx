import { useMemo, useState } from "react";
import type { PredictionMatch } from "../types";
import { PredictionCard } from "../components/prediction/PredictionCard";
import { AccuracyTracker } from "../components/prediction/AccuracyTracker";

interface PredictionsViewProps {
  predictions: PredictionMatch[];
  onViewMatch?: (matchId: number) => void;
}

type FilterOutcome = "all" | "correct" | "wrong" | "upset";
type SortBy = "date_desc" | "date_asc" | "confidence";

function topPrediction(predicted: PredictionMatch["predicted"]): string {
  return Object.entries(predicted).sort(([, a], [, b]) => b - a)[0][0];
}

function isCorrect(match: PredictionMatch): boolean {
  if (!match.actual) return false;
  const top = topPrediction(match.predicted);
  const map: Record<string, string> = { H: "home_win", D: "draw", A: "away_win" };
  return top === map[match.actual.outcome];
}

export function PredictionsView({ predictions, onViewMatch }: PredictionsViewProps) {
  const [filterOutcome, setFilterOutcome] = useState<FilterOutcome>("all");
  const [sortBy, setSortBy] = useState<SortBy>("date_desc");

  const resolved = useMemo(
    () => predictions.filter(m => m.actual !== null),
    [predictions]
  );

  const filtered = useMemo(() => {
    let result = [...resolved];

    switch (filterOutcome) {
      case "correct": result = result.filter(isCorrect); break;
      case "wrong":   result = result.filter(m => !isCorrect(m) && !m.is_upset); break;
      case "upset":   result = result.filter(m => m.is_upset); break;
    }

    switch (sortBy) {
      case "date_asc":
        result.sort((a, b) => a.date.localeCompare(b.date)); break;
      case "confidence":
        result.sort((a, b) =>
          Math.max(b.predicted.home_win, b.predicted.draw, b.predicted.away_win) -
          Math.max(a.predicted.home_win, a.predicted.draw, a.predicted.away_win)
        ); break;
      default:
        result.sort((a, b) => b.date.localeCompare(a.date)); break;
    }

    return result;
  }, [resolved, filterOutcome, sortBy]);

  const correctCount = resolved.filter(isCorrect).length;
  const upsetCount   = resolved.filter(m => m.is_upset).length;

  return (
    <div>
      <AccuracyTracker predictions={predictions} windowSize={20} />

      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        marginBottom: "1.5rem",
        flexWrap: "wrap",
      }}>
        {(
          [
            { value: "all",     label: `All (${resolved.length})` },
            { value: "correct", label: `✓ Correct (${correctCount})` },
            { value: "wrong",   label: `✗ Wrong (${resolved.length - correctCount - upsetCount})` },
            { value: "upset",   label: `⚡ Upsets (${upsetCount})` },
          ] as { value: FilterOutcome; label: string }[]
        ).map(opt => (
          <button
            key={opt.value}
            onClick={() => setFilterOutcome(opt.value)}
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 10,
              padding: "4px 12px",
              borderRadius: 99,
              border: "1px solid",
              borderColor: filterOutcome === opt.value ? "#4ade80" : "#272b35",
              background: filterOutcome === opt.value ? "rgba(74,222,128,0.08)" : "transparent",
              color: filterOutcome === opt.value ? "#4ade80" : "#6e7891",
              cursor: "pointer",
              transition: "all 0.15s",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {opt.label}
          </button>
        ))}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#4a5168" }}>
            Sort:
          </span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortBy)}
            style={{
              background: "#1a2235",
              border: "1px solid #272b35",
              color: "#e2e8f0",
              fontFamily: "'DM Mono', monospace",
              fontSize: 10,
              padding: "4px 8px",
              borderRadius: 6,
              cursor: "pointer",
              outline: "none",
            }}
          >
            <option value="date_desc">Newest First</option>
            <option value="date_asc">Oldest First</option>
            <option value="confidence">Confidence ↓</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 && (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "4rem",
          color: "#4a5168",
          textAlign: "center",
        }}>
          <div style={{ fontSize: "2.5rem", opacity: 0.3, marginBottom: "1rem" }}>📊</div>
          <div style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: "1rem",
            fontWeight: 700,
            color: "#6e7891",
            marginBottom: "0.5rem",
          }}>
            No predictions match this filter
          </div>
          <div style={{ fontSize: 12 }}>Try selecting a different category above.</div>
        </div>
      )}

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        gap: "1rem",
      }}>
        {filtered.map((match, i) => (
          <PredictionCard
            key={match.match_id}
            match={match}
            onViewMatch={onViewMatch}
            animationDelay={i * 40}
          />
        ))}
      </div>
    </div>
  );
}
