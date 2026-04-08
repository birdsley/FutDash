#!/usr/bin/env python3
"""
FutDash Phase 3 — Feature Engineering
=======================================
Loads xgabora Matches.csv + EloRatings.csv and produces
feature CSVs consumed by train_model.py and generate_predictions.py.

Input files (from xgabora dataset):
    ./xgabora-data/Matches.csv     — match results + stats (2000–2025)
    ./xgabora-data/EloRatings.csv  — bi-monthly ELO snapshots

Output:
    ./scripts/features/features_{league_code}.csv   — per-league feature files
    ./scripts/features/features_all.csv              — combined (for model training)

Column reference (Matches.csv):
    Division, MatchDate, MatchTime, HomeTeam, AwayTeam,
    HomeElo, AwayElo, Form3Home, Form5Home, Form3Away, Form5Away,
    FTHome, FTAway, FTResult, HTHome, HTAway, HTResult,
    HomeShots, AwayShots, HomeTarget, AwayTarget,
    HomeFouls, AwayFouls, HomeCorners, AwayCorners,
    HomeYellow, AwayYellow, HomeRed, AwayRed,
    OddHome, OddDraw, OddAway, MaxHome, MaxDraw, MaxAway,
    Over25, Under25, MaxOver25, MaxUnder25,
    HandiSize, HandiHome, HandiAway,
    C_LTH, C_LTA, C_VHD, C_VAD, C_HTB, C_PHB
"""

import os
import sys
import argparse
import warnings
from datetime import timedelta

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

# ── League slug mapping (Division code → human name) ─────────────
LEAGUE_NAMES = {
    "E0":  "Premier League",
    "E1":  "Championship",
    "SP1": "La Liga",
    "SP2": "La Liga 2",
    "D1":  "Bundesliga",
    "D2":  "Bundesliga 2",
    "I1":  "Serie A",
    "I2":  "Serie B",
    "F1":  "Ligue 1",
    "F2":  "Ligue 2",
    "N1":  "Eredivisie",
    "B1":  "Pro League",
    "P1":  "Primeira Liga",
    "T1":  "Super Lig",
    "G1":  "Super League Greece",
    "SC0": "Scottish Premiership",
    "SC1": "Scottish Championship",
    "ARG": "Argentina Primera",
    "BRA": "Brasileirao",
    "MEX": "Liga MX",
    "USA": "MLS",
}

# Target variable encoding
OUTCOME_MAP = {"H": 2, "D": 1, "A": 0}


def _slugify(s: str) -> str:
    return s.lower().replace(" ", "_").replace("/", "-")


# ── Column alias normalisation ────────────────────────────────────
_COL_ALIASES = {
    # xgabora exact column names → our internal names
    "matchdate":   "Date",
    "matchtime":   "Time",
    "hometeam":    "HomeTeam",
    "awayteam":    "AwayTeam",
    "homeelo":     "Elo_Home_Pre",
    "awayelo":     "Elo_Away_Pre",
    "form3home":   "Form3Home",
    "form5home":   "Form5Home",
    "form3away":   "Form3Away",
    "form5away":   "Form5Away",
    "fthome":      "FTHG",
    "ftaway":      "FTAG",
    "ftresult":    "FTR",
    "hthome":      "HTHG",
    "htaway":      "HTAG",
    "htresult":    "HTR",
    "homeshorts":  "HS",   # typo guard
    "homeshots":   "HS",
    "awayshots":   "AS",
    "hometarget":  "HST",
    "awaytarget":  "AST",
    "homefouls":   "HF",
    "awayfouls":   "AF",
    "homecorners": "HC",
    "awaycorners": "AC",
    "homeyellow":  "HY",
    "awayyellow":  "AY",
    "homered":     "HR",
    "awayred":     "AR",
    "oddhome":     "B365H",
    "odddraw":     "B365D",
    "oddaway":     "B365A",
    "maxhome":     "MaxH",
    "maxdraw":     "MaxD",
    "maxaway":     "MaxA",
    "division":    "Division",
}


