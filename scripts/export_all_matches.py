#!/usr/bin/env python3
"""
FutDash — Batch Export All StatsBomb Matches to JSON
=====================================================
Loops over every competition/season/match in the StatsBomb open-data
and calls export_match_json() for each one, producing:
    web/public/data/matches/{match_id}.json

Then generates:
    web/public/data/index.json

Run from repo root:
    python3 scripts/export_all_matches.py \
        --base-path ./open-data/data \
        --output-dir ./web/public/data/matches \
        --index-out  ./web/public/data/index.json
"""
import os
import sys
import json
import argparse
import warnings
import traceback
from collections import defaultdict

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

# ── Add scripts/ to path so we can import from statsbomb_v9 ──────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

# Import everything we need from the v9 script
try:
    from statsbomb_v9 import (
        get_team_color,
        get_effective_color,
        compute_vaep,
        export_match_json,
        _HOME_FALLBACK,
        _AWAY_FALLBACK,
    )
except ImportError as e:
    print(f"[ERROR] Cannot import from statsbomb_v9.py: {e}")
    print("Make sure statsbomb_v9.py is in the scripts/ directory.")
    sys.exit(1)

# ── Competition flag mapping ──────────────────────────────────────
COMP_FLAGS = {
    "Premier League":           "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    "La Liga":                  "🇪🇸",
    "Bundesliga":               "🇩🇪",
    "Serie A":                  "🇮🇹",
    "Ligue 1":                  "🇫🇷",
    "Champions League":         "🏆",
    "FA Women's Super League":  "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    "FIFA World Cup":           "🌍",
    "UEFA Euro":                "🇪🇺",
    "NWSL":                     "🇺🇸",
    "Indian Super league":      "🇮🇳",
    "North American Soccer League (1968-1984)": "🌎",
    "Major League Soccer":      "🇺🇸",
}


def load_events_for_match(base_path: str, match_id: int) -> pd.DataFrame | None:
    """Load and normalise events JSON for a single match."""
    ev_path = os.path.join(base_path, "events", f"{match_id}.json")
    if not os.path.exists(ev_path):
        return None
    try:
        with open(ev_path, encoding="utf-8") as f:
            ev = json.load(f)
        ev_df = pd.json_normalize(ev)
        # Expand location into loc_x / loc_y
        if "location" in ev_df.columns:
            ev_df["loc_x"] = ev_df["location"].apply(
                lambda l: float(l[0]) if isinstance(l, list) and len(l) >= 2 else float("nan")
            )
            ev_df["loc_y"] = ev_df["location"].apply(
                lambda l: float(l[1]) if isinstance(l, list) and len(l) >= 2 else float("nan")
            )
        return ev_df
    except Exception as e:
        print(f"    [warn] Failed to load events for {match_id}: {e}")
        return None


def process_one_match(
    base_path: str,
    match_row: dict,
    comp_name: str,
    season_name: str,
    output_dir: str,
    overwrite: bool = False,
) -> dict | None:
    """
    Export JSON for a single match. Returns summary dict on success, None on failure.
    """
    match_id = match_row.get("match_id")
    out_path = os.path.join(output_dir, f"{match_id}.json")

    if not overwrite and os.path.exists(out_path):
        # Already exported — just read meta for index
        try:
            with open(out_path, encoding="utf-8") as f:
                existing = json.load(f)
            meta = existing.get("meta", {})
            return {
                "match_id":   match_id,
                "home":       meta.get("home", ""),
                "away":       meta.get("away", ""),
                "score_home": meta.get("score_home", 0),
                "score_away": meta.get("score_away", 0),
                "date":       meta.get("date", ""),
                "home_color": meta.get("home_color", "#6e7891"),
                "away_color": meta.get("away_color", "#6e7891"),
            }
        except Exception:
            pass  # Re-process if corrupt

    home = match_row.get("home_team", {}).get("home_team_name", "")
    away = match_row.get("away_team", {}).get("away_team_name", "")
    date_str = match_row.get("match_date", "")

    me = load_events_for_match(base_path, match_id)
    if me is None:
        return None

    me["match_id"] = match_id
    me["home_team"] = home
    me["away_team"] = away
    me._base_path = base_path

    # Attach home/away team name as per event team col
    # StatsBomb events already have team.name from json_normalize

    try:
        vaep_df = compute_vaep(me)
        export_match_json(
            me,
            match_id,
            home,
            away,
            vaep_df,
            output_dir=output_dir,
            comp_name=comp_name,
            season_name=season_name,
            date_str=date_str,
        )
    except Exception as e:
        print(f"    [error] match {match_id} ({home} vs {away}): {e}")
        if os.environ.get("FUTDASH_DEBUG"):
            traceback.print_exc()
        return None

    # Read back the meta from the written file for index building
    try:
        with open(out_path, encoding="utf-8") as f:
            written = json.load(f)
        meta = written.get("meta", {})
        return {
            "match_id":   match_id,
            "home":       meta.get("home", home),
            "away":       meta.get("away", away),
            "score_home": meta.get("score_home", 0),
            "score_away": meta.get("score_away", 0),
            "date":       meta.get("date", date_str),
            "home_color": meta.get("home_color", "#6e7891"),
            "away_color": meta.get("away_color", "#6e7891"),
        }
    except Exception:
        return None


