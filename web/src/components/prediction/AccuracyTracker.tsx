import { useMemo } from "react";
import type { PredictionMatch } from "../../types";

interface AccuracyTrackerProps {
  predictions: PredictionMatch[];
  windowSize?: number;
}

function topPrediction(predicted: PredictionMatch["predicted"]): string {
  return (Object.entries(predicted) as [string, number][])
    .sort(([, a], [, b]) => b - a)[0][0];
}

function isMatchCorrect(match: PredictionMatch): boolean {
  if (!match.actual) return false;
  const top = topPrediction(match.predicted);
  const outcomeMap: Record<string, string> = { H: "home_win", D: "draw", A: "away_win" };
  return top === outcomeMap[match.actual.outcome];
}

function StatBlock({
  value,
  label,
  color,
}: {
  value: string;
  label: string;
  color?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{
        fontFamily: "'Syne', sans-serif",
        fontSize: "1.9rem",
        fontWeight: 700,
        color: color ?? "#e2e8f0",
        lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: 10,
        color: "#6e7891",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      }}>
        {label}
      </div>
    </div>
  );
}

function Divider() {
  return (
    <div style={{
      width: 1,
      height: 40,
      background: "#272b35",
      flexShrink: 0,
    }} />
  );
}

export function AccuracyTracker({
  predictions,
  windowSize = 20,
}: AccuracyTrackerProps) {
  const stats = useMemo(() => {
    const resolved = predictions.filter(m => m.actual !== null);
    const window = resolved.slice(-windowSize);
    const correct     = window.filter(isMatchCorrect).length;
    const total       = window.length;
    const accuracyPct = total > 0 ? Math.round((correct / total) * 100) : 0;
    const upsets      = resolved.filter(m => m.is_upset).length;
    const upcoming    = predictions.filter(m => m.actual === null).length;

    const confValues  = predictions
      .filter(m => m.actual === null)
      .map(m => Math.max(m.predicted.home_win, m.predicted.draw, m.predicted.away_win));
    const avgConf = confValues.length > 0
      ? Math.round((confValues.reduce((a, b) => a + b, 0) / confValues.length) * 100)
      : null;

    return { correct, total, accuracyPct, upsets, upcoming, avgConf };
  }, [predictions, windowSize]);

  const accColor =
    stats.accuracyPct >= 55 ? "#4ade80"
    : stats.accuracyPct >= 45 ? "#fbbf24"
    : "#f87171";

  return (
    <div style={{
      background: "#161d27",
      border: "1px solid #272b35",
      borderRadius: 10,
      padding: "1.25rem 1.5rem",
      marginBottom: "1.5rem",
      display: "flex",
      alignItems: "center",
      gap: "2rem",
      flexWrap: "wrap",
    }}>
      <StatBlock value={`${stats.correct}/${stats.total}`} label={`Last ${stats.total} Predictions`} />
      <Divider />
      <StatBlock value={`${stats.accuracyPct}%`} label="Accuracy Rate" color={accColor} />
      <Divider />
      <StatBlock value={`${stats.upsets}`} label="Upsets Found" color="#fb923c" />
      <Divider />
      <StatBlock value={`${stats.upcoming}`} label="Upcoming Fixtures" color="#60a5fa" />
      {stats.avgConf !== null && (
        <>
          <Divider />
          <StatBlock value={`${stats.avgConf}%`} label="Avg Confidence" color="#a78bfa" />
        </>
      )}

      <div style={{ marginLeft: "auto", minWidth: 140 }}>
        <div style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 9,
          color: "#4a5168",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 6,
          textAlign: "right",
        }}>
          Rolling Window
        </div>
        <div style={{ height: 4, background: "#272b35", borderRadius: 2, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            background: accColor,
            width: `${stats.accuracyPct}%`,
            borderRadius: 2,
            transition: "width 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
            boxShadow: `0 0 8px ${accColor}55`,
          }} />
        </div>
        <div style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 9,
          color: "#4a5168",
          marginTop: 4,
          display: "flex",
          justifyContent: "space-between",
        }}>
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  );
}