def normalise_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Lowercase + remap column names to internal standard."""
    df.columns = [c.strip() for c in df.columns]
    rename = {}
    for col in df.columns:
        alias = _COL_ALIASES.get(col.lower())
        if alias and alias not in df.columns:
            rename[col] = alias
    if rename:
        df = df.rename(columns=rename)
    return df


# ── Load Matches.csv ──────────────────────────────────────────────

def load_matches(path: str, verbose: bool = True) -> pd.DataFrame:
    if not os.path.exists(path):
        raise FileNotFoundError(f"Matches.csv not found at {path}")

    df = pd.read_csv(path, low_memory=False)
    df = normalise_columns(df)

    # Parse date
    for dcol in ("Date", "MatchDate", "matchdate"):
        if dcol in df.columns:
            df["Date"] = pd.to_datetime(df[dcol], errors="coerce", dayfirst=True)
            if dcol != "Date":
                df = df.drop(columns=[dcol], errors="ignore")
            break

    df = df.dropna(subset=["Date"]).copy()
    df = df.sort_values("Date").reset_index(drop=True)

    # Ensure FTR exists
    for col in ("FTR", "FTResult", "ftresult"):
        if col in df.columns and col != "FTR":
            df["FTR"] = df[col]
            break

    df["FTR"] = df["FTR"].astype(str).str.strip().str.upper()
    df = df[df["FTR"].isin(["H", "D", "A"])].copy()
    df["outcome"] = df["FTR"].map(OUTCOME_MAP).astype(int)

    # League name column
    if "Division" in df.columns:
        df["league_code"] = df["Division"].astype(str).str.strip()
        df["league_name"] = df["league_code"].map(LEAGUE_NAMES).fillna(df["league_code"])
    else:
        df["league_code"] = "UNK"
        df["league_name"] = "Unknown"

    # Season label (Aug-Jul split)
    def _season(d):
        y = d.year
        m = d.month
        if m >= 8:
            return f"{y}-{str(y+1)[2:]}"
        return f"{y-1}-{str(y)[2:]}"

    df["season"] = df["Date"].apply(_season)

    if verbose:
        print(f"  Loaded {len(df):,} matches across "
              f"{df['league_code'].nunique()} leagues "
              f"({df['Date'].min().date()} → {df['Date'].max().date()})")

    return df


# ── Load EloRatings.csv ───────────────────────────────────────────

def load_elo(path: str, verbose: bool = True) -> pd.DataFrame:
    """
    EloRatings.csv columns: Date, Club, Country, Elo
    Bi-monthly snapshots. We use it to enrich rows where
    xgabora HomeElo/AwayElo columns are missing.
    """
    if not os.path.exists(path):
        if verbose:
            print(f"  ⚠️  EloRatings.csv not found at {path} — will use embedded Elo columns only")
        return pd.DataFrame()

    df = pd.read_csv(path, low_memory=False)

    # Normalize column names to title case to handle mixed-case CSV headers
    df.columns = [c.strip() for c in df.columns]

    # Build case-insensitive rename map
    col_lower = {c.lower(): c for c in df.columns}
    rename_map = {}
    for target in ["Date", "Club", "Country", "Elo"]:
        src = col_lower.get(target.lower())
        if src and src != target:
            rename_map[src] = target
    if rename_map:
        df = df.rename(columns=rename_map)

    # Parse date
    for dcol in ("Date", "MatchDate", "date", "matchdate"):
        if dcol in df.columns:
            df["Date"] = pd.to_datetime(df[dcol], errors="coerce", dayfirst=True)
            if dcol != "Date":
                df = df.drop(columns=[dcol], errors="ignore")
            break

    # Drop rows missing key fields
    missing_cols = [c for c in ["Date", "Club", "Elo"] if c not in df.columns]
    if missing_cols:
        if verbose:
            print(f"  ⚠️  EloRatings.csv missing expected columns: {missing_cols}")
            print(f"  Available columns: {list(df.columns)}")
        return pd.DataFrame()

    df = df.dropna(subset=["Date", "Club", "Elo"]).copy()
    df["Elo"] = pd.to_numeric(df["Elo"], errors="coerce")
    df = df.sort_values("Date")
    df["Elo"] = pd.to_numeric(df["Elo"], errors="coerce")
    df = df.sort_values("Date")

    if verbose:
        print(f"  Loaded ELO snapshots: {len(df):,} rows, {df['Club'].nunique()} clubs")

    return df


def get_elo_at_date(elo_df: pd.DataFrame, club: str, date: pd.Timestamp,
                    default: float = 1500.0) -> float:
    """Return most recent ELO for a club on or before a given date."""
    if elo_df.empty:
        return default
    subset = elo_df[(elo_df["Club"] == club) & (elo_df["Date"] <= date)]
    if subset.empty:
        # Try fuzzy match
        clubs = elo_df["Club"].unique()
        cl = club.lower()
        match = next((c for c in clubs if cl in c.lower() or c.lower() in cl), None)
        if match:
            subset = elo_df[(elo_df["Club"] == match) & (elo_df["Date"] <= date)]
    if subset.empty:
        return default
    return float(subset.iloc[-1]["Elo"])


# ── Rolling team stats ─────────────────────────────────────────────

def compute_rolling_features(df: pd.DataFrame, n: int = 5) -> pd.DataFrame:
    """
    For each match, compute rolling pre-match features for home and away team.
    Uses only data from matches BEFORE the current match (no leakage).

    Added features:
        home_goals_scored_{n}    — avg goals scored by home team in last n matches
        home_goals_conceded_{n}  — avg goals conceded
        home_win_pct_{n}         — win percentage
        home_form_streak         — running streak (+1 W, 0 D, -1 L)
        home_shots_pg_{n}        — avg shots per game (if HS available)
        home_sot_pg_{n}          — avg shots on target per game
        (same for away_*)
        h2h_win_rate             — home team historical win rate vs this away team
    """
    df = df.copy().sort_values("Date").reset_index(drop=True)

    # Build match history per team (both home and away roles combined)
    team_history: dict = {}  # team → list of (date, scored, conceded, result, shots, sot)

    hgs = pd.to_numeric(df.get("FTHG", df.get("FTHome", pd.Series([np.nan]*len(df)))), errors="coerce")
    ags = pd.to_numeric(df.get("FTAG", df.get("FTAway", pd.Series([np.nan]*len(df)))), errors="coerce")
    hs_col  = pd.to_numeric(df.get("HS",  pd.Series([np.nan]*len(df))), errors="coerce")
    hst_col = pd.to_numeric(df.get("HST", pd.Series([np.nan]*len(df))), errors="coerce")
    as_col  = pd.to_numeric(df.get("AS",  pd.Series([np.nan]*len(df))), errors="coerce")
    ast_col = pd.to_numeric(df.get("AST", pd.Series([np.nan]*len(df))), errors="coerce")

    def _rolling_stats(history, n):
        """Compute stats from the last n items in history list."""
        if not history:
            return dict(scored=np.nan, conceded=np.nan, win_pct=np.nan,
                        streak=0, shots=np.nan, sot=np.nan)
        window = history[-n:]
        scored_vals    = [h["scored"]   for h in window if not np.isnan(h["scored"])]
        conceded_vals  = [h["conceded"] for h in window if not np.isnan(h["conceded"])]
        results        = [h["result"]   for h in window]
        shots_vals     = [h["shots"]    for h in window if not np.isnan(h["shots"])]
        sot_vals       = [h["sot"]      for h in window if not np.isnan(h["sot"])]

        win_pct  = results.count("W") / len(results) if results else np.nan
        streak   = 0
        for r in reversed(history[-3:]):
            if r["result"] == "W":
                streak += 1
            elif r["result"] == "L":
                streak -= 1

        return dict(
            scored   = np.mean(scored_vals)   if scored_vals   else np.nan,
            conceded = np.mean(conceded_vals) if conceded_vals else np.nan,
            win_pct  = win_pct,
            streak   = streak,
            shots    = np.mean(shots_vals)    if shots_vals    else np.nan,
            sot      = np.mean(sot_vals)      if sot_vals      else np.nan,
        )

    # H2H history: (home_team, away_team) → list of outcomes ("H"/"D"/"A")
    h2h_history: dict = {}

    rows_out = []

    for idx, row in df.iterrows():
        home = row.get("HomeTeam", "")
        away = row.get("AwayTeam", "")
        date = row["Date"]
        ftr  = row.get("FTR", "")

        hg = float(hgs.iloc[idx]) if not np.isnan(hgs.iloc[idx]) else np.nan
        ag = float(ags.iloc[idx]) if not np.isnan(ags.iloc[idx]) else np.nan
        hs  = float(hs_col.iloc[idx])  if not np.isnan(hs_col.iloc[idx])  else np.nan
        hst = float(hst_col.iloc[idx]) if not np.isnan(hst_col.iloc[idx]) else np.nan
        as_ = float(as_col.iloc[idx])  if not np.isnan(as_col.iloc[idx])  else np.nan
        ast = float(ast_col.iloc[idx]) if not np.isnan(ast_col.iloc[idx]) else np.nan

        # Pre-match stats
        h_hist = team_history.get(home, [])
        a_hist = team_history.get(away, [])
        h_stats = _rolling_stats(h_hist, n)
        a_stats = _rolling_stats(a_hist, n)

        # H2H
        h2h_key  = (home, away)
        h2h_list = h2h_history.get(h2h_key, [])
        h2h_wins = h2h_list.count("H")
        h2h_total = len(h2h_list)
        h2h_win_rate = h2h_wins / h2h_total if h2h_total >= 3 else np.nan

        feat = {
            f"home_goals_scored_{n}":   h_stats["scored"],
            f"home_goals_conceded_{n}": h_stats["conceded"],
            f"home_win_pct_{n}":        h_stats["win_pct"],
            "home_form_streak":         h_stats["streak"],
            f"home_shots_pg_{n}":       h_stats["shots"],
            f"home_sot_pg_{n}":         h_stats["sot"],
            f"away_goals_scored_{n}":   a_stats["scored"],
            f"away_goals_conceded_{n}": a_stats["conceded"],
            f"away_win_pct_{n}":        a_stats["win_pct"],
            "away_form_streak":         a_stats["streak"],
            f"away_shots_pg_{n}":       a_stats["shots"],
            f"away_sot_pg_{n}":         a_stats["sot"],
            "h2h_win_rate":             h2h_win_rate,
        }
        rows_out.append(feat)

        # Update history AFTER computing features (no leakage)
        if not np.isnan(hg) and not np.isnan(ag):
            h_result = "W" if hg > ag else ("D" if hg == ag else "L")
            a_result = "W" if ag > hg else ("D" if ag == hg else "L")

            team_history.setdefault(home, []).append(dict(
                scored=hg, conceded=ag, result=h_result, shots=hs, sot=hst))
            team_history.setdefault(away, []).append(dict(
                scored=ag, conceded=hg, result=a_result, shots=as_, sot=ast))

            h2h_history.setdefault(h2h_key, []).append(ftr)

    roll_df = pd.DataFrame(rows_out, index=df.index)
    return pd.concat([df, roll_df], axis=1)


# ── Elo enrichment ────────────────────────────────────────────────

def enrich_elo(df: pd.DataFrame, elo_df: pd.DataFrame) -> pd.DataFrame:
    """
    Use embedded HomeElo/AwayElo if present and non-null.
    Fall back to EloRatings.csv lookup. Compute derived Elo features.
    """
    df = df.copy()

    # Use pre-computed Elo if available (xgabora embeds it)
    has_elo_home = "Elo_Home_Pre" in df.columns
    has_elo_away = "Elo_Away_Pre" in df.columns

    if not has_elo_home or df["Elo_Home_Pre"].isna().mean() > 0.5:
        if not elo_df.empty:
            print("  Computing ELO from EloRatings.csv (slow for large datasets)...")
            df["Elo_Home_Pre"] = [
                get_elo_at_date(elo_df, row["HomeTeam"], row["Date"])
                for _, row in df.iterrows()
            ]
        else:
            df["Elo_Home_Pre"] = 1500.0

    if not has_elo_away or df["Elo_Away_Pre"].isna().mean() > 0.5:
        if not elo_df.empty:
            df["Elo_Away_Pre"] = [
                get_elo_at_date(elo_df, row["AwayTeam"], row["Date"])
                for _, row in df.iterrows()
            ]
        else:
            df["Elo_Away_Pre"] = 1500.0

    df["Elo_Home_Pre"] = pd.to_numeric(df["Elo_Home_Pre"], errors="coerce").fillna(1500.0)
    df["Elo_Away_Pre"] = pd.to_numeric(df["Elo_Away_Pre"], errors="coerce").fillna(1500.0)

    df["elo_home"]     = df["Elo_Home_Pre"]
    df["elo_away"]     = df["Elo_Away_Pre"]
    df["elo_diff"]     = df["elo_home"] - df["elo_away"]
    df["elo_total"]    = df["elo_home"] + df["elo_away"]
    df["elo_advantage"]= df["elo_diff"] / df["elo_total"].clip(lower=1)

    return df


# ── Bookmaker feature extraction ───────────────────────────────────

def add_bookmaker_features(df: pd.DataFrame) -> pd.DataFrame:
    """Extract implied probabilities and bookmaker margin from odds columns."""
    df = df.copy()

    for prefix, h_col, d_col, a_col in [
        ("b365", "B365H", "B365D", "B365A"),
        ("max",  "MaxH",  "MaxD",  "MaxA"),
    ]:
        h = pd.to_numeric(df.get(h_col, pd.Series([np.nan]*len(df))), errors="coerce")
        d = pd.to_numeric(df.get(d_col, pd.Series([np.nan]*len(df))), errors="coerce")
        a = pd.to_numeric(df.get(a_col, pd.Series([np.nan]*len(df))), errors="coerce")

        # Avoid divide-by-zero
        h_safe = h.replace(0, np.nan)
        d_safe = d.replace(0, np.nan)
        a_safe = a.replace(0, np.nan)

        ph = 1 / h_safe
        pd_ = 1 / d_safe
        pa = 1 / a_safe
        total = (ph + pd_ + pa).clip(lower=1e-6)

        df[f"{prefix}_implied_home"] = ph / total
        df[f"{prefix}_implied_draw"] = pd_ / total
        df[f"{prefix}_implied_away"] = pa / total
        df[f"{prefix}_margin"]       = (ph + pd_ + pa) - 1

    return df


# ── Derived statistical features ──────────────────────────────────

def add_derived_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add xgabora-inspired derived features."""
    df = df.copy()

    # Form features (already in xgabora)
    for col in ("Form3Home", "Form5Home", "Form3Away", "Form5Away"):
        if col not in df.columns:
            df[col] = np.nan
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df["form3_diff"] = df["Form3Home"] - df["Form3Away"]
    df["form5_diff"] = df["Form5Home"] - df["Form5Away"]

    # Form momentum: Form3 - (Form5 - Form3) = 2*Form3 - Form5
    df["form_momentum_home"] = (2 * df["Form3Home"] - df["Form5Home"]).clip(-15, 18)
    df["form_momentum_away"] = (2 * df["Form3Away"] - df["Form5Away"]).clip(-15, 18)

    # Shot features
    hs  = pd.to_numeric(df.get("HS",  pd.Series([np.nan]*len(df))), errors="coerce")
    as_ = pd.to_numeric(df.get("AS",  pd.Series([np.nan]*len(df))), errors="coerce")
    hst = pd.to_numeric(df.get("HST", pd.Series([np.nan]*len(df))), errors="coerce")
    ast = pd.to_numeric(df.get("AST", pd.Series([np.nan]*len(df))), errors="coerce")

    df["shots_diff"]   = hs - as_
    df["shots_total"]  = hs + as_
    df["shot_acc_home"]= (hst / hs.replace(0, np.nan)).clip(0, 1)
    df["shot_acc_away"]= (ast / as_.replace(0, np.nan)).clip(0, 1)
    df["shot_acc_diff"]= df["shot_acc_home"] - df["shot_acc_away"]

    # Corner features
    hc = pd.to_numeric(df.get("HC", pd.Series([np.nan]*len(df))), errors="coerce")
    ac = pd.to_numeric(df.get("AC", pd.Series([np.nan]*len(df))), errors="coerce")
    df["corners_diff"] = hc - ac

    # Game dominance index
    df["game_dominance"] = ((df.get("corners_diff", 0) + df.get("shots_diff", 0)) / 2)

    # Card features
    hy = pd.to_numeric(df.get("HY", pd.Series([np.nan]*len(df))), errors="coerce")
    ay = pd.to_numeric(df.get("AY", pd.Series([np.nan]*len(df))), errors="coerce")
    hr = pd.to_numeric(df.get("HR", pd.Series([np.nan]*len(df))), errors="coerce")
    ar = pd.to_numeric(df.get("AR", pd.Series([np.nan]*len(df))), errors="coerce")
    df["card_pts_home"] = hy + 2 * hr.fillna(0)
    df["card_pts_away"] = ay + 2 * ar.fillna(0)
    df["card_pts_diff"] = df["card_pts_home"] - df["card_pts_away"]

    # Cluster features (xgabora-specific, use if available)
    for c in ("C_LTH", "C_LTA", "C_VHD", "C_VAD", "C_HTB", "C_PHB"):
        if c not in df.columns:
            df[c] = np.nan
        else:
            df[c] = pd.to_numeric(df[c], errors="coerce")

    # Is home advantage flag (always 1 for home team in this table)
    df["is_home"] = 1

    # Days since last match (approx — just use date diff within league)
    df["home_days_rest"] = np.nan
    df["away_days_rest"] = np.nan

    return df