def build_index(competitions_data: list, output_path: str) -> None:
    """Write index.json from accumulated competition data."""
    index = {"competitions": sorted(competitions_data, key=lambda c: c["name"])}
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    total = sum(
        len(s["matches"])
        for c in index["competitions"]
        for s in c["seasons"]
    )
    print(f"\n  index.json → {len(index['competitions'])} competitions, {total} matches")


def export_all(
    base_path: str,
    output_dir: str,
    index_out: str,
    competition_id: int | None = None,
    season_id: int | None = None,
    max_matches: int | None = None,
    overwrite: bool = False,
    verbose: bool = True,
) -> None:
    os.makedirs(output_dir, exist_ok=True)

    comp_file = os.path.join(base_path, "competitions.json")
    if not os.path.exists(comp_file):
        print(f"[ERROR] competitions.json not found at {comp_file}")
        sys.exit(1)

    with open(comp_file, encoding="utf-8") as f:
        comps = json.load(f)

    # Filter if requested
    if competition_id:
        comps = [c for c in comps if c["competition_id"] == competition_id]
    if season_id:
        comps = [c for c in comps if c["season_id"] == season_id]

    total_matches = 0
    total_exported = 0
    total_failed = 0

    # Group into competition → seasons structure for index
    comp_map: dict = {}  # competition_id → index entry

    for comp_row in comps:
        cid = comp_row["competition_id"]
        sid = comp_row["season_id"]
        comp_name = comp_row.get("competition_name", "Unknown")
        season_name = comp_row.get("season_name", "Unknown")

        m_path = os.path.join(base_path, "matches", str(cid), f"{sid}.json")
        if not os.path.exists(m_path):
            continue

        with open(m_path, encoding="utf-8") as f:
            matches = json.load(f)

        if max_matches:
            matches = matches[:max_matches]

        if verbose:
            print(f"\n  [{comp_name}] {season_name} — {len(matches)} matches")

        season_match_summaries = []

        for match_row in matches:
            match_id = match_row.get("match_id")
            home = match_row.get("home_team", {}).get("home_team_name", "?")
            away = match_row.get("away_team", {}).get("away_team_name", "?")

            if verbose:
                status = "  (exists)" if (
                    not overwrite and os.path.exists(os.path.join(output_dir, f"{match_id}.json"))
                ) else ""
                print(f"    → {match_id}: {home} vs {away}{status}")

            summary = process_one_match(
                base_path, match_row, comp_name, season_name, output_dir, overwrite
            )
            total_matches += 1
            if summary:
                season_match_summaries.append(summary)
                total_exported += 1
            else:
                total_failed += 1

        if not season_match_summaries:
            continue

        # Add to comp_map for index
        if cid not in comp_map:
            comp_map[cid] = {
                "id":      cid,
                "name":    comp_name,
                "flag":    COMP_FLAGS.get(comp_name, ""),
                "seasons": [],
            }

        comp_map[cid]["seasons"].append({
            "id":      sid,
            "name":    season_name,
            "matches": sorted(season_match_summaries, key=lambda m: m["date"], reverse=True),
        })

    # Build and write index
    build_index(list(comp_map.values()), index_out)

    print(f"\n{'='*60}")
    print(f"  Total matches processed : {total_matches}")
    print(f"  Successfully exported   : {total_exported}")
    print(f"  Failed / skipped        : {total_failed}")
    print(f"  Output directory        : {output_dir}")
    print(f"  Index                   : {index_out}")
    print(f"{'='*60}\n")


def main():
    p = argparse.ArgumentParser(
        description="FutDash — Export all StatsBomb matches to JSON")
    p.add_argument("--base-path",      default="./open-data/data",
                   help="Path to StatsBomb open-data/data directory")
    p.add_argument("--output-dir",     default="./web/public/data/matches",
                   help="Output directory for match JSON files")
    p.add_argument("--index-out",      default="./web/public/data/index.json",
                   help="Output path for index.json catalog")
    p.add_argument("--competition-id", type=int, default=None,
                   help="Only process this competition ID")
    p.add_argument("--season-id",      type=int, default=None,
                   help="Only process this season ID")
    p.add_argument("--max-matches",    type=int, default=None,
                   help="Max matches per season (for testing)")
    p.add_argument("--overwrite",      action="store_true",
                   help="Re-export even if JSON already exists")
    p.add_argument("--quiet",          action="store_true")
    args = p.parse_args()

    print(f"\n{'='*60}")
    print(f"  FutDash — Batch StatsBomb JSON Export")
    print(f"  Base path : {args.base_path}")
    print(f"  Output    : {args.output_dir}")
    print(f"{'='*60}")

    export_all(
        base_path=args.base_path,
        output_dir=args.output_dir,
        index_out=args.index_out,
        competition_id=args.competition_id,
        season_id=args.season_id,
        max_matches=args.max_matches,
        overwrite=args.overwrite,
        verbose=not args.quiet,
    )


if __name__ == "__main__":
    main()
