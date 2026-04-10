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

TEAM_COLORS = {
    # Premier League
    "Manchester City":          "#98c5e9",
    "Arsenal":                  "#ef0107",
    "Liverpool":                "#00a398",
    "Chelsea":                  "#034694",
    "Tottenham Hotspur":        "#6585d0",
    "Manchester United":        "#da020e",
    "Newcastle United":         "#4a90c8",
    "Aston Villa":              "#a0395e",
    "West Ham United":          "#60223b",
    "Brighton & Hove Albion":   "#0055a9",
    "Wolverhampton Wanderers":  "#fdb913",
    "Everton":                  "#274488",
    "Crystal Palace":           "#1b458f",
    "Brentford":                "#e30613",
    "Fulham":                   "#cc0000",
    "Nottingham Forest":        "#e53233",
    "Bournemouth":              "#e62333",
    "Sheffield United":         "#ee2737",
    "Burnley":                  "#8ccce5",
    "Luton Town":               "#f78f1e",
    "Leicester City":           "#fdbe11",
    "Leeds United":             "#ffcd00",
    # La Liga
    "Barcelona":                "#a50044",
    "Real Madrid":              "#f0c040",
    "Atletico Madrid":          "#cb3524",
    "Sevilla":                  "#d4021d",
    "Valencia":                 "#ff7200",
    "Athletic Club":            "#ee2523",
    # Bundesliga
    "Bayern Munich":            "#dc052d",
    "Borussia Dortmund":        "#fde100",
    "RB Leipzig":               "#dd0741",
    "Bayer Leverkusen":         "#e32221",
    "Eintracht Frankfurt":      "#e1000f",
    # Serie A
    "Juventus":                 "#c8b86b",
    "Inter":                    "#010e80",
    "AC Milan":                 "#fb090b",
    "Napoli":                   "#12a0c3",
    "Roma":                     "#8e1f2f",
    # Ligue 1
    "Paris Saint-Germain":      "#004170",
    "Marseille":                "#009bdb",
    "Lyon":                     "#be0a25",
    "Monaco":                   "#cf0921",
}
_HOME_FALLBACK = "#58a6ff"
_AWAY_FALLBACK = "#f0883e"


def get_color(team_name: str, fallback: str = _HOME_FALLBACK) -> str:
    if not team_name:
        return fallback
    if team_name in TEAM_COLORS:
        return TEAM_COLORS[team_name]
    tl = team_name.lower()
    for k, v in TEAM_COLORS.items():
        if tl in k.lower() or k.lower() in tl:
            return v
    return fallback


def _slugify(s: str) -> str:
    return s.lower().replace(" ", "_").replace("/", "-").replace("\\", "-")