def add_days_rest(df: pd.DataFrame) -> pd.DataFrame:
    """Compute days since each team's previous match."""
    df = df.copy().sort_values("Date").reset_index(drop=True)
    last_match: dict = {}

    home_rest = []
    away_rest = []

    for _, row in df.iterrows():
        home = row["HomeTeam"]
        away = row["AwayTeam"]
        date = row["Date"]

        h_rest = (date - last_match[home]).days if home in last_match else np.nan
        a_rest = (date - last_match[away]).days if away in last_match else np.nan

        home_rest.append(h_rest)
        away_rest.append(a_rest)

        last_match[home] = date
        last_match[away] = date

    df["home_days_rest"] = home_rest
    df["away_days_rest"] = away_rest
    return df


def add_league_position(df: pd.DataFrame) -> pd.DataFrame:
    """
    Approximate league position from cumulative points at each match date.
    Groups by (league_code, season).
    """
    df = df.copy()
    df["home_cumpts"] = np.nan
    df["away_cumpts"] = np.nan
    df["league_position_diff"] = np.nan

    for (lc, season), grp in df.groupby(["league_code", "season"], sort=False):
        grp = grp.sort_values("Date").copy()
        pts: dict = {}

        for idx, row in grp.iterrows():
            h = row["HomeTeam"]
            a = row["AwayTeam"]

            df.at[idx, "home_cumpts"] = pts.get(h, 0)
            df.at[idx, "away_cumpts"] = pts.get(a, 0)
            df.at[idx, "league_position_diff"] = pts.get(h, 0) - pts.get(a, 0)

            ftr = row.get("FTR", "")
            if ftr == "H":
                pts[h] = pts.get(h, 0) + 3
            elif ftr == "D":
                pts[h] = pts.get(h, 0) + 1
                pts[a] = pts.get(a, 0) + 1
            elif ftr == "A":
                pts[a] = pts.get(a, 0) + 3

    return df


