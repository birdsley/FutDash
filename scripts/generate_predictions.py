#!/usr/bin/env python3
"""
FutDash Phase 3 — Generate Predictions JSON
=============================================
Loads the trained model bundle and features CSVs to produce
prediction JSON files consumed by the FutDash web frontend.

Output structure:
    web/public/data/predictions/{league_slug}/{season_slug}.json

Each JSON is a list of match objects with schema:
    {
      "match_id":            str,
      "date":                "YYYY-MM-DD",
      "home":                str,
      "away":                str,
      "home_color":          str (hex),
      "away_color":          str (hex),
      "predicted": {
        "home_win":  float,
        "draw":      float,
        "away_win":  float
      },
      "actual": {
        "home_goals": int,
        "away_goals": int,
        "outcome":   "H"|"D"|"A"
      } | null,
      "is_upset":             bool,
      "has_statsbomb":        bool,
      "statsbomb_match_id":   int | null
    }

StatsBomb cross-reference:
    Reads the StatsBomb open-data competitions + matches metadata
    (same submodule structure as in deploy.yml) and matches on
    home_team / away_team / date (±1 day tolerance).
"""

import os
import sys
import json
import glob
import argparse
import warnings
from datetime import timedelta

import numpy as np
import pandas as pd
import joblib

warnings.filterwarnings("ignore")

# ── Team colour lookup (shared with statsbomb_v9.py) ─────────────
TEAM_COLORS = {
    "Man United":       "#da020e", "Manchester United":  "#da020e",
    "Liverpool":        "#00a398",
    "Man City":         "#98c5e9", "Manchester City":    "#98c5e9",
    "Arsenal":          "#ef0107",
    "Chelsea":          "#034694",
    "Tottenham":        "#6585d0", "Tottenham Hotspur":  "#6585d0",
    "Everton":          "#274488",
    "Leicester":        "#fdbe11", "Leicester City":     "#fdbe11",
    "West Ham":         "#60223b", "West Ham United":    "#60223b",
    "Aston Villa":      "#a0395e",
    "Newcastle":        "#4a90c8", "Newcastle United":   "#4a90c8",
    "Southampton":      "#ed1a3b",
    "Wolves":           "#fdb913", "Wolverhampton":      "#fdb913",
    "Crystal Palace":   "#1b458f",
    "Brighton":         "#0055a9",
    "Brentford":        "#e30613",
    "Fulham":           "#cc0000",
    "Burnley":          "#8ccce5",
    "Leeds":            "#ffcd00", "Leeds United":       "#ffcd00",
    "Nottm Forest":     "#e53233", "Nottingham Forest":  "#e53233",
    "Bournemouth":      "#e62333",
    "Sheffield Utd":    "#ee2737",
    "Luton":            "#f78f1e",
    # La Liga
    "Barcelona":        "#a50044", "Real Madrid":        "#f0c040",
    "Atletico Madrid":  "#cb3524", "Sevilla":            "#d4021d",
    "Valencia":         "#ff7200", "Villarreal":         "#f7d130",
    "Athletic Club":    "#ee2523", "Real Sociedad":      "#007dc5",
    "Betis":            "#00954c", "Celta":              "#81b8df",
    # Bundesliga
    "Bayern Munich":    "#dc052d", "Dortmund":           "#fde100",
    "RB Leipzig":       "#dd0741", "Leverkusen":         "#e32221",
    "Frankfurt":        "#e1000f", "Wolfsburg":          "#65b32e",
    "Freiburg":         "#d0021b", "Union Berlin":       "#eb1923",
    # Serie A
    "Juventus":         "#c8b86b", "Inter":              "#010e80",
    "AC Milan":         "#fb090b", "Napoli":             "#12a0c3",
    "Roma":             "#8e1f2f", "Lazio":              "#87d8f7",
    "Atalanta":         "#1e73be", "Fiorentina":         "#4c1d6f",
    # Ligue 1
    "PSG":              "#004170", "Paris SG":           "#004170",
    "Marseille":        "#009bdb", "Lyon":               "#be0a25",
    "Monaco":           "#cf0921", "Lille":              "#b00d18",
    "Nice":             "#be0f0c", "Rennes":             "#a10026",
}
_DEFAULT_HOME = "#58a6ff"
_DEFAULT_AWAY = "#f0883e"


def get_color(team: str) -> str:
    if team in TEAM_COLORS:
        return TEAM_COLORS[team]
    for k, v in TEAM_COLORS.items():
        if k.lower() in team.lower() or team.lower() in k.lower():
            return v
    return _DEFAULT_HOME


def _slugify(s: str) -> str:
    return s.lower().replace(" ", "_").replace("/", "-").replace("\\", "-")


# ── StatsBomb cross-reference ─────────────────────────────────────

