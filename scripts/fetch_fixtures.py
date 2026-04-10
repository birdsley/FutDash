#!/usr/bin/env python3
"""
FutDash — Fetch Upcoming Fixtures
==========================================
Pulls upcoming match fixtures from football-data.org (free tier)
and generates forecast JSON files consumed by the ForecastView tab.

════════════════════════════════════════════════════════════════
HOW TO GET YOUR FOOTBALL DATA API KEY
════════════════════════════════════════════════════════════════

1. Register at: https://www.football-data.org/client/register
   (free, instant, no credit card)

2. You will receive an email with your API key (a 32-char hex string).
   It looks like: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6

3. Add it to your GitHub repository as a Secret:
   GitHub repo → Settings → Secrets and variables → Actions
   → New repository secret
   Name:  FOOTBALL_DATA_API_KEY
   Value: <your API key>

4. The deploy.yml workflow already reads it as:
   env:
     FOOTBALL_DATA_API_KEY: ${{ secrets.FOOTBALL_DATA_API_KEY }}

Free tier limits:
    - 10 competitions available (Premier League, La Liga, Bundesliga etc.)
    - 10 requests per minute
    - No historical data — current season only

Free tier competition IDs available:
    PL  = Premier League
    PD  = La Liga
    BL1 = Bundesliga
    SA  = Serie A
    FL1 = Ligue 1
    DED = Eredivisie
    BSA = Campeonato Brasileiro Série A
    PL  = Primeira Liga (Portugal)
    ELC = Championship
    EC  = European Championship
    WC  = FIFA World Cup

════════════════════════════════════════════════════════════════

Output structure:
    web/public/data/predictions/{league_slug}/upcoming.json

Prediction probabilities:
    If model.joblib + features_all.csv are present: uses LightGBM model
    Otherwise: uses a bookmaker-calibrated home-advantage prior
"""

import os
import sys
import json
import time
import argparse
import warnings
from datetime import datetime, timedelta, timezone
from collections import defaultdict

import requests
import pandas as pd
import numpy as np
import joblib

warnings.filterwarnings("ignore")

# ── football-data.org competition IDs ────────────────────────────
COMPETITION_MAP = {
    "E0":  {"fd_id": "PL",  "name": "Premier League",     "flag": "🏴󠁧󠁢󠁥󠁮󠁧󠁿"},
    "SP1": {"fd_id": "PD",  "name": "La Liga",            "flag": "🇪🇸"},
    "D1":  {"fd_id": "BL1", "name": "Bundesliga",         "flag": "🇩🇪"},
    "I1":  {"fd_id": "SA",  "name": "Serie A",            "flag": "🇮🇹"},
    "F1":  {"fd_id": "FL1", "name": "Ligue 1",            "flag": "🇫🇷"},
    "N1":  {"fd_id": "DED", "name": "Eredivisie",         "flag": "🇳🇱"},
    "P1":  {"fd_id": "PPL", "name": "Primeira Liga",      "flag": "🇵🇹"},
}

# ── Team colour lookup ────────────────────────────────────────────
TEAM_COLORS = {
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
    "FC Barcelona":             "#a50044",
    "Real Madrid CF":           "#f0c040",
    "Club Atlético de Madrid":  "#cb3524",
    "Sevilla FC":               "#d4021d",
    "FC Bayern München":        "#dc052d",
    "Borussia Dortmund":        "#fde100",
    "RB Leipzig":               "#dd0741",
    "Bayer 04 Leverkusen":      "#e32221",
    "FC Internazionale Milano": "#010e80",
    "AC Milan":                 "#fb090b",
    "Juventus FC":              "#c8b86b",
    "SSC Napoli":               "#12a0c3",
    "Paris Saint-Germain FC":   "#004170",
    "Olympique de Marseille":   "#009bdb",
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
                    f"403 Forbidden for {path}. Check your API key.")
            else:
                raise RuntimeError(
                    f"HTTP {resp.status_code} for {path}: {resp.text[:200]}")
        raise RuntimeError(f"Max retries exceeded for {path}")

    def get_matches(self, competition_id: str, date_from: str, date_to: str) -> list:
        data = self._get(
            f"/competitions/{competition_id}/matches",
            params={"dateFrom": date_from, "dateTo": date_to,
                    "status": "SCHEDULED,TIMED"},
        )
        return data.get("matches", [])

    def get_standings(self, competition_id: str) -> dict:
        """Get current standings to derive league position features."""
        try:
            data = self._get(f"/competitions/{competition_id}/standings")
            standings = {}
            for group in data.get("standings", []):
                if group.get("type") != "TOTAL":
                    continue
                for entry in group.get("table", []):
                    team_name = entry.get("team", {}).get("name", "")
                    standings[team_name] = {
                        "position":        entry.get("position", 0),
                        "points":          entry.get("points", 0),
                        "played":          entry.get("playedGames", 0),
                        "won":             entry.get("won", 0),
                        "drawn":           entry.get("draw", 0),
                        "lost":            entry.get("lost", 0),
                        "goals_for":       entry.get("goalsFor", 0),
                        "goals_against":   entry.get("goalsAgainst", 0),
                    }
            return standings
        except Exception as e:
            print(f"  ⚠️  Could not load standings: {e}")
            return {}


