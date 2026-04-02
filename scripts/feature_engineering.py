#!/usr/bin/env python3
"""
FutDash Phase 3 — Feature Engineering (xgabora native schema)
==============================================================
Reads the two xgabora CSVs exactly as they are shipped:

  xgabora-data/Matches.csv
    League, Date, Time, Home, Away, HG, AG        ← actual col names
    (plus optional: Season, Country, HxG, AxG, HS, AS, …)

  xgabora-data/EloRatings.csv
    date, club, country, elo                       ← snapshot table

The script:
  1. Normalises the Matches schema → internal standard names
     (HomeTeam, AwayTeam, FTHG, FTAG, FTR, Date, league_code)
  2. Looks up ELO for each team from the nearest prior EloRatings snapshot
  3. Computes all rolling features (form, goals, H2H, position, rest days)
  4. Writes scripts/features/features_all.csv consumed by train_model.py

Usage:
    python scripts/feature_engineering.py                         # uses defaults
    python scripts/feature_engineering.py --data-dir ./xgabora-data
"""

import os
import sys
import argparse
import warnings
from collections import defaultdict

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

ROLLING_N = 5    # last-N games for rolling stats
ELO_BASE  = 1500 # fallback ELO when no snapshot available

# ── Column aliases ─────────────────────────────────────────────────
# Maps every known variant in xgabora/football-data CSVs → canonical name
_COL_ALIASES = {
    # Home team
    "home":     "HomeTeam", "hometeam": "HomeTeam",
    # Away team
    "away":     "AwayTeam", "awayteam": "AwayTeam",
    # Home goals
    "hg":       "FTHG", "fthg": "FTHG", "hgoals": "FTHG",
    "homegoals":"FTHG", "home_goals": "FTHG", "score_home": "FTHG",
    # Away goals
    "ag":       "FTAG", "ftag": "FTAG", "agoals": "FTAG",
    "awaygoals":"FTAG", "away_goals": "FTAG", "score_away": "FTAG",
    # Result
    "ftr":      "FTR", "res": "FTR", "result": "FTR",
    # Date
    "date":     "Date",
    # League
    "league":   "league_code", "div": "league_code", "division": "league_code",
    "competition": "league_code",
    # Season (optional)
    "season":   "season",
    # Country (optional)
    "country":  "country",
    # xG (optional, not used for features but preserved)
    "hxg":      "xg_home", "axg": "xg_away",
}


def _normalise_cols(df: pd.DataFrame) -> pd.DataFrame:
    """Rename columns using alias map, case-insensitively."""
    rename = {}
    for col in df.columns:
        key = col.strip().lower().replace(" ", "_")
        if key in _COL_ALIASES:
            rename[col] = _COL_ALIASES[key]
    return df.rename(columns=rename)


def _parse_date(series: pd.Series) -> pd.Series:
    """Try multiple date formats in order."""
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d/%m/%y", "%m/%d/%Y"):
        try:
            return pd.to_datetime(series, format=fmt)
        except Exception:
            pass
    return pd.to_datetime(series, infer_datetime_format=True, errors="coerce")


def _infer_season(date: pd.Timestamp) -> str:
    y, m = date.year, date.month
    return f"{y}-{str(y+1)[2:]}" if m >= 7 else f"{y-1}-{str(y)[2:]}"


def _derive_ftr(df: pd.DataFrame) -> pd.DataFrame:
    """Compute FTR from FTHG/FTAG when it's absent."""
    if "FTR" not in df.columns:
        df["FTHG"] = pd.to_numeric(df["FTHG"], errors="coerce")
        df["FTAG"] = pd.to_numeric(df["FTAG"], errors="coerce")
        conds = [df["FTHG"] > df["FTAG"], df["FTHG"] < df["FTAG"]]
        df["FTR"] = np.select(conds, ["H", "A"], default="D")
    return df


# ── ELO lookup ─────────────────────────────────────────────────────