def add_derived_v2_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add the v2 features (must match train_model.py)."""
    # Odds discrepancy
    for outcome in ("home", "draw", "away"):
        b = f"b365_implied_{outcome}"
        m = f"max_implied_{outcome}"
        if b in df.columns and m in df.columns:
            df[f"odds_discrepancy_{outcome}"] = (
                pd.to_numeric(df[m], errors="coerce") -
                pd.to_numeric(df[b], errors="coerce")
            ).fillna(0)
        else:
            df[f"odds_discrepancy_{outcome}"] = 0.0

    # Scoring rates
    for prefix in ("home", "away"):
        scored_col  = f"{prefix}_goals_scored_5"
        concede_col = f"{prefix}_goals_conceded_5"
        rate_col    = f"{prefix}_scoring_rate"
        conc_col    = f"{prefix}_concede_rate"
        if scored_col in df.columns:
            df[rate_col] = pd.to_numeric(df[scored_col], errors="coerce").fillna(1.3)
        else:
            df[rate_col] = 1.3
        if concede_col in df.columns:
            df[conc_col] = pd.to_numeric(df[concede_col], errors="coerce").fillna(1.1)
        else:
            df[conc_col] = 1.1

    df["goal_expectation_home"] = (
        df.get("home_scoring_rate", 1.3) * df.get("away_concede_rate", 1.2)
    ).clip(0, 6)
    df["goal_expectation_away"] = (
        df.get("away_scoring_rate", 1.0) * df.get("home_concede_rate", 1.1)
    ).clip(0, 6)

    return df


def predict_proba_ensemble(bundle, X: np.ndarray) -> np.ndarray:
    """
    Run prediction using the model bundle.
    If an XGBoost model is also present, average the probabilities.
    """
    lgb_prob = bundle["model"].predict_proba(X)

    if bundle.get("use_ensemble") and bundle.get("xgb_model") is not None:
        try:
            xgb_prob = bundle["xgb_model"].predict_proba(X)
            return (lgb_prob + xgb_prob) / 2
        except Exception:
            pass

    return lgb_prob


def build_statsbomb_index(statsbomb_base: str) -> pd.DataFrame:
    rows = []
    matches_dir = os.path.join(statsbomb_base, "data", "matches")
    if not os.path.isdir(matches_dir):
        matches_dir = os.path.join(statsbomb_base, "matches")
    if not os.path.isdir(matches_dir):
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
    print(f"  StatsBomb index: {len(df):,} matches")
    return df


def find_statsbomb_match(home, away, date, sb_index, tol_days=1):
    if sb_index.empty:
        return None, False
    dt_lo = date - timedelta(days=tol_days)
    dt_hi = date + timedelta(days=tol_days)
    cands = sb_index[(sb_index["date"] >= dt_lo) & (sb_index["date"] <= dt_hi)]
    if cands.empty:
        return None, False
    hl, al = home.lower(), away.lower()
    for _, row in cands.iterrows():
        rh, ra = row["home"].lower(), row["away"].lower()
        if (hl in rh or rh in hl) and (al in ra or ra in al):
            return int(row["match_id"]), True
    return None, False


def generate_predictions(
    features_dir: str,
    model_path: str,
    output_dir: str,
    statsbomb_base: str = None,
    upset_threshold: float = 0.30,
    verbose: bool = True,
):
    print(f"\n{'='*60}\n  FutDash — Generate Predictions v2\n{'='*60}")

    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model not found: {model_path}")

    bundle = joblib.load(model_path)
    features = bundle["features"]
    class_names = bundle["class_names"]
    class_order = bundle["classes"]

    print(f"  Model: {bundle['model_name']}")
    print(f"  Val acc={bundle['val_accuracy']:.3f}  Brier={bundle['val_brier']:.3f}")
    print(f"  Ensemble: {bundle.get('use_ensemble', False)}")

    sb_index = pd.DataFrame()
    if statsbomb_base and os.path.isdir(statsbomb_base):
        sb_index = build_statsbomb_index(statsbomb_base)

    feature_files = sorted(glob.glob(os.path.join(features_dir, "features_*.csv")))
    feature_files = [f for f in feature_files if "features_all" not in f]
    if not feature_files:
        raise FileNotFoundError(f"No features_*.csv in {features_dir}")

    total_written = 0

    for feat_path in feature_files:
        league_code = os.path.basename(feat_path).replace("features_", "").replace(".csv", "")
        if verbose:
            print(f"\n  ── {league_code} ──────────────────────────────────────")

        df = pd.read_csv(feat_path, low_memory=False)
        df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
        df = df.dropna(subset=["Date"]).sort_values("Date").reset_index(drop=True)

        # Add v2 features
        df = add_derived_v2_features(df)

        league_name = df["league_name"].iloc[0] if "league_name" in df.columns else league_code
        league_slug = _slugify(league_name)

        X = df.reindex(columns=features, fill_value=0.0).copy()
        for c in X.columns:
            med = X[c].median()
            X[c] = pd.to_numeric(X[c], errors="coerce").fillna(
                med if not np.isnan(med) else 0.0
            )

        probs = predict_proba_ensemble(bundle, X.values)

        records_by_season: dict = {}

        for i, (_, row) in enumerate(df.iterrows()):
            p = probs[i]
            prob_dict = {class_names[cls]: float(p[j])
                         for j, cls in enumerate(class_order)}
            for k in ("home_win", "draw", "away_win"):
                prob_dict.setdefault(k, 0.0)

            has_result = pd.notna(row.get("FTR")) and str(row.get("FTR")) in ("H", "D", "A")
            if has_result:
                ftr = str(row["FTR"])
                actual = {
                    "home_goals": int(row.get("FTHG", 0) or 0),
                    "away_goals": int(row.get("FTAG", 0) or 0),
                    "outcome":    ftr,
                }
                actual_prob_key = {"H": "home_win", "D": "draw", "A": "away_win"}[ftr]
                is_upset = float(prob_dict[actual_prob_key]) < upset_threshold
            else:
                actual  = None
                is_upset = False

            home = str(row.get("HomeTeam", ""))
            away = str(row.get("AwayTeam", ""))
            date = row["Date"]
            sb_id, has_sb = find_statsbomb_match(home, away, date, sb_index)

            season = str(row.get("season", "unknown"))
            season_slug = _slugify(season)

            match_obj = {
                "match_id":           f"{league_code}-{date.strftime('%Y%m%d')}-{home[:3].upper()}-{away[:3].upper()}",
                "date":               date.strftime("%Y-%m-%d"),
                "home":               home,
                "away":               away,
                "home_color":         get_color(home),
                "away_color":         get_color(away),
                "league_name":        league_name,
                "predicted":         {k: round(v, 4) for k, v in prob_dict.items()},
                "actual":            actual,
                "is_upset":          bool(is_upset),
                "has_statsbomb":     bool(has_sb),
                "statsbomb_match_id": sb_id,
            }
            records_by_season.setdefault(season_slug, []).append(match_obj)

        for season_slug, records in records_by_season.items():
            season_dir = os.path.join(output_dir, league_slug)
            os.makedirs(season_dir, exist_ok=True)
            out_path = os.path.join(season_dir, f"{season_slug}.json")
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(records, f, ensure_ascii=False, indent=2)
            total_written += len(records)

        if verbose:
            print(f"  {league_name}: {len(df):,} matches → {len(records_by_season)} season(s)")

    # Summary index
    summary = {
        "generated_at": pd.Timestamp.utcnow().isoformat() + "Z",
        "total_matches": total_written,
        "model_accuracy": bundle["val_accuracy"],
        "model_brier": bundle["val_brier"],
        "leagues": [],
    }
    for feat_path in feature_files:
        lc = os.path.basename(feat_path).replace("features_", "").replace(".csv", "")
        try:
            df_tmp = pd.read_csv(feat_path, usecols=["league_name", "season"], nrows=1)
            ln = df_tmp["league_name"].iloc[0]
        except Exception:
            ln = lc
        slug = _slugify(ln)
        season_files = sorted(glob.glob(os.path.join(output_dir, slug, "*.json")))
        summary["leagues"].append({
            "league_code": lc, "league_name": ln, "league_slug": slug,
            "seasons": [os.path.splitext(os.path.basename(f))[0] for f in season_files],
        })

    summary_path = os.path.join(output_dir, "_index.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print(f"\n{'='*60}")
    print(f"  Total written: {total_written:,}")
    print(f"  Output: {output_dir}")
    print(f"{'='*60}\n")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--features-dir",    default="./scripts/features")
    p.add_argument("--model",           default="./scripts/model.joblib")
    p.add_argument("--output-dir",      default="./web/public/data/predictions")
    p.add_argument("--statsbomb-base",  default="./open-data")
    p.add_argument("--upset-threshold", type=float, default=0.30)
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
 