# ── Final feature selection ────────────────────────────────────────

# These are the exact features consumed by train_model.py
# Any feature added here must be added to MODEL_FEATURES in train_model.py too
FINAL_FEATURES = [
    # ELO
    "elo_home", "elo_away", "elo_diff", "elo_advantage",
    # Rolling form
    "home_goals_scored_5", "home_goals_conceded_5", "home_win_pct_5", "home_form_streak",
    "away_goals_scored_5", "away_goals_conceded_5", "away_win_pct_5", "away_form_streak",
    "home_shots_pg_5", "home_sot_pg_5", "away_shots_pg_5", "away_sot_pg_5",
    # xgabora built-in form
    "Form3Home", "Form5Home", "Form3Away", "Form5Away",
    "form3_diff", "form5_diff", "form_momentum_home", "form_momentum_away",
    # H2H
    "h2h_win_rate",
    # Context
    "is_home", "home_days_rest", "away_days_rest", "league_position_diff",
    # Bookmaker (where available)
    "b365_implied_home", "b365_implied_draw", "b365_implied_away", "b365_margin",
    "max_implied_home", "max_implied_draw", "max_implied_away", "max_margin",
    # Shot stats (post-match — only useful for historical accuracy eval, remove for forward pred)
    # NOT included by default to avoid leakage in live prediction
    # Match cluster features (xgabora)
    "C_LTH", "C_LTA", "C_VHD", "C_VAD", "C_HTB", "C_PHB",
]

