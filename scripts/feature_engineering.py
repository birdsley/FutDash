#!/usr/bin/env python3
"""
FutDash Phase 3 — Feature Engineering
======================================
Loads xgabora Club Football Match Data CSV files and computes
all model features from the blueprint schema.

xgabora CSV schema (football-data.co.uk standard + ELO columns):
    Div        – League code (E0, SP1, D1, I1, F1, etc.)
    Date       – Match date YYYY-MM-DD
    Time       – Match time HH:MM:SS (optional)
    HomeTeam   – Home team name
    AwayTeam   – Away team name
    FTHG       – Full Time Home Goals
    FTAG       – Full Time Away Goals
    FTR        – Full Time Result (H / D / A)
    HTHG       – Half Time Home Goals  (optional)
    HTAG       – Half Time Away Goals  (optional)
    HTR        – Half Time Result       (optional)
    HS / AS    – Shots Home / Away      (optional)
    HST / AST  – Shots on Target        (optional)
    EloHome    – Home team Elo rating at match time (xgabora column)
    EloAway    – Away team Elo rating at match time (xgabora column)

Output: features_{league_code}.csv  in the output directory.
"""

import os
import sys
import glob
import argparse
import warnings
from collections import defaultdict

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

# ── League metadata ──────────────────────────────────────────────
LEAGUE_META = {
    "E0":  {"name": "Premier League",     "country": "england"},
    "E1":  {"name": "Championship",       "country": "england"},
    "SP1": {"name": "La Liga",            "country": "spain"},
    "SP2": {"name": "La Liga 2",          "country": "spain"},
    "D1":  {"name": "Bundesliga",         "country": "germany"},
    "D2":  {"name": "Bundesliga 2",       "country": "germany"},
    "I1":  {"name": "Serie A",            "country": "italy"},
    "I2":  {"name": "Serie B",            "country": "italy"},
    "F1":  {"name": "Ligue 1",            "country": "france"},
    "F2":  {"name": "Ligue 2",            "country": "france"},
    "N1":  {"name": "Eredivisie",         "country": "netherlands"},
    "P1":  {"name": "Primeira Liga",      "country": "portugal"},
    "T1":  {"name": "Süper Lig",          "country": "turkey"},
    "G1":  {"name": "Super League",       "country": "greece"},
    "B1":  {"name": "First Division A",   "country": "belgium"},
    "SC0": {"name": "Scottish Premiership","country": "scotland"},
}

ROLLING_N = 5   # last N games for rolling stats
ELO_K     = 32  # ELO update K-factor (only used when EloHome/EloAway absent)
ELO_BASE  = 1500


# ── Helpers ──────────────────────────────────────────────────────

def _safe_date(s):
    """Parse dates in YYYY-MM-DD, DD/MM/YYYY, DD/MM/YY formats."""
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d/%m/%y"):
        try:
            return pd.to_datetime(s, format=fmt)
        except Exception:
            pass
    return pd.to_datetime(s, infer_datetime_format=True, errors="coerce")


def _infer_season(date: pd.Timestamp) -> str:
    """Return 'YYYY-YY' season string from a match date."""
    y = date.year
    m = date.month
    if m >= 7:
        return f"{y}-{str(y+1)[2:]}"
    return f"{y-1}-{str(y)[2:]}"


def compute_elo_from_scratch(df: pd.DataFrame, k: int = ELO_K, base: int = ELO_BASE):
    """
    Compute rolling ELO ratings from results when the dataset does not
    include pre-computed ELO columns.  Updates are applied chronologically.
    """
    ratings: dict = {}
    elo_h, elo_a = [], []
    for _, row in df.sort_values("Date").iterrows():
        h = row["HomeTeam"]
        a = row["AwayTeam"]
        rh = ratings.get(h, float(base))
        ra = ratings.get(a, float(base))
        elo_h.append(rh)
        elo_a.append(ra)

        exp_h = 1.0 / (1.0 + 10 ** ((ra - rh) / 400.0))
        ftr = row.get("FTR", "D")
        if ftr == "H":
            result = 1.0
        elif ftr == "A":
            result = 0.0
        else:
            result = 0.5

        ratings[h] = rh + k * (result - exp_h)
        ratings[a] = ra + k * ((1.0 - result) - (1.0 - exp_h))

    idx = df.sort_values("Date").index
    elo_series_h = pd.Series(elo_h, index=idx)
    elo_series_a = pd.Series(elo_a, index=idx)
    return elo_series_h, elo_series_a