# ── Model loading ─────────────────────────────────────────────────

def load_model(model_path: str):
    if not os.path.exists(model_path):
        print(f"  ⚠️  Model not found at {model_path} — using fallback priors")
        return None
    bundle = joblib.load(model_path)
    print(f"  Model loaded: {bundle.get('model_name', '?')}  "
          f"(val_acc={bundle.get('val_accuracy', 0):.3f})")
    return bundle


def dummy_probabilities() -> dict:
    """
    Home-advantage prior calibrated to long-run European football outcomes.
    Roughly: 46% H, 26% D, 28% A across top 5 leagues.
    """
    return {"home_win": 0.46, "draw": 0.26, "away_win": 0.28}


# ── Feature construction for upcoming matches ─────────────────────

def build_features_for_upcoming(
    home_name: str,
    away_name: str,
    standings: dict,
    features_dir: str,
    bundle,
) -> dict | None:
    """
    Construct the feature vector for a future match using:
      1. League table standings (position, points, form)
      2. Historical rolling stats from features_all.csv (last known values)

    Returns a dict mapping feature_name → value, or None if data unavailable.
    """
    if bundle is None:
        return None

    features = bundle.get("features", [])

    # ── Pull last known per-team stats from features CSV ──────────
    all_feat_path = os.path.join(features_dir, "features_all.csv")
    if not os.path.exists(all_feat_path):
        return None

    try:
        df = pd.read_csv(all_feat_path, low_memory=False)
        df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
        df = df.dropna(subset=["Date"])
    except Exception as e:
        print(f"  ⚠️  Could not read features_all.csv: {e}")
        return None

    # Fuzzy team name lookup — find best match in the CSV
    def find_team_rows(df, team_name, col):
        """Return the last N rows for a team in a given column."""
        tl = team_name.lower()
        # Try exact first
        mask = df[col].str.lower() == tl
        if mask.sum() > 0:
            return df[mask]
        # Partial match
        for check in df[col].unique():
            if check and (tl in check.lower() or check.lower() in tl):
                return df[df[col] == check]
        return pd.DataFrame()

    home_as_home = find_team_rows(df, home_name, "HomeTeam")
    away_as_away = find_team_rows(df, away_name, "AwayTeam")

    if home_as_home.empty or away_as_away.empty:
        # Try alternate columns
        home_as_away = find_team_rows(df, home_name, "AwayTeam")
        away_as_home = find_team_rows(df, away_name, "HomeTeam")
        if home_as_away.empty and away_as_home.empty:
            return None

    # Use the most recent match row for each team (whichever role)
    def get_latest_row(home_rows, away_rows):
        combined = pd.concat([home_rows, away_rows], ignore_index=True)
        if combined.empty:
            return None
        return combined.sort_values("Date").iloc[-1]

    last_home = home_as_home.sort_values("Date").iloc[-1] if not home_as_home.empty else None
    last_away = away_as_away.sort_values("Date").iloc[-1] if not away_as_away.empty else None

    if last_home is None or last_away is None:
        return None

    # ── Build feature vector ──────────────────────────────────────
    row = {}
    for feat in features:
        if feat.startswith("home_"):
            row[feat] = float(last_home.get(feat, 0) or 0)
        elif feat.startswith("away_"):
            row[feat] = float(last_away.get(feat, 0) or 0)
        elif feat == "is_home":
            row[feat] = 1.0
        else:
            # Shared features — try home row first, then away
            val = last_home.get(feat)
            if val is None or (isinstance(val, float) and np.isnan(val)):
                val = last_away.get(feat, 0)
            row[feat] = float(val or 0)

    # ── Override with current standings data (more accurate) ──────
    if standings:
        home_standing = standings.get(home_name, {})
        away_standing = standings.get(away_name, {})

        # Fuzzy standing lookup
        if not home_standing:
            for k in standings:
                if home_name.lower() in k.lower() or k.lower() in home_name.lower():
                    home_standing = standings[k]
                    break
        if not away_standing:
            for k in standings:
                if away_name.lower() in k.lower() or k.lower() in away_name.lower():
                    away_standing = standings[k]
                    break

        if home_standing and away_standing:
            h_pts  = home_standing.get("points", 0)
            a_pts  = away_standing.get("points", 0)
            h_gd   = home_standing.get("goals_for", 0) - home_standing.get("goals_against", 0)
            a_gd   = away_standing.get("goals_for", 0) - away_standing.get("goals_against", 0)
            h_gf   = home_standing.get("goals_for", 0)
            a_gf   = away_standing.get("goals_for", 0)
            h_gag  = home_standing.get("goals_against", 0)
            a_gag  = away_standing.get("goals_against", 0)
            h_played = max(home_standing.get("played", 1), 1)
            a_played = max(away_standing.get("played", 1), 1)

            # Override form / goals features with live season data
            row["league_position_diff"] = float(
                away_standing.get("position", 10) - home_standing.get("position", 10)
            )
            # Approximate rolling goals from season averages
            if "home_goals_scored_5" in row:
                row["home_goals_scored_5"] = h_gf / h_played
            if "home_goals_conceded_5" in row:
                row["home_goals_conceded_5"] = h_gag / h_played
            if "away_goals_scored_5" in row:
                row["away_goals_scored_5"] = a_gf / a_played
            if "away_goals_conceded_5" in row:
                row["away_goals_conceded_5"] = a_gag / a_played
            # Win rate
            if "home_win_pct_5" in row:
                row["home_win_pct_5"] = home_standing.get("won", 0) / h_played
            if "away_win_pct_5" in row:
                row["away_win_pct_5"] = away_standing.get("won", 0) / a_played
            # Form momentum — points per game relative to expectation
            if "form_momentum_home" in row:
                ppg_h = h_pts / h_played
                row["form_momentum_home"] = float(np.clip((ppg_h - 1.3) * 5, -10, 10))
            if "form_momentum_away" in row:
                ppg_a = a_pts / a_played
                row["form_momentum_away"] = float(np.clip((ppg_a - 1.3) * 5, -10, 10))

    return row