# Columns to keep in output CSV (features + metadata)
META_COLS = [
    "Date", "league_code", "league_name", "season",
    "HomeTeam", "AwayTeam",
    "FTHG", "FTAG", "FTR", "outcome",
]


# ── Main pipeline ─────────────────────────────────────────────────

def run_pipeline(
    matches_path: str,
    elo_path: str,
    output_dir: str,
    split_by_league: bool = True,
    verbose: bool = True,
):
    os.makedirs(output_dir, exist_ok=True)

    print(f"\n{'='*60}")
    print(f"  FutDash Phase 3 — Feature Engineering")
    print(f"  Matches : {matches_path}")
    print(f"  ELO     : {elo_path}")
    print(f"  Output  : {output_dir}")
    print(f"{'='*60}\n")

    # Load raw data
    df = load_matches(matches_path, verbose=verbose)
    elo_df = load_elo(elo_path, verbose=verbose)

    # Step 1: ELO enrichment
    print("\n  Step 1: ELO enrichment...")
    df = enrich_elo(df, elo_df)

    # Step 2: Bookmaker features
    print("  Step 2: Bookmaker features...")
    df = add_bookmaker_features(df)

    # Step 3: Derived features
    print("  Step 3: Derived features...")
    df = add_derived_features(df)

    # Step 4: Days rest
    print("  Step 4: Days rest...")
    df = add_days_rest(df)

    # Step 5: League position
    print("  Step 5: League position (cumulative points)...")
    df = add_league_position(df)

    # Step 6: Rolling team stats (most expensive — O(n) per match)
    print("  Step 6: Rolling team stats (n=5)...")
    # Process per league to avoid cross-league contamination
    chunks = []
    for lc, grp in df.groupby("league_code", sort=False):
        if verbose:
            print(f"    {lc}: {len(grp):,} matches")
        grp_feat = compute_rolling_features(grp, n=5)
        chunks.append(grp_feat)
    df = pd.concat(chunks, ignore_index=True).sort_values("Date").reset_index(drop=True)

    # Build output feature set
    available_meta    = [c for c in META_COLS if c in df.columns]
    available_features = [c for c in FINAL_FEATURES if c in df.columns]
    missing_features  = [c for c in FINAL_FEATURES if c not in df.columns]

    if missing_features and verbose:
        print(f"\n  ⚠️  Missing features (will be absent from output): {missing_features}")

    output_cols = available_meta + [c for c in available_features if c not in available_meta]
    out_df = df[output_cols].copy()

    # Fill remaining NaNs with column medians (except meta/categorical)
    num_cols = [c for c in available_features if c in out_df.select_dtypes(include=[np.number]).columns]
    out_df[num_cols] = out_df[num_cols].fillna(out_df[num_cols].median())

    # Save combined
    all_path = os.path.join(output_dir, "features_all.csv")
    out_df.to_csv(all_path, index=False)
    print(f"\n  ✅ Combined features → {all_path}  ({len(out_df):,} rows × {len(output_cols)} cols)")

    # Save per-league
    if split_by_league:
        for lc, grp in out_df.groupby("league_code"):
            slug = _slugify(LEAGUE_NAMES.get(lc, lc))
            out_path = os.path.join(output_dir, f"features_{lc}.csv")
            grp.to_csv(out_path, index=False)
            if verbose:
                print(f"  → {lc}: {len(grp):,} rows → {out_path}")

    # Feature summary
    print(f"\n  Feature summary ({len(available_features)} features):")
    for f in available_features[:20]:
        col = out_df[f]
        null_pct = col.isna().mean() * 100
        print(f"    {f:<40} null={null_pct:.1f}%  mean={col.mean():.3f}")
    if len(available_features) > 20:
        print(f"    ... and {len(available_features)-20} more")

    print(f"\n{'='*60}\n")
    return out_df


# ── CLI ──────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(
        description="FutDash Phase 3 — Feature Engineering from xgabora dataset")
    p.add_argument("--matches",
                   default="./xgabora-data/Matches.csv",
                   help="Path to xgabora Matches.csv")
    p.add_argument("--elo",
                   default="./xgabora-data/EloRatings.csv",
                   help="Path to xgabora EloRatings.csv")
    p.add_argument("--output-dir",
                   default="./scripts/features",
                   help="Output directory for feature CSVs")
    p.add_argument("--no-split",
                   action="store_true",
                   help="Don't split into per-league CSVs")
    p.add_argument("--quiet",
                   action="store_true")
    args = p.parse_args()

    run_pipeline(
        matches_path    = args.matches,
        elo_path        = args.elo,
        output_dir      = args.output_dir,
        split_by_league = not args.no_split,
        verbose         = not args.quiet,
    )


if __name__ == "__main__":
    main()
