import { useState, useMemo } from "react";
import type { PredictionMatch } from "../types";
import { PredictionCard } from "../components/prediction/PredictionCard";
import { AccuracyTracker } from "../components/prediction/AccuracyTracker";

interface ForecastViewProps {
  allPredictions?: PredictionMatch[];
  onViewMatch?: (matchId: number) => void;
}

function formatGroupDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

function maxProb(p: PredictionMatch["predicted"]): number {
  return Math.max(p.home_win, p.draw, p.away_win);
}

function confidenceLabel(p: PredictionMatch["predicted"]): {
  text: string;
  color: string;
  bg: string;
} {
  const mp = maxProb(p);
  if (mp > 0.60) return { text: "Strong",    color: "#4ade80", bg: "#052e16" };
  if (mp > 0.55) return { text: "High",       color: "#a78bfa", bg: "#1a1040" };
  if (mp > 0.45) return { text: "Moderate",   color: "#fbbf24", bg: "#261f0a" };
  return              { text: "Contested", color: "#60a5fa", bg: "#0c1f3a" };
}

const LEAGUE_OPTIONS = [
  { value: "all",            label: "🌍 All Leagues" },
  { value: "Premier League", label: "🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League" },
  { value: "La Liga",        label: "🇪🇸 La Liga" },
  { value: "Bundesliga",     label: "🇩🇪 Bundesliga" },
  { value: "Serie A",        label: "🇮🇹 Serie A" },
  { value: "Ligue 1",        label: "🇫🇷 Ligue 1" },
];

function ForecastSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {[1, 2].map(i => (
        <div key={i}>
          <div style={{
            height: 12, width: 200,
            background: "#272b35", borderRadius: 4,
            marginBottom: 12,
            animation: "pulse 1.8s ease-in-out infinite",
          }} />
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 12,
          }}>
            {[1, 2, 3].map(j => (
              <div key={j} style={{
                height: 180, borderRadius: 10,
                background: "#161d27",
                border: "1px solid #272b35",
                animation: "pulse 1.8s ease-in-out infinite",
                animationDelay: `${j * 0.15}s`,
              }} />
            ))}
          </div>
        </div>
      ))}
      <style>{`@keyframes pulse{0%,100%{opacity:.4}50%{opacity:.8}}`}</style>
    </div>
  );
}

export function ForecastView({ allPredictions = [], onViewMatch }: ForecastViewProps) {
  const [selectedLeague, setSelectedLeague] = useState("all");
  const isLoading = false;

  const upcoming = useMemo(
    () => allPredictions.filter(m => m.actual === null),
    [allPredictions]
  );

  const filtered = useMemo(() => {
    if (selectedLeague === "all") return upcoming;
    return upcoming.filter(m =>
      (m as PredictionMatch & { league_name?: string }).league_name === selectedLeague
    );
  }, [upcoming, selectedLeague]);

  const grouped = useMemo(() => {
    const map = new Map<string, PredictionMatch[]>();
    for (const m of filtered) {
      const key = m.date.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const nextMonday = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = ((7 - day + 1) % 7) || 7;
    d.setDate(d.getDate() + diff);
    d.setHours(6, 0, 0, 0);
    return d.toLocaleDateString("en-GB", {
      weekday: "short", day: "numeric", month: "short",
    });
  }, []);

  if (isLoading) return <ForecastSkeleton />;

  return (
    <div>
      {allPredictions.filter(m => m.actual !== null).length > 0 && (
        <AccuracyTracker predictions={allPredictions} windowSize={20} />
      )}

      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        marginBottom: "1.5rem",
        flexWrap: "wrap",
      }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#6e7891" }}>
          League:
        </div>

        <select
          value={selectedLeague}
          onChange={e => setSelectedLeague(e.target.value)}
          style={{
            background: "#1a2235",
            border: "1px solid #272b35",
            color: "#e2e8f0",
            fontFamily: "'DM Mono', monospace",
            fontSize: 11,
            padding: "6px 10px",
            borderRadius: 6,
            cursor: "pointer",
            outline: "none",
            minWidth: 180,
          }}
        >
          {LEAGUE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <div style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 10,
          background: "#0c1f3a",
          color: "#60a5fa",
          padding: "3px 10px",
          borderRadius: 99,
        }}>
          {filtered.length} fixture{filtered.length !== 1 ? "s" : ""}
        </div>

        <div style={{
          marginLeft: "auto",
          fontFamily: "'DM Mono', monospace",
          fontSize: 10,
          color: "#4a5168",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "#4ade80",
            display: "inline-block",
            boxShadow: "0 0 6px #4ade80",
            animation: "blink 2s ease-in-out infinite",
          }} />
          Model refreshes weekly · Next: {nextMonday} 06:00 UTC
        </div>
      </div>

      {grouped.length === 0 && (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "4rem 2rem",
          color: "#4a5168",
          textAlign: "center",
          gap: "1rem",
        }}>
          <div style={{ fontSize: "2.5rem", opacity: 0.3 }}>🔭</div>
          <div style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: "1rem",
            fontWeight: 700,
            color: "#6e7891",
          }}>
            No upcoming fixtures
          </div>
          <div style={{ fontSize: 12, maxWidth: 280, lineHeight: 1.7 }}>
            Upcoming matches will appear here after the weekly model refresh.
            Predictions are generated every Monday at 06:00 UTC.
          </div>
        </div>
      )}

      {grouped.map(([date, matches], groupIdx) => (
        <div key={date} style={{ marginBottom: "2rem" }}>
          <div style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "#4a5168",
            marginBottom: "0.75rem",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            <span>{formatGroupDate(date)}</span>
            <div style={{ flex: 1, height: 1, background: "#272b35" }} />
            <span style={{ color: "#323744" }}>{matches.length} match{matches.length !== 1 ? "es" : ""}</span>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "1rem",
          }}>
            {matches.map((m, i) => {
              const conf = confidenceLabel(m.predicted);
              return (
                <div key={m.match_id} style={{ position: "relative" }}>
                  <div style={{
                    position: "absolute",
                    top: -8,
                    right: 12,
                    zIndex: 2,
                    background: conf.bg,
                    color: conf.color,
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 9,
                    padding: "2px 8px",
                    borderRadius: 99,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    border: `1px solid ${conf.color}33`,
                  }}>
                    {conf.text}
                  </div>
                  <PredictionCard
                    match={m}
                    onViewMatch={onViewMatch}
                    animationDelay={groupIdx * 150 + i * 80}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>
    </div>
  );
}
