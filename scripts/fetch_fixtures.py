#!/usr/bin/env python3
"""
FutDash Phase 3 — Fetch Upcoming Fixtures
==========================================
Pulls upcoming match fixtures from football-data.org (free tier)
and generates forecast JSON files consumed by the ForecastView tab.

Free tier limits:
    - 10 competitions available
    - 10 requests/minute
    - API key required (set via FOOTBALL_DATA_API_KEY env var or --api-key)

Output structure:
    web/public/data/predictions/{league_slug}/upcoming.json

Each file is a list of upcoming match objects compatible with the
PredictionCard schema (actual=null, predicted probabilities from model).

Usage:
    python fetch_fixtures.py --api-key YOUR_KEY --output-dir ./web/public/data/predictions
    python fetch_fixtures.py --api-key YOUR_KEY --leagues E0 SP1 D1
"""

import os
import sys
import json
import time
import argparse
import warnings
from datetime import datetime, timedelta, timezone

import requests
import pandas as pd
import joblib

warnings.filterwarnings("ignore")

# ── football-data.org competition IDs ────────────────────────────
# Maps our internal league codes to football-data.org competition IDs
COMPETITION_MAP = {
    "E0":  {"fd_id": "PL",  "name": "Premier League",     "flag": "🏴󠁧󠁢󠁥󠁮󠁧󠁿"},
    "SP1": {"fd_id": "PD",  "name": "La Liga",            "flag": "🇪🇸"},
    "D1":  {"fd_id": "BL1", "name": "Bundesliga",         "flag": "🇩🇪"},
    "I1":  {"fd_id": "SA",  "name": "Serie A",            "flag": "🇮🇹"},
    "F1":  {"fd_id": "FL1", "name": "Ligue 1",            "flag": "🇫🇷"},
    "N1":  {"fd_id": "DED", "name": "Eredivisie",         "flag": "🇳🇱"},
    "P1":  {"fd_id": "PPL", "name": "Primeira Liga",      "flag": "🇵🇹"},
}

# ── Team colour lookup (shared) ───────────────────────────────────
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
    "FC Barcelona":             "#a50044",
    "Real Madrid CF":           "#f0c040",
    "Club Atlético de Madrid":  "#cb3524",
    "Sevilla FC":               "#d4021d",
    "Valencia CF":              "#ff7200",
    "Villarreal CF":            "#f7d130",
    "Athletic Club":            "#ee2523",
    "Real Sociedad":            "#007dc5",
    "Real Betis Balompié":      "#00954c",
    # Bundesliga
    "FC Bayern München":        "#dc052d",
    "Borussia Dortmund":        "#fde100",
    "RB Leipzig":               "#dd0741",
    "Bayer 04 Leverkusen":      "#e32221",
    "Eintracht Frankfurt":      "#e1000f",
    "VfL Wolfsburg":            "#65b32e",
    "SC Freiburg":              "#d0021b",
    "1. FC Union Berlin":       "#eb1923",
    # Serie A
    "Juventus FC":              "#c8b86b",
    "FC Internazionale Milano": "#010e80",
    "AC Milan":                 "#fb090b",
    "SSC Napoli":               "#12a0c3",
    "AS Roma":                  "#8e1f2f",
    "SS Lazio":                 "#87d8f7",
    "Atalanta BC":              "#1e73be",
    "ACF Fiorentina":           "#4c1d6f",
    # Ligue 1
    "Paris Saint-Germain FC":   "#004170",
    "Olympique de Marseille":   "#009bdb",
    "Olympique Lyonnais":       "#be0a25",
    "AS Monaco FC":             "#cf0921",
    "LOSC Lille":               "#b00d18",
}
_DEFAULT_COLOR = "#6e7891"


def get_color(team_name: str) -> str:
    if team_name in TEAM_COLORS:
        return TEAM_COLORS[team_name]
    for k, v in TEAM_COLORS.items():
        if k.lower() in team_name.lower() or team_name.lower() in k.lower():
            return v
    return _DEFAULT_COLOR


def _slugify(s: str) -> str:
    return s.lower().replace(" ", "_").replace("/", "-").replace("\\", "-")


# ── API Client ────────────────────────────────────────────────────