def build_elo_lookup(elo_path: str) -> pd.DataFrame:
    """
    Load EloRatings.csv and return a sorted DataFrame suitable for
    as-of lookups: (date, club) → elo.

    EloRatings schema:  date | club | country | elo
    """
    if not os.path.exists(elo_path):
        print(f"  ⚠️  EloRatings not found at {elo_path} — will use fallback ELO={ELO_BASE}")
        return pd.DataFrame(columns=["date", "club", "elo"])

    elo = pd.read_csv(elo_path, low_memory=False)
    elo.columns = [c.strip().lower() for c in elo.columns]
    elo["date"] = _parse_date(elo["date"])
    elo["elo"]  = pd.to_numeric(elo["elo"], errors="coerce")
    elo = elo.dropna(subset=["date", "club", "elo"]).sort_values("date").reset_index(drop=True)
    print(f"  ✅  EloRatings loaded: {len(elo):,} snapshots for {elo['club'].nunique():,} clubs")
    return elo


def _lookup_elo(club: str, match_date: pd.Timestamp,
                elo_df: pd.DataFrame, cache: dict) -> float:
    """Return the most recent ELO for `club` strictly before `match_date`."""
    key = (club, match_date)
    if key in cache:
        return cache[key]
    if elo_df.empty:
        return ELO_BASE
    sub = elo_df[(elo_df["club"] == club) & (elo_df["date"] < match_date)]
    val = float(sub["elo"].iloc[-1]) if not sub.empty else ELO_BASE
    cache[key] = val
    return val


def attach_elo(df: pd.DataFrame, elo_df: pd.DataFrame) -> pd.DataFrame:
    """Add elo_home, elo_away, elo_diff columns to the match DataFrame."""
    print("  Attaching ELO ratings …")
    cache: dict = {}
    elo_home, elo_away = [], []
    for _, row in df.iterrows():
        elo_home.append(_lookup_elo(row["HomeTeam"], row["Date"], elo_df, cache))
        elo_away.append(_lookup_elo(row["AwayTeam"], row["Date"], elo_df, cache))
    df["elo_home"] = elo_home
    df["elo_away"] = elo_away
    df["elo_diff"] = df["elo_home"] - df["elo_away"]
    return df


# ── Rolling features ───────────────────────────────────────────────

def rolling_team_stats(df: pd.DataFrame, n: int = ROLLING_N) -> pd.DataFrame:
    """
    Per-team rolling stats computed from *prior* matches only.
    Adds: home/away _goals_scored_5, _goals_conceded_5, _win_pct_5, _form_streak.
    """
    df = df.sort_values("Date").copy().reset_index(drop=True)
    team_hist: dict = defaultdict(list)   # {team: [(gf, gc, result_str)]}

    h_scored, h_conceded, h_wp, h_streak = [], [], [], []
    a_scored, a_conceded, a_wp, a_streak = [], [], [], []

    def _agg(hist):
        if not hist:
            return 0.0, 0.0, 0.5, 0.0
        gf  = float(np.mean([x[0] for x in hist]))
        gc  = float(np.mean([x[1] for x in hist]))
        wp  = float(np.mean([1.0 if x[2] == "W" else 0.0 for x in hist]))
        st  = float(sum(1 if x[2] == "W" else (-1 if x[2] == "L" else 0) for x in hist))
        return gf, gc, wp, st

    for _, row in df.iterrows():
        ht, at = row["HomeTeam"], row["AwayTeam"]
        gf_h, gc_h, wp_h, st_h = _agg(team_hist[ht][-n:])
        gf_a, gc_a, wp_a, st_a = _agg(team_hist[at][-n:])

        h_scored.append(gf_h); h_conceded.append(gc_h)
        h_wp.append(wp_h);     h_streak.append(st_h)
        a_scored.append(gf_a); a_conceded.append(gc_a)
        a_wp.append(wp_a);     a_streak.append(st_a)

        hg, ag = int(row["FTHG"]), int(row["FTAG"])
        ftr    = str(row.get("FTR", "D"))
        team_hist[ht].append((hg, ag, "W" if ftr == "H" else ("L" if ftr == "A" else "D")))
        team_hist[at].append((ag, hg, "W" if ftr == "A" else ("L" if ftr == "H" else "D")))

    df["home_goals_scored_5"]   = h_scored
    df["home_goals_conceded_5"] = h_conceded
    df["home_win_pct_5"]        = h_wp
    df["home_form_streak"]      = h_streak
    df["away_goals_scored_5"]   = a_scored
    df["away_goals_conceded_5"] = a_conceded
    df["away_win_pct_5"]        = a_wp
    df["away_form_streak"]      = a_streak
    return df