def predict_match(bundle, home_name: str, away_name: str,
                  standings: dict, features_dir: str) -> dict:
    """Generate probability predictions for a future match."""
    if bundle is None:
        return dummy_probabilities()

    features = bundle.get("features", [])
    model = bundle.get("model")
    class_names = bundle.get("class_names", {0: "away_win", 1: "draw", 2: "home_win"})
    classes = bundle.get("classes", [0, 1, 2])

    row = build_features_for_upcoming(
        home_name, away_name, standings, features_dir, bundle
    )

    if row is None:
        print(f"  ⚠️  No features found for {home_name} vs {away_name} — using prior")
        return dummy_probabilities()

    try:
        X = np.array([[row.get(f, 0.0) for f in features]])
        probs = model.predict_proba(X)[0]
        prob_dict = {class_names[c]: float(probs[i]) for i, c in enumerate(classes)}
        for k in ("home_win", "draw", "away_win"):
            prob_dict.setdefault(k, 0.0)
        return {k: round(v, 4) for k, v in prob_dict.items()}
    except Exception as e:
        print(f"  ⚠️  Prediction error for {home_name} vs {away_name}: {e}")
        return dummy_probabilities()


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
    client = FootballDataClient(api_key)
    bundle = load_model(model_path)

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

        # Fetch current standings (used to improve feature quality)
        print(f"    Fetching standings...")
        standings = client.get_standings(comp["fd_id"])
        print(f"    {len(standings)} teams in standings table")

        try:
            matches = client.get_matches(comp["fd_id"], date_from, date_to)
        except Exception as e:
            print(f"  ✗  Failed to fetch matches: {e}")
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

            print(f"    → {home_name} vs {away_name} ({utc_date})")
            probs = predict_match(bundle, home_name, away_name, standings, features_dir)

            max_p = max(probs.values())
            confidence = "high" if max_p > 0.60 else ("moderate" if max_p > 0.50 else "contested")

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
                "confidence":         confidence,
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

    # ── Update _index.json ────────────────────────────────────────
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
        description="FutDash — Fetch upcoming fixtures from football-data.org\n\n"
                    "Get your free API key at: https://www.football-data.org/client/register\n"
                    "Then add it as FOOTBALL_DATA_API_KEY in GitHub repo Secrets.")
    p.add_argument(
        "--api-key",
        default=os.environ.get("FOOTBALL_DATA_API_KEY", ""),
    )
    p.add_argument("--leagues", nargs="+", default=list(COMPETITION_MAP.keys()))
    p.add_argument("--output-dir", default="./web/public/data/predictions")
    p.add_argument("--model", default="./scripts/model.joblib")
    p.add_argument("--features-dir", default="./scripts/features")
    p.add_argument("--days-ahead", type=int, default=14)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args()

    if not args.api_key:
        print("\n" + "="*60)
        print("  ERROR: No API key provided.")
        print()
        print("  To get your free API key:")
        print("  1. Go to https://www.football-data.org/client/register")
        print("  2. Register (free, instant, no credit card needed)")
        print("  3. Copy the API key from the confirmation email")
        print("  4. In your GitHub repo:")
        print("     Settings → Secrets and variables → Actions")
        print("     → New repository secret")
        print("     Name:  FOOTBALL_DATA_API_KEY")
        print("     Value: <your 32-char hex key>")
        print()
        print("  The next workflow run will automatically use it.")
        print("="*60 + "\n")
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