def rolling_team_stats(df: pd.DataFrame, n: int = ROLLING_N) -> pd.DataFrame:
    """
    Compute per-team rolling features using only *prior* matches.
    Returns a DataFrame with one row per match containing:
        home_goals_scored_5, home_goals_conceded_5, home_win_pct_5,
        home_form_streak (sum of +1 W / 0 D / -1 L over last N),
        away_goals_scored_5, away_goals_conceded_5, away_win_pct_5,
        away_form_streak
    """
    df = df.sort_values("Date").copy().reset_index(drop=True)

    # For each team maintain a deque of last-N results
    team_hist: dict = defaultdict(list)  # { team: [(goals_for, goals_against, result)] }

    h_scored, h_conceded, h_win_pct, h_streak = [], [], [], []
    a_scored, a_conceded, a_win_pct, a_streak = [], [], [], []

    def _agg(hist):
        if not hist:
            return 0.0, 0.0, 0.5, 0.0
        gf  = np.mean([x[0] for x in hist])
        gc  = np.mean([x[1] for x in hist])
        wp  = np.mean([1.0 if x[2] == "W" else 0.0 for x in hist])
        str_ = sum(1 if x[2] == "W" else (-1 if x[2] == "L" else 0) for x in hist)
        return gf, gc, wp, float(str_)

    for _, row in df.iterrows():
        ht = row["HomeTeam"]
        at = row["AwayTeam"]

        gf_h, gc_h, wp_h, str_h = _agg(team_hist[ht][-n:])
        gf_a, gc_a, wp_a, str_a = _agg(team_hist[at][-n:])

        h_scored.append(gf_h);    h_conceded.append(gc_h)
        h_win_pct.append(wp_h);   h_streak.append(str_h)
        a_scored.append(gf_a);    a_conceded.append(gc_a)
        a_win_pct.append(wp_a);   a_streak.append(str_a)

        # Update history *after* recording pre-match stats
        hg = int(row["FTHG"])
        ag = int(row["FTAG"])
        ftr = row.get("FTR", "D")
        team_hist[ht].append((hg, ag, "W" if ftr == "H" else ("L" if ftr == "A" else "D")))
        team_hist[at].append((ag, hg, "W" if ftr == "A" else ("L" if ftr == "H" else "D")))

    df["home_goals_scored_5"]   = h_scored
    df["home_goals_conceded_5"] = h_conceded
    df["home_win_pct_5"]        = h_win_pct
    df["home_form_streak"]      = h_streak
    df["away_goals_scored_5"]   = a_scored
    df["away_goals_conceded_5"] = a_conceded
    df["away_win_pct_5"]        = a_win_pct
    df["away_form_streak"]      = a_streak
    return df


def compute_h2h(df: pd.DataFrame) -> pd.DataFrame:
    """
    For each match compute the home team's historic win-rate against the away
    team using only prior meetings in the dataset.
    """
    df = df.sort_values("Date").copy().reset_index(drop=True)
    h2h: dict = defaultdict(lambda: [0, 0])  # {(home, away): [home_wins, total]}

    h2h_rates = []
    for _, row in df.iterrows():
        ht = row["HomeTeam"]
        at = row["AwayTeam"]
        key = (ht, at)
        wins, total = h2h[key]
        h2h_rates.append(wins / total if total > 0 else 0.5)

        # Update after recording
        total += 1
        if row.get("FTR", "D") == "H":
            wins += 1
        h2h[key] = [wins, total]

    df["h2h_win_rate"] = h2h_rates
    return df