def compute_h2h(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values("Date").copy().reset_index(drop=True)
    h2h: dict = defaultdict(lambda: [0, 0])   # {(home,away): [home_wins, total]}
    rates = []
    for _, row in df.iterrows():
        ht, at = row["HomeTeam"], row["AwayTeam"]
        w, tot = h2h[(ht, at)]
        rates.append(w / tot if tot > 0 else 0.5)
        tot += 1
        if str(row.get("FTR", "D")) == "H":
            w += 1
        h2h[(ht, at)] = [w, tot]
    df["h2h_win_rate"] = rates
    return df


def compute_league_position(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values("Date").copy().reset_index(drop=True)
    if "season" not in df.columns:
        df["season"] = df["Date"].apply(_infer_season)

    home_pos, away_pos = [], []
    season_pts: dict = defaultdict(lambda: defaultdict(int))
    season_gd:  dict = defaultdict(lambda: defaultdict(int))

    for _, row in df.iterrows():
        season, ht, at = row["season"], row["HomeTeam"], row["AwayTeam"]
        pts, gd = season_pts[season], season_gd[season]
        teams  = set(pts.keys()) | {ht, at}
        ranked = sorted(teams, key=lambda t: (pts.get(t, 0), gd.get(t, 0)), reverse=True)
        rank   = {t: i + 1 for i, t in enumerate(ranked)}
        home_pos.append(rank.get(ht, len(ranked)))
        away_pos.append(rank.get(at, len(ranked)))

        hg, ag = int(row["FTHG"]), int(row["FTAG"])
        ftr    = str(row.get("FTR", "D"))
        if ftr == "H":
            pts[ht] = pts.get(ht, 0) + 3
        elif ftr == "A":
            pts[at] = pts.get(at, 0) + 3
        else:
            pts[ht] = pts.get(ht, 0) + 1
            pts[at] = pts.get(at, 0) + 1
        gd[ht] = gd.get(ht, 0) + (hg - ag)
        gd[at] = gd.get(at, 0) + (ag - hg)

    df["home_league_position"] = home_pos
    df["away_league_position"] = away_pos
    df["league_position_diff"] = [h - a for h, a in zip(home_pos, away_pos)]
    return df


def days_since_last_match(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values("Date").copy().reset_index(drop=True)
    last_match: dict = {}
    h_rest, a_rest = [], []
    for _, row in df.iterrows():
        ht, at, d = row["HomeTeam"], row["AwayTeam"], row["Date"]
        h_rest.append((d - last_match[ht]).days if ht in last_match else 7)
        a_rest.append((d - last_match[at]).days if at in last_match else 7)
        last_match[ht] = d
        last_match[at] = d
    df["home_days_rest"] = h_rest
    df["away_days_rest"] = a_rest
    return df


def encode_target(df: pd.DataFrame) -> pd.DataFrame:
    mapping = {"H": 2, "D": 1, "A": 0}
    df["outcome"] = df["FTR"].map(mapping)
    return df


# ── Main loader ────────────────────────────────────────────────────

def load_matches(matches_path: str) -> pd.DataFrame:
    """
    Load xgabora's Matches.csv, normalise column names, parse dates,
    derive FTR, and return a clean DataFrame.
    """
    print(f"  Loading: {matches_path}")
    df = pd.read_csv(matches_path, low_memory=False)
    original_len = len(df)

    # Normalise column names
    df = _normalise_cols(df)

    # Check required fields (after normalisation)
    required = {"HomeTeam", "AwayTeam", "FTHG", "FTAG", "Date"}
    missing  = required - set(df.columns)
    if missing:
        raise ValueError(
            f"After column normalisation, still missing: {missing}\n"
            f"  Columns found: {list(df.columns)}\n"
            f"  Check that Matches.csv has home/away team and goals columns."
        )

    # Parse dates
    df["Date"] = _parse_date(df["Date"])
    df = df.dropna(subset=["Date"]).copy()

    # Numeric goals
    df["FTHG"] = pd.to_numeric(df["FTHG"], errors="coerce").fillna(0).astype(int)
    df["FTAG"] = pd.to_numeric(df["FTAG"], errors="coerce").fillna(0).astype(int)

    # Derive FTR if missing
    df = _derive_ftr(df)

    # Keep only valid results
    df = df[df["FTR"].isin(["H", "D", "A"])].copy()

    # League code — use whatever column is present, or create a placeholder
    if "league_code" not in df.columns:
        df["league_code"] = "UNK"

    # Season
    if "season" not in df.columns:
        df["season"] = df["Date"].apply(_infer_season)

    df = df.sort_values("Date").reset_index(drop=True)
    print(f"  Rows after cleaning: {len(df):,} / {original_len:,}")
    return df


# ── Pipeline ───────────────────────────────────────────────────────

def build_features(matches_path: str, elo_path: str, output_dir: str,
                   verbose: bool = True) -> pd.DataFrame:

    print(f"\n{'='*60}")
    print(f"  FutDash Feature Engineering Pipeline")
    print(f"{'='*60}\n")

    # 1. Load and normalise matches
    df = load_matches(matches_path)

    # 2. Load ELO lookup table
    elo_df = build_elo_lookup(elo_path)

    # 3. Attach ELO (as-of lookup from snapshot table)
    df = attach_elo(df, elo_df)

    # 4. Rolling team statistics
    print("  Computing rolling team stats …")
    df = rolling_team_stats(df, n=ROLLING_N)

    # 5. Head-to-head
    print("  Computing head-to-head rates …")
    df = compute_h2h(df)

    # 6. League position
    print("  Computing league positions …")
    df = compute_league_position(df)

    # 7. Rest days
    print("  Computing rest days …")
    df = days_since_last_match(df)

    # 8. Home flag + target
    df["is_home"] = 1
    df = encode_target(df)

    # 9. Select output columns (keep only what downstream scripts need)
    FEATURE_COLS = [
        "Date", "season", "league_code",
        "HomeTeam", "AwayTeam",
        "FTHG", "FTAG", "FTR", "outcome",
        # ELO
        "elo_home", "elo_away", "elo_diff",
        # Rolling
        "home_goals_scored_5", "home_goals_conceded_5",
        "home_win_pct_5", "home_form_streak",
        "away_goals_scored_5", "away_goals_conceded_5",
        "away_win_pct_5", "away_form_streak",
        # Context
        "h2h_win_rate", "is_home",
        "home_days_rest", "away_days_rest",
        "home_league_position", "away_league_position",
        "league_position_diff",
    ]
    out = df[[c for c in FEATURE_COLS if c in df.columns]].copy()

    # 10. Write outputs
    os.makedirs(output_dir, exist_ok=True)
    out_path = os.path.join(output_dir, "features_all.csv")
    out.to_csv(out_path, index=False)

    # Also write a per-league file if league_code is meaningful
    if out["league_code"].nunique() > 1:
        for lc, grp in out.groupby("league_code"):
            safe = str(lc).replace("/", "-").replace("\\", "-")
            lp   = os.path.join(output_dir, f"features_{safe}.csv")
            grp.to_csv(lp, index=False)
            if verbose:
                print(f"  → {lp}  ({len(grp):,} matches)")

    print(f"\n{'='*60}")
    print(f"  Total matches in features : {len(out):,}")
    print(f"  Date range                : {out['Date'].min().date()} → {out['Date'].max().date()}")
    print(f"  Leagues                   : {out['league_code'].nunique()}")
    print(f"  Features written → {out_path}")
    print(f"{'='*60}\n")
    return out


# ── CLI ──────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(
        description="FutDash — Feature engineering from xgabora CSVs"
    )
    p.add_argument(
        "--data-dir", default="./xgabora-data",
        help="Directory containing Matches.csv and EloRatings.csv",
    )
    p.add_argument(
        "--matches",  default=None,
        help="Direct path to Matches.csv (overrides --data-dir)",
    )
    p.add_argument(
        "--elo",      default=None,
        help="Direct path to EloRatings.csv (overrides --data-dir)",
    )
    p.add_argument(
        "--output-dir", default="./scripts/features",
        help="Where to write features_all.csv (default: ./scripts/features)",
    )
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args()

    matches_path = args.matches or os.path.join(args.data_dir, "Matches.csv")
    elo_path     = args.elo     or os.path.join(args.data_dir, "EloRatings.csv")

    if not os.path.exists(matches_path):
        print(f"[ERROR] Matches.csv not found at: {matches_path}")
        sys.exit(1)

    build_features(
        matches_path = matches_path,
        elo_path     = elo_path,
        output_dir   = args.output_dir,
        verbose      = not args.quiet,
    )


if __name__ == "__main__":
    main()