class FootballDataClient:
    BASE_URL = "https://api.football-data.org/v4"
    MIN_INTERVAL = 6.1  # seconds between requests (free tier: 10/min)

    def __init__(self, api_key: str):
        self.session = requests.Session()
        self.session.headers.update({
            "X-Auth-Token": api_key,
            "Accept": "application/json",
        })
        self._last_request = 0.0

    def _get(self, path: str, params: dict = None) -> dict:
        """Rate-limited GET with automatic retry on 429."""
        elapsed = time.time() - self._last_request
        if elapsed < self.MIN_INTERVAL:
            time.sleep(self.MIN_INTERVAL - elapsed)

        url = f"{self.BASE_URL}{path}"
        for attempt in range(3):
            resp = self.session.get(url, params=params, timeout=15)
            self._last_request = time.time()

            if resp.status_code == 200:
                return resp.json()
            elif resp.status_code == 429:
                wait = int(resp.headers.get("X-RequestCounter-Reset", 60)) + 1
                print(f"  Rate limited. Waiting {wait}s …")
                time.sleep(wait)
            elif resp.status_code == 403:
                raise PermissionError(
                    f"403 Forbidden for {path}. "
                    "Check your API key and subscription tier."
                )
            else:
                raise RuntimeError(
                    f"HTTP {resp.status_code} for {path}: {resp.text[:200]}"
                )
        raise RuntimeError(f"Max retries exceeded for {path}")

    def get_matches(self, competition_id: str, date_from: str, date_to: str) -> list:
        """Fetch scheduled/live/finished matches for a competition."""
        data = self._get(
            f"/competitions/{competition_id}/matches",
            params={
                "dateFrom": date_from,
                "dateTo":   date_to,
                "status":   "SCHEDULED,TIMED",
            }
        )
        return data.get("matches", [])


# ── Probability model integration ────────────────────────────────

def load_model(model_path: str):
    """Load trained LightGBM bundle. Returns (model, features) or None."""
    if not os.path.exists(model_path):
        print(f"  ⚠️  Model not found at {model_path} — using fallback probabilities")
        return None
    bundle = joblib.load(model_path)
    return bundle


def dummy_probabilities(home_name: str, away_name: str) -> dict:
    """
    Fallback probabilities when no model is available.
    Uses a simple home-advantage prior (H=0.45, D=0.27, A=0.28).
    """
    return {"home_win": 0.45, "draw": 0.27, "away_win": 0.28}


def predict_match(bundle, home_name: str, away_name: str,
                  date: pd.Timestamp, features_dir: str) -> dict:
    """
    Look up team's recent stats from features CSV and run model prediction.
    Falls back to dummy probs if lookup fails.
    """
    if bundle is None:
        return dummy_probabilities(home_name, away_name)

    model    = bundle["model"]
    features = bundle["features"]

    # Try to find team stats from the most recent features file
    try:
        all_feat_path = os.path.join(features_dir, "features_all.csv")
        if not os.path.exists(all_feat_path):
            return dummy_probabilities(home_name, away_name)

        df = pd.read_csv(all_feat_path, low_memory=False)
        df["Date"] = pd.to_datetime(df["Date"], errors="coerce")

        # Find last match for home team as home
        hdf = df[df["HomeTeam"].str.lower() == home_name.lower()].sort_values("Date")
        adf = df[df["AwayTeam"].str.lower() == away_name.lower()].sort_values("Date")

        if hdf.empty or adf.empty:
            return dummy_probabilities(home_name, away_name)

        last_h = hdf.iloc[-1]
        last_a = adf.iloc[-1]

        row = {}
        for feat in features:
            if feat.startswith("home_"):
                row[feat] = last_h.get(feat, 0.0)
            elif feat.startswith("away_"):
                row[feat] = last_a.get(feat, 0.0)
            elif feat == "elo_diff":
                row[feat] = float(last_h.get("elo_home", 1500)) - float(last_a.get("elo_away", 1500))
            elif feat == "elo_home":
                row[feat] = float(last_h.get("elo_home", 1500))
            elif feat == "elo_away":
                row[feat] = float(last_a.get("elo_away", 1500))
            else:
                row[feat] = last_h.get(feat, 0.0)

        import numpy as np
        X = np.array([[row.get(f, 0.0) for f in features]])
        probs = model.predict_proba(X)[0]

        class_names = bundle.get("class_names", {0: "away_win", 1: "draw", 2: "home_win"})
        classes     = bundle.get("classes", [0, 1, 2])
        prob_dict   = {class_names[c]: float(probs[i]) for i, c in enumerate(classes)}
        for k in ("home_win", "draw", "away_win"):
            prob_dict.setdefault(k, 0.0)
        return {k: round(v, 4) for k, v in prob_dict.items()}

    except Exception as e:
        print(f"  ⚠️  Prediction failed for {home_name} vs {away_name}: {e}")
        return dummy_probabilities(home_name, away_name)


# ── Main pipeline ─────────────────────────────────────────────────