def build_statsbomb_index(statsbomb_base: str) -> pd.DataFrame:
    """
    Build a lookup DataFrame from StatsBomb open-data matches JSON files.
    Returns columns: match_id, home, away, date (Timestamp)
    """
    rows = []
    matches_dir = os.path.join(statsbomb_base, "data", "matches")
    if not os.path.isdir(matches_dir):
        matches_dir = os.path.join(statsbomb_base, "matches")
    if not os.path.isdir(matches_dir):
        print(f"  ⚠️  StatsBomb matches dir not found at {matches_dir} — skipping cross-reference")
        return pd.DataFrame(columns=["match_id", "home", "away", "date"])

    for comp_dir in glob.glob(os.path.join(matches_dir, "*")):
        for season_file in glob.glob(os.path.join(comp_dir, "*.json")):
            try:
                with open(season_file, encoding="utf-8") as f:
                    matches = json.load(f)
                for m in matches:
                    rows.append({
                        "match_id": m.get("match_id"),
                        "home": m.get("home_team", {}).get("home_team_name", ""),
                        "away": m.get("away_team", {}).get("away_team_name", ""),
                        "date": pd.to_datetime(m.get("match_date"), errors="coerce"),
                    })
            except Exception:
                pass

    df = pd.DataFrame(rows).dropna(subset=["date"])
    print(f"  StatsBomb index: {len(df):,} matches loaded")
    return df


def find_statsbomb_match(home: str, away: str, date: pd.Timestamp,
                         sb_index: pd.DataFrame, tol_days: int = 1):
    """Return (match_id, True) if found in StatsBomb, else (None, False)."""
    if sb_index.empty:
        return None, False
    dt_lo = date - timedelta(days=tol_days)
    dt_hi = date + timedelta(days=tol_days)
    candidates = sb_index[
        (sb_index["date"] >= dt_lo) & (sb_index["date"] <= dt_hi)
    ]
    if candidates.empty:
        return None, False
    # Fuzzy name match
    home_l = home.lower()
    away_l = away.lower()
    for _, row in candidates.iterrows():
        rh = row["home"].lower()
        ra = row["away"].lower()
        if (home_l in rh or rh in home_l) and (away_l in ra or ra in away_l):
            return int(row["match_id"]), True
    return None, False


# ── Prediction generation ─────────────────────────────────────────

