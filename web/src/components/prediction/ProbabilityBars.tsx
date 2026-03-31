import { useEffect, useRef, useState } from "react";

export interface ProbabilitySet {
  home_win: number;
  draw: number;
  away_win: number;
}

interface ProbabilityBarsProps {
  predicted: ProbabilitySet;
  homeColor: string;
  awayColor: string;
  actualOutcome?: "H" | "D" | "A" | null;
  animationDelay?: number; // ms before animation starts
}

interface BarRowProps {
  label: string;
  value: number;          // 0–1
  color: string;
  isActual: boolean;
  animateToWidth: boolean;
  delay: number;
}

function BarRow({ label, value, color, isActual, animateToWidth, delay }: BarRowProps) {
  const [width, setWidth] = useState(0);
  const pct = Math.round(value * 100);

  useEffect(() => {
    if (!animateToWidth) return;
    const timer = setTimeout(() => setWidth(pct), delay);
    return () => clearTimeout(timer);
  }, [animateToWidth, pct, delay]);

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "60px 1fr 36px",
      gap: "8px",
      alignItems: "center",
    }}>
      {/* Label */}
      <div style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: "10px",
        color: isActual ? "#e2e8f0" : "#6e7891",
        fontWeight: isActual ? "600" : "400",
        letterSpacing: "0.03em",
      }}>
        {label}
        {isActual && (
          <span style={{ marginLeft: 4, color: "#4ade80", fontSize: 9 }}>✓</span>
        )}
      </div>

      {/* Track + fill */}
      <div style={{
        height: 6,
        background: "#272b35",
        borderRadius: 3,
        overflow: "hidden",
        position: "relative",
      }}>
        <div style={{
          height: "100%",
          borderRadius: 3,
          background: color,
          width: `${width}%`,
          transition: `width 600ms cubic-bezier(0.4, 0, 0.2, 1) ${delay}ms`,
          opacity: isActual ? 1.0 : 0.75,
          boxShadow: isActual ? `0 0 8px ${color}55` : "none",
        }} />
      </div>

      {/* Value */}
      <div style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: "10px",
        color: isActual ? "#e2e8f0" : "#6e7891",
        textAlign: "right",
        fontWeight: isActual ? "600" : "400",
      }}>
        {pct}%
      </div>
    </div>
  );
}

export function ProbabilityBars({
  predicted,
  homeColor,
  awayColor,
  actualOutcome,
  animationDelay = 0,
}: ProbabilityBarsProps) {
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Trigger animation when component becomes visible
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setTimeout(() => setMounted(true), animationDelay);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [animationDelay]);

  const bars: Array<{
    key: keyof ProbabilitySet;
    label: string;
    color: string;
    outcomeCode: "H" | "D" | "A";
  }> = [
    { key: "home_win", label: "Home Win", color: homeColor, outcomeCode: "H" },
    { key: "draw",     label: "Draw",     color: "#6e7891",  outcomeCode: "D" },
    { key: "away_win", label: "Away Win", color: awayColor,  outcomeCode: "A" },
  ];

  return (
    <div
      ref={ref}
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      {bars.map((bar, i) => (
        <BarRow
          key={bar.key}
          label={bar.label}
          value={predicted[bar.key]}
          color={bar.color}
          isActual={actualOutcome === bar.outcomeCode}
          animateToWidth={mounted}
          delay={i * 80}
        />
      ))}
    </div>
  );
}