def fetch_and_generate(
    api_key: str,
    leagues: list,
    output_dir: str,
    model_path: str,
    features_dir: str,
    days_ahead: int = 14,
    verbose: bool = True,
):
    client   = FootballDataClient(api_key)
    bundle   = load_model(model_path)

    date_from = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    date_to   = (datetime.now(timezone.utc) + timedelta(days=days_ahead)).strftime("%Y-%m-%d")

    print(f"\n{'='*60}")
    print(f"  FutDash — Fetch Upcoming Fixtures")
    print(f"  Range: {date_from} → {date_to}  ({days_ahead} days)")
    print(f"  Leagues: {', '.join(leagues)}")
    print(f"{'='*60}\n")

    total_written = 0

    for league_code in leagues:
        comp = COMPETITION_MAP.get(league_code)
        if not comp:
            print(f"  ⚠️  Unknown league code: {league_code} — skipping")
            continue

        print(f"  ── {comp['flag']} {comp['name']} ({comp['fd_id']}) ──────────────")

        try:
            matches = client.get_matches(comp["fd_id"], date_from, date_to)
        except Exception as e:
            print(f"  ✗  Failed: {e}")
            continue

        if not matches:
            print(f"  No scheduled matches found in range")
            continue

        records = []
        for m in matches:
            home_name = m.get("homeTeam", {}).get("name", "Unknown")
            away_name = m.get("awayTeam", {}).get("name", "Unknown")
            utc_date  = m.get("utcDate", "")[:10]
            match_id  = m.get("id", 0)

            match_date = pd.to_datetime(utc_date, errors="coerce")
            probs = predict_match(bundle, home_name, away_name, match_date, features_dir)

            max_p = max(probs.values())

            records.append({
                "match_id":           f"{league_code}-{utc_date}-{match_id}",
                "date":               utc_date,
                "home":               home_name,
                "away":               away_name,
                "home_color":         get_color(home_name),
                "away_color":         get_color(away_name),
                "league_name":        comp["name"],
                "league_code":        league_code,
                "predicted": {
                    "home_win": probs["home_win"],
                    "draw":     probs["draw"],
                    "away_win": probs["away_win"],
                },
                "actual":             None,
                "is_upset":           False,
                "has_statsbomb":      False,
                "statsbomb_match_id": None,
                "confidence":         "high" if max_p > 0.55 else ("moderate" if max_p > 0.45 else "contested"),
                "venue":              m.get("venue", None),
                "matchday":           m.get("matchday", None),
                "status":             m.get("status", "SCHEDULED"),
            })

        league_slug = _slugify(comp["name"])
        out_dir     = os.path.join(output_dir, league_slug)
        os.makedirs(out_dir, exist_ok=True)
        out_path    = os.path.join(out_dir, "upcoming.json")

        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(records, f, ensure_ascii=False, indent=2)

        total_written += len(records)
        print(f"  ✅  {len(records)} fixtures → {out_path}")

    # ── Update _index.json to include upcoming files ──────────────
    index_path = os.path.join(output_dir, "_index.json")
    index: dict = {}
    if os.path.exists(index_path):
        with open(index_path, encoding="utf-8") as f:
            index = json.load(f)

    index["last_fixture_fetch"] = datetime.now(timezone.utc).isoformat() + "Z"
    index["fetch_date_range"]   = {"from": date_from, "to": date_to}

    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}")
    print(f"  Total fixtures written: {total_written}")
    print(f"  Index updated: {index_path}")
    print(f"{'='*60}\n")


# ── CLI ──────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(
        description="FutDash — Fetch upcoming fixtures from football-data.org")
    p.add_argument(
        "--api-key",
        default=os.environ.get("FOOTBALL_DATA_API_KEY", ""),
        help="football-data.org API key (or set FOOTBALL_DATA_API_KEY env var)",
    )
    p.add_argument(
        "--leagues",
        nargs="+",
        default=list(COMPETITION_MAP.keys()),
        help="League codes to fetch (e.g. E0 SP1 D1). Defaults to all configured leagues.",
    )
    p.add_argument(
        "--output-dir",
        default="./web/public/data/predictions",
        help="Output root directory for fixture JSONs",
    )
    p.add_argument(
        "--model",
        default="./scripts/model.joblib",
        help="Path to trained model bundle for probability generation",
    )
    p.add_argument(
        "--features-dir",
        default="./scripts/features",
        help="Directory containing features CSVs (for model inference)",
    )
    p.add_argument(
        "--days-ahead",
        type=int,
        default=14,
        help="How many days ahead to fetch fixtures for",
    )
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args()

    if not args.api_key:
        print("[ERROR] No API key provided.")
        print("  Set FOOTBALL_DATA_API_KEY environment variable or use --api-key.")
        print("  Get a free key at: https://www.football-data.org/client/register")
        sys.exit(1)

    fetch_and_generate(
        api_key      = args.api_key,
        leagues      = args.leagues,
        output_dir   = args.output_dir,
        model_path   = args.model,
        features_dir = args.features_dir,
        days_ahead   = args.days_ahead,
        verbose      = not args.quiet,
    )


if __name__ == "__main__":
    main()
