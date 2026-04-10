import { useMemo, useState } from "react";
import type { PredictionMatch } from "../types";
import { PredictionCard } from "../components/prediction/PredictionCard";
import { AccuracyTracker } from "../components/prediction/AccuracyTracker";
import { useMatchStore } from "../store/matchStore";

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

function PredictionsSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ height: 100, borderRadius: 10, background: "#161d27", border: "1px solid #272b35", animation: "pulse 1.8s ease-in-out infinite" }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} style={{ height: 200, borderRadius: 10, background: "#161d27", border: "1px solid #272b35", animation: "pulse 1.8s ease-in-out infinite", animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:.4}50%{opacity:.8}}`}</style>
    </div>
  );
}

export function PredictionsView({ predictions, onViewMatch }: PredictionsViewProps) {
  const { isPredictionsLoading, loadPredictions } = useMatchStore();
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

  if (isPredictionsLoading) return <PredictionsSkeleton />;

  if (resolved.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "4rem 2rem", color: "#4a5168", textAlign: "center", gap: "1rem" }}>
        <div style={{ fontSize: "2.5rem", opacity: 0.3 }}>📊</div>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: "1.1rem", fontWeight: 700, color: "#6e7891" }}>
          No predictions loaded yet
        </div>
        <div style={{ fontSize: 12, maxWidth: 320, lineHeight: 1.7 }}>
          Predictions are generated weekly from the LightGBM model trained on 230,000+ matches across 38 leagues. If this is a fresh deploy, they may still be loading.
        </div>
        <button
          onClick={() => loadPredictions()}
          style={{
            fontFamily: "'DM Mono', monospace", fontSize: 11,
            padding: "8px 20px", borderRadius: 8,
            border: "1px solid var(--border2)",
            background: "var(--surface2)", color: "var(--text)",
            cursor: "pointer", marginTop: 8,
          }}
        >
          Retry loading predictions
        </button>
      </div>
    );
  }

  return (
    <div>
      <AccuracyTracker predictions={predictions} windowSize={20} />

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
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
              fontFamily: "'DM Mono', monospace", fontSize: 10,
              padding: "4px 12px", borderRadius: 99,
              border: "1px solid",
              borderColor: filterOutcome === opt.value ? "#4ade80" : "#272b35",
              background: filterOutcome === opt.value ? "rgba(74,222,128,0.08)" : "transparent",
              color: filterOutcome === opt.value ? "#4ade80" : "#6e7891",
              cursor: "pointer", transition: "all 0.15s",
              textTransform: "uppercase" as const, letterSpacing: "0.05em",
            }}
          >
            {opt.label}
          </button>
        ))}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#4a5168" }}>Sort:</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortBy)}
            style={{
              background: "#1a2235", border: "1px solid #272b35",
              color: "#e2e8f0", fontFamily: "'DM Mono', monospace",
              fontSize: 10, padding: "4px 8px", borderRadius: 6,
              cursor: "pointer", outline: "none",
            }}
          >
            <option value="date_desc">Newest First</option>
            <option value="date_asc">Oldest First</option>
            <option value="confidence">Confidence ↓</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: "3rem", color: "#4a5168", textAlign: "center" }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: "1rem", fontWeight: 700, color: "#6e7891", marginBottom: "0.5rem" }}>
            No predictions match this filter
          </div>
          <div style={{ fontSize: 12 }}>Try selecting a different category above.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1rem" }}>
          {filtered.slice(0, 100).map((match, i) => (
            <PredictionCard
              key={match.match_id}
              match={match}
              onViewMatch={onViewMatch}
              animationDelay={i * 30}
            />
          ))}
        </div>
      )}

      {filtered.length > 100 && (
        <div style={{ textAlign: "center", marginTop: "1rem", color: "var(--muted)", fontFamily: "'DM Mono', monospace", fontSize: 11 }}>
          Showing 100 of {filtered.length} matches — use filters to narrow results
        </div>
      )}
    </div>
  );
}