def compute_league_position(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute a running league table position for each team within each season.
    Returns home_position and away_position columns (lower = better).
    Positions are based on the *previous* gameweek table snapshot.
    """
    df = df.sort_values("Date").copy().reset_index(drop=True)
    if "season" not in df.columns:
        df["season"] = df["Date"].apply(_infer_season)

    home_pos, away_pos = [], []
    # Points table per season
    season_pts: dict = defaultdict(lambda: defaultdict(int))   # {season: {team: pts}}
    season_gd:  dict = defaultdict(lambda: defaultdict(int))   # goal diff tiebreaker

    for _, row in df.iterrows():
        season = row["season"]
        ht = row["HomeTeam"]
        at = row["AwayTeam"]
        pts = season_pts[season]
        gd  = season_gd[season]

        # Position = rank by points DESC, goal-diff DESC (1-indexed)
        teams = set(pts.keys()) | {ht, at}
        ranked = sorted(teams,
                        key=lambda t: (pts.get(t, 0), gd.get(t, 0)),
                        reverse=True)
        rank = {t: i+1 for i, t in enumerate(ranked)}
        home_pos.append(rank.get(ht, len(ranked)))
        away_pos.append(rank.get(at, len(ranked)))

        # Update table after recording
        ftr = row.get("FTR", "D")
        hg = int(row["FTHG"])
        ag = int(row["FTAG"])
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
    """Compute rest days for each team before this match."""
    df = df.sort_values("Date").copy().reset_index(drop=True)
    last_match: dict = {}
    h_rest, a_rest = [], []
    for _, row in df.iterrows():
        ht = row["HomeTeam"]
        at = row["AwayTeam"]
        d  = row["Date"]
        h_rest.append((d - last_match[ht]).days if ht in last_match else 7)
        a_rest.append((d - last_match[at]).days if at in last_match else 7)
        last_match[ht] = d
        last_match[at] = d
    df["home_days_rest"] = h_rest
    df["away_days_rest"] = a_rest
    return df


def encode_target(df: pd.DataFrame) -> pd.DataFrame:
    """Encode FTR into numeric target: 2=HomeWin, 1=Draw, 0=AwayWin."""
    mapping = {"H": 2, "D": 1, "A": 0}
    df["outcome"] = df["FTR"].map(mapping)
    return df


# ── Main pipeline ─────────────────────────────────────────────────

def process_league_file(csv_path: str, output_dir: str, verbose: bool = True) -> pd.DataFrame:
    """
    Full feature engineering pipeline for a single league CSV file.

    Returns the feature DataFrame and writes it to output_dir.
    """
    league_code = os.path.splitext(os.path.basename(csv_path))[0]
    meta = LEAGUE_META.get(league_code, {"name": league_code, "country": "unknown"})

    if verbose:
        print(f"\n  ── {meta['name']} ({league_code}) ──────────────────────────")
        print(f"  Loading: {csv_path}")

    df = pd.read_csv(csv_path, encoding="utf-8", low_memory=False)
    original_len = len(df)

    # ── Normalise column names ────────────────────────────────────
    df.columns = [c.strip() for c in df.columns]

    # Required columns check
    required = {"Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "FTR"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"CSV {csv_path} missing required columns: {missing}")

    # ── Date parsing ──────────────────────────────────────────────
    df["Date"] = _safe_date(df["Date"])
    df = df.dropna(subset=["Date"]).copy()
    df = df.sort_values("Date").reset_index(drop=True)

    # ── Goals to int ──────────────────────────────────────────────
    df["FTHG"] = pd.to_numeric(df["FTHG"], errors="coerce").fillna(0).astype(int)
    df["FTAG"] = pd.to_numeric(df["FTAG"], errors="coerce").fillna(0).astype(int)
    df = df.dropna(subset=["FTR"]).copy()
    df = df[df["FTR"].isin(["H", "D", "A"])].copy()

    if verbose:
        print(f"  Rows after cleaning: {len(df):,} / {original_len:,}")

    # ── Season ───────────────────────────────────────────────────
    df["season"] = df["Date"].apply(_infer_season)

    # ── League info ───────────────────────────────────────────────
    df["league_code"] = league_code
    df["league_name"] = meta["name"]
    df["country"]     = meta["country"]

    # ── ELO ratings ───────────────────────────────────────────────
    # Use xgabora pre-computed ELO if present, else recompute
    if "EloHome" in df.columns and "EloAway" in df.columns:
        df["elo_home"] = pd.to_numeric(df["EloHome"], errors="coerce")
        df["elo_away"] = pd.to_numeric(df["EloAway"], errors="coerce")
        # Fill NaNs by computing from scratch for those rows
        mask = df["elo_home"].isna() | df["elo_away"].isna()
        if mask.any():
            elo_h, elo_a = compute_elo_from_scratch(df, k=ELO_K, base=ELO_BASE)
            df.loc[mask, "elo_home"] = elo_h[mask]
            df.loc[mask, "elo_away"] = elo_a[mask]
        if verbose:
            print(f"  ELO source: xgabora pre-computed  (NaN-fill: {mask.sum()} rows)")
    else:
        elo_h, elo_a = compute_elo_from_scratch(df, k=ELO_K, base=ELO_BASE)
        df["elo_home"] = elo_h.values
        df["elo_away"] = elo_a.values
        if verbose:
            print(f"  ELO source: computed from scratch (K={ELO_K})")

    df["elo_diff"] = df["elo_home"] - df["elo_away"]

    # ── Rolling team features ────────────────────────────────────
    df = rolling_team_stats(df, n=ROLLING_N)

    # ── Head-to-head win rate ────────────────────────────────────
    df = compute_h2h(df)

    # ── League position ───────────────────────────────────────────
    df = compute_league_position(df)

    # ── Rest days ─────────────────────────────────────────────────
    df = days_since_last_match(df)

    # ── Home advantage flag ───────────────────────────────────────
    df["is_home"] = 1   # trivially 1 for every home-team row in this schema

    # ── Target ───────────────────────────────────────────────────
    df = encode_target(df)

    # ── Final feature set ─────────────────────────────────────────
    FEATURE_COLS = [
        "Date", "season", "league_code", "league_name", "country",
        "HomeTeam", "AwayTeam",
        "FTHG", "FTAG", "FTR", "outcome",
        # ELO
        "elo_home", "elo_away", "elo_diff",
        # Rolling team stats
        "home_goals_scored_5", "home_goals_conceded_5",
        "home_win_pct_5", "home_form_streak",
        "away_goals_scored_5", "away_goals_conceded_5",
        "away_win_pct_5", "away_form_streak",
        # Context
        "h2h_win_rate", "is_home",
        "home_days_rest", "away_days_rest",
        "home_league_position", "away_league_position", "league_position_diff",
    ]
    out = df[[c for c in FEATURE_COLS if c in df.columns]].copy()

    # ── Write output ──────────────────────────────────────────────
    os.makedirs(output_dir, exist_ok=True)
    out_path = os.path.join(output_dir, f"features_{league_code}.csv")
    out.to_csv(out_path, index=False)
    if verbose:
        print(f"  ✅ Features written → {out_path}  ({len(out):,} matches, {out.shape[1]} cols)")

    return out


def process_all(data_dir: str, output_dir: str, verbose: bool = True) -> pd.DataFrame:
    """
    Process all CSV files found in data_dir.

    Expected directory structure (mirrors xgabora repo):
        data_dir/
            E0.csv
            SP1.csv
            D1.csv
            ...

    Returns a concatenated DataFrame of all leagues.
    """
    csv_files = sorted(glob.glob(os.path.join(data_dir, "*.csv")))
    if not csv_files:
        raise FileNotFoundError(f"No CSV files found in {data_dir}")

    print(f"\n{'='*60}")
    print(f"  FutDash Feature Engineering Pipeline")
    print(f"  Found {len(csv_files)} league CSV(s) in {data_dir}")
    print(f"{'='*60}")

    frames = []
    errors = []
    for path in csv_files:
        try:
            frame = process_league_file(path, output_dir, verbose=verbose)
            frames.append(frame)
        except Exception as e:
            errors.append((path, str(e)))
            print(f"  ⚠️  Skipped {os.path.basename(path)}: {e}")

    if not frames:
        raise RuntimeError("No league files could be processed.")

    combined = pd.concat(frames, ignore_index=True)
    combined_path = os.path.join(output_dir, "features_all.csv")
    combined.to_csv(combined_path, index=False)

    print(f"\n{'='*60}")
    print(f"  Combined: {len(combined):,} matches across {len(frames)} leagues")
    print(f"  All features → {combined_path}")
    if errors:
        print(f"  ⚠️  {len(errors)} file(s) skipped")
    print(f"{'='*60}\n")

    return combined


# ── CLI ──────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(
        description="FutDash Phase 3 — Feature Engineering from xgabora CSVs")
    p.add_argument("--data-dir",   default="./xgabora-data",
                   help="Directory containing xgabora CSV files")
    p.add_argument("--output-dir", default="./scripts/features",
                   help="Output directory for feature CSV files")
    p.add_argument("--league",     default=None,
                   help="Process a single league file (e.g. E0.csv)")
    p.add_argument("--quiet",      action="store_true")
    args = p.parse_args()

    if args.league:
        path = os.path.join(args.data_dir, args.league)
        if not os.path.exists(path):
            print(f"[ERROR] File not found: {path}")
            sys.exit(1)
        process_league_file(path, args.output_dir, verbose=not args.quiet)
    else:
        process_all(args.data_dir, args.output_dir, verbose=not args.quiet)


if __name__ == "__main__":
    main()