def generate_predictions(
    features_dir: str,
    model_path: str,
    output_dir: str,
    statsbomb_base: str = None,
    upset_threshold: float = 0.30,
    verbose: bool = True,
):
    print(f"\n{'='*60}")
    print(f"  FutDash Phase 3 — Generate Predictions")
    print(f"{'='*60}")

    # Load model bundle
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model not found: {model_path}\nRun train_model.py first.")
    bundle = joblib.load(model_path)
    model        = bundle["model"]
    features     = bundle["features"]
    class_names  = bundle["class_names"]   # {0: "away_win", 1: "draw", 2: "home_win"}
    print(f"  Model: {bundle['model_name']}  "
          f"(val acc={bundle['val_accuracy']:.3f}, brier={bundle['val_brier']:.3f})")

    # StatsBomb cross-reference index
    sb_index = pd.DataFrame()
    if statsbomb_base and os.path.isdir(statsbomb_base):
        sb_index = build_statsbomb_index(statsbomb_base)

    # Process each league features file
    feature_files = sorted(glob.glob(os.path.join(features_dir, "features_*.csv")))
    feature_files = [f for f in feature_files if "features_all" not in f]
    if not feature_files:
        raise FileNotFoundError(f"No features_*.csv found in {features_dir}")

    total_written = 0
    all_predictions = []

    for feat_path in feature_files:
        league_code = os.path.basename(feat_path).replace("features_", "").replace(".csv", "")
        if verbose:
            print(f"\n  ── {league_code} ──────────────────────────────────────")

        df = pd.read_csv(feat_path, low_memory=False)
        df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
        df = df.dropna(subset=["Date"]).sort_values("Date").reset_index(drop=True)

        league_name = df["league_name"].iloc[0] if "league_name" in df.columns else league_code
        league_slug = _slugify(league_name)

        # Prepare feature matrix — impute missing with 0
        X = df[[c for c in features if c in df.columns]].copy()
        for c in features:
            if c not in X.columns:
                X[c] = 0.0
        X = X[features].fillna(0.0)

        # Predict
        probs = model.predict_proba(X)   # shape (n, 3) — columns: [A=0, D=1, H=2]
        # Map class indices to names
        class_order = model.classes_     # e.g. [0, 1, 2]

        # Build per-match prediction records
        records_by_season: dict = {}

        for i, (_, row) in enumerate(df.iterrows()):
            p = probs[i]
            prob_dict = {class_names[cls]: float(p[j])
                         for j, cls in enumerate(class_order)}

            # Ensure all three keys present
            for k in ("home_win", "draw", "away_win"):
                prob_dict.setdefault(k, 0.0)

            # Actual outcome (None for future matches)
            has_result = pd.notna(row.get("FTR")) and str(row.get("FTR")) in ("H", "D", "A")
            if has_result:
                ftr = str(row["FTR"])
                actual = {
                    "home_goals": int(row.get("FTHG", 0)),
                    "away_goals": int(row.get("FTAG", 0)),
                    "outcome":    ftr,
                }
                # is_upset: the probability assigned to the actual outcome was < threshold
                actual_prob_key = {"H": "home_win", "D": "draw", "A": "away_win"}[ftr]
                is_upset = float(prob_dict[actual_prob_key]) < upset_threshold
            else:
                actual  = None
                is_upset = False

            # StatsBomb cross-reference
            home = str(row.get("HomeTeam", ""))
            away = str(row.get("AwayTeam", ""))
            date = row["Date"]

            sb_id, has_sb = find_statsbomb_match(home, away, date, sb_index)

            season = str(row.get("season", _infer_season(date)))
            season_slug = _slugify(season)

            match_obj = {
                "match_id":          f"{league_code}-{date.strftime('%Y%m%d')}-{home[:3].upper()}-{away[:3].upper()}",
                "date":              date.strftime("%Y-%m-%d"),
                "home":              home,
                "away":              away,
                "home_color":        get_color(home),
                "away_color":        get_color(away),
                "predicted":         {k: round(v, 4) for k, v in prob_dict.items()},
                "actual":            actual,
                "is_upset":          bool(is_upset),
                "has_statsbomb":     bool(has_sb),
                "statsbomb_match_id": sb_id,
            }

            records_by_season.setdefault(season_slug, []).append(match_obj)
            all_predictions.append(match_obj)

        # Write per-season JSON files
        for season_slug, records in records_by_season.items():
            season_dir = os.path.join(output_dir, league_slug)
            os.makedirs(season_dir, exist_ok=True)
            out_path = os.path.join(season_dir, f"{season_slug}.json")
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(records, f, ensure_ascii=False, indent=2)
            total_written += len(records)

        if verbose:
            seasons = list(records_by_season.keys())
            print(f"  {league_name}: {len(df):,} matches → {len(seasons)} season(s)")
            upset_count = sum(1 for m in all_predictions if m["is_upset"])

    # ── Summary index ─────────────────────────────────────────────
    summary = {
        "generated_at": pd.Timestamp.utcnow().isoformat() + "Z",
        "total_matches": total_written,
        "leagues": []
    }
    for feat_path in feature_files:
        lc = os.path.basename(feat_path).replace("features_", "").replace(".csv", "")
        df_tmp = pd.read_csv(feat_path, usecols=["league_name", "season"],
                             nrows=1, low_memory=False) if os.path.exists(feat_path) else None
        ln = df_tmp["league_name"].iloc[0] if df_tmp is not None and not df_tmp.empty else lc
        slug = _slugify(ln)
        season_files = sorted(glob.glob(os.path.join(output_dir, slug, "*.json")))
        summary["leagues"].append({
            "league_code": lc,
            "league_name": ln,
            "league_slug": slug,
            "seasons": [os.path.splitext(os.path.basename(f))[0] for f in season_files],
        })

    summary_path = os.path.join(output_dir, "_index.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print(f"\n{'='*60}")
    print(f"  Total predictions written : {total_written:,}")
    print(f"  Output root               : {output_dir}")
    print(f"  Summary index             : {summary_path}")
    print(f"{'='*60}\n")


def _infer_season(date: pd.Timestamp) -> str:
    y = date.year
    m = date.month
    if m >= 7:
        return f"{y}-{str(y+1)[2:]}"
    return f"{y-1}-{str(y)[2:]}"


# ── CLI ──────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(
        description="FutDash Phase 3 — Generate prediction JSON files")
    p.add_argument("--features-dir",    default="./scripts/features",
                   help="Directory containing features_*.csv files")
    p.add_argument("--model",           default="./scripts/model.joblib",
                   help="Path to trained model bundle (joblib)")
    p.add_argument("--output-dir",      default="./web/public/data/predictions",
                   help="Output root directory for prediction JSONs")
    p.add_argument("--statsbomb-base",  default="./open-data",
                   help="Path to StatsBomb open-data directory (optional)")
    p.add_argument("--upset-threshold", type=float, default=0.30,
                   help="Probability threshold below which a correct prediction is an upset")
    p.add_argument("--quiet",           action="store_true")
    args = p.parse_args()

    generate_predictions(
        features_dir    = args.features_dir,
        model_path      = args.model,
        output_dir      = args.output_dir,
        statsbomb_base  = args.statsbomb_base,
        upset_threshold = args.upset_threshold,
        verbose         = not args.quiet,
    )


if __name__ == "__main__":
    main()
