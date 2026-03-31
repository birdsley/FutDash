#!/usr/bin/env python3
"""
StatsBomb Match Intelligence Report v9
FutDash Phase-1 upgrade over v8 (v6 base).

New in v9:
  - get_effective_color(): WCAG luminance check → auto-lighten dark brand colors
  - draw_network(): white glow ring behind nodes; dynamic MIN_PASSES (8% of edges,
    capped at 20); path_effects stroke widened to 2.8; legend font bumped to 6.5
  - plot_xg_flow(): fill alpha reduced to 0.06; Pressure Index area chart added
    (rolling 10-min final-third entries, behind xG lines at alpha=0.04)
  - compute_vaep_roles(): per-player role tag (Finisher / Progressor / Carrier / …)
  - plot_vaep(): role badge beside each bar; dark-team label placed outside bar
  - export_match_json(): writes full match JSON sidecar for the web frontend
  - Background tokens: BG=#0f1117, BG_PANEL=#161d27, BG_CARD=#1a2235
"""
import os, sys, json, warnings, argparse, colorsys
from collections import defaultdict
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import matplotlib.patheffects as pe
from matplotlib.colors import Normalize          # noqa: F401  (kept for compat)
from matplotlib.lines import Line2D
import networkx as nx
from sklearn.preprocessing import LabelEncoder
from sklearn.ensemble import GradientBoostingRegressor
warnings.filterwarnings('ignore')

# ─────────────────────────────────────────────────────────────────
# DESIGN TOKENS  (v9: slightly lighter background tiers)
# ─────────────────────────────────────────────────────────────────
BG       = "#0f1117"   # was #0d1117
BG_PANEL = "#161d27"   # was #13181f
BG_CARD  = "#1a2235"   # was #161b22
BORDER   = "#30363d"
PITCH_G  = "#1c3a28"
LC       = "#c9d1d9"

TEAM_A   = "#58a6ff"   # home default — overridden per match
TEAM_B   = "#f0883e"   # away default — overridden per match
NEUTRAL  = "#8b949e"
GOLD     = "#e3b341"
GREEN    = "#3fb950"
WHITE    = "#e6edf3"
DIMMED   = "#484f58"
RED      = "#f85149"

plt.rcParams.update({
    "figure.facecolor": BG,     "axes.facecolor": BG_PANEL,
    "text.color":       WHITE,  "axes.labelcolor": NEUTRAL,
    "xtick.color":      NEUTRAL,"ytick.color":     NEUTRAL,
    "axes.edgecolor":   BORDER, "grid.color":      BORDER,
    "font.family":      "DejaVu Sans", "font.size": 8,
    "axes.spines.top":  False,  "axes.spines.right": False,
    "axes.titlepad":    10,
})

DEFAULT_BASE = "/Users/sambirdsley/Desktop/Datasets/statsbomb soccer/open-data/data"

# ─────────────────────────────────────────────────────────────────
# TEAM COLOR LOOKUP
# ─────────────────────────────────────────────────────────────────
TEAM_COLORS = {
    # ── Premier League ──────────────────────────────────────────
    "AFC Bournemouth":          "#e62333",
    "Bournemouth":              "#e62333",
    "Arsenal":                  "#ef0107",
    "Brighton & Hove Albion":   "#0055a9",
    "Brighton":                 "#0055a9",
    "Burnley":                  "#8ccce5",
    "Chelsea":                  "#034694",
    "Crystal Palace":           "#1b458f",
    "Everton":                  "#274488",
    "Huddersfield Town":        "#0073d2",
    "Leicester City":           "#fdbe11",
    "Liverpool":                "#00a398",
    "Manchester City":          "#98c5e9",
    "Manchester United":        "#da020e",
    "Newcastle United":         "#241f20",
    "Southampton":              "#ed1a3b",
    "Stoke City":               "#e03a3e",
    "Swansea City":             "#000000",
    "Tottenham Hotspur":        "#001c58",
    "Watford":                  "#fbee23",
    "West Bromwich Albion":     "#091453",
    "West Ham United":          "#60223b",
    "Aston Villa":              "#670e36",
    "Brentford":                "#e30613",
    "Fulham":                   "#cc0000",
    "Wolverhampton Wanderers":  "#fdb913",
    "Nottingham Forest":        "#e53233",
    "Sheffield United":         "#ee2737",
    "Luton Town":               "#f78f1e",
    "Leeds United":             "#ffcd00",
    "Norwich City":             "#00a650",
    "Cardiff City":             "#0070b5",
    "Middlesbrough":            "#e2001a",
    # ── La Liga ──────────────────────────────────────────────────
    "Barcelona":                "#a50044",
    "Real Madrid":              "#00529f",
    "Atletico Madrid":          "#cb3524",
    "Sevilla":                  "#d4021d",
    "Valencia":                 "#ff7200",
    "Villarreal":               "#f7d130",
    "Athletic Club":            "#ee2523",
    "Real Sociedad":            "#007dc5",
    "Real Betis":               "#00954c",
    "Celta Vigo":               "#81b8df",
    "Getafe":                   "#005ca9",
    "Osasuna":                  "#d0021b",
    "Granada":                  "#d40000",
    "Cadiz":                    "#f5de35",
    "Elche":                    "#007f3e",
    "Mallorca":                 "#d2001e",
    "Rayo Vallecano":           "#e8212a",
    "Espanyol":                 "#0070b8",
    "Deportivo Alaves":         "#1d4596",
    "Eibar":                    "#003da5",
    "Levante":                  "#044fa1",
    # ── Serie A ──────────────────────────────────────────────────
    "Juventus":                 "#2b2b2b",
    "Inter":                    "#010e80",
    "AC Milan":                 "#fb090b",
    "Napoli":                   "#12a0c3",
    "Roma":                     "#8e1f2f",
    "Lazio":                    "#87d8f7",
    "Atalanta":                 "#1e73be",
    "Fiorentina":               "#4c1d6f",
    "Torino":                   "#8b1a1a",
    "Sampdoria":                "#0e4c96",
    "Bologna":                  "#1e2d78",
    "Udinese":                  "#2b2b2b",
    "Verona":                   "#ffd700",
    "Sassuolo":                 "#1e8449",
    "Cagliari":                 "#cc0000",
    "Genoa":                    "#8b1010",
    "Spezia":                   "#1a2b5a",
    "Venezia":                  "#ff6600",
    "Salernitana":              "#990000",
    # ── Bundesliga ───────────────────────────────────────────────
    "Bayern Munich":            "#dc052d",
    "Borussia Dortmund":        "#fde100",
    "RB Leipzig":               "#dd0741",
    "Bayer Leverkusen":         "#e32221",
    "Borussia Monchengladbach": "#00a550",
    "Eintracht Frankfurt":      "#e1000f",
    "Wolfsburg":                "#65b32e",
    "Freiburg":                 "#d0021b",
    "Hoffenheim":               "#1457a8",
    "Hertha BSC":               "#005ca9",
    "Augsburg":                 "#ba3733",
    "Mainz 05":                 "#c3161c",
    "Stuttgart":                "#e32219",
    "Schalke 04":               "#004d9d",
    "Hamburg":                  "#005b9a",
    "Werder Bremen":            "#1d9053",
    "Union Berlin":             "#eb1923",
    # ── Ligue 1 ──────────────────────────────────────────────────
    "Paris Saint-Germain":      "#004170",
    "Marseille":                "#009bdb",
    "Lyon":                     "#be0a25",
    "Monaco":                   "#cf0921",
    "Lille":                    "#b00d18",
    "Nice":                     "#be0f0c",
    "Rennes":                   "#a10026",
    "Lens":                     "#ffd700",
    "Strasbourg":               "#0b3a8d",
    "Nantes":                   "#f0c500",
    "Montpellier":              "#e2001a",
    "Bordeaux":                 "#1a1a6c",
    "Saint-Etienne":            "#1a7232",
    "Reims":                    "#e2001a",
    # ── Women's ──────────────────────────────────────────────────
    "Chelsea FCW":              "#034694",
    "Arsenal WFC":              "#ef0107",
    "Manchester City WFC":      "#98c5e9",
    "Barcelona Femenino":       "#a50044",
    # ── International ────────────────────────────────────────────
    "France":                   "#003189",
    "Germany":                  "#3a3a3a",
    "Spain":                    "#aa151b",
    "England":                  "#cf091d",
    "Brazil":                   "#009b3a",
    "Argentina":                "#74acdf",
    "Italy":                    "#003da5",
    "Portugal":                 "#006600",
    "Netherlands":              "#ff6600",
    "Belgium":                  "#2b2b2b",
    "Croatia":                  "#cc0000",
    "Uruguay":                  "#5eb6e4",
    "Colombia":                 "#fcd116",
    "Mexico":                   "#006847",
    "United States":            "#b22234",
    "Japan":                    "#bc002d",
    "South Korea":              "#003478",
    "Australia":                "#00843d",
}

_HOME_FALLBACK = "#0a1628"
_AWAY_FALLBACK = "#c9d1d9"


def get_team_color(team_name: str, fallback: str = _HOME_FALLBACK) -> str:
    """Return the primary brand colour for a team, or a fallback."""
    if not team_name:
        return fallback
    if team_name in TEAM_COLORS:
        return TEAM_COLORS[team_name]
    tl = team_name.lower()
    for k, v in TEAM_COLORS.items():
        if tl in k.lower() or k.lower() in tl:
            return v
    return fallback


# ─────────────────────────────────────────────────────────────────
# v9 NEW: LUMINANCE-SAFE COLOR SYSTEM
# ─────────────────────────────────────────────────────────────────
def _hex_to_rgb(h: str):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4))


def _relative_luminance(hex_color: str) -> float:
    """WCAG 2.1 relative luminance."""
    def _lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = [_lin(c) for c in _hex_to_rgb(hex_color)]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def get_effective_color(hex_color: str, threshold: float = 0.06):
    """
    Return (effective_hex, is_dark).

    Colors whose WCAG relative luminance is below *threshold* are "dark" on
    the dashboard background.  For those, the hue is preserved but HSL
    lightness is increased by +35 pp (capped at 0.88) so the colour becomes
    visible while retaining brand identity.

    Pass the returned is_dark flag to drawing functions so they can place
    labels *outside* bars or add extra contrast strokes.
    """
    lum = _relative_luminance(hex_color)
    if lum >= threshold:
        return hex_color, False
    # Lighten in HLS space (Python colorsys uses HLS, not HSL)
    r, g, b = _hex_to_rgb(hex_color)
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    l2       = min(l + 0.35, 0.88)
    r2, g2, b2 = colorsys.hls_to_rgb(h, l2, s)
    lightened = '#{:02x}{:02x}{:02x}'.format(
        int(round(r2 * 255)), int(round(g2 * 255)), int(round(b2 * 255)))
    return lightened, True


# ─────────────────────────────────────────────────────────────────
# DATA LOADING
# ─────────────────────────────────────────────────────────────────
def load_data(base_path, competition_id=None, season_id=None,
              max_matches=None, verbose=True):
    comp_file = os.path.join(base_path, "competitions.json")
    if not os.path.exists(comp_file):
        raise FileNotFoundError(f"Not found: {comp_file}")
    with open(comp_file, encoding="utf-8") as f:
        comps = json.load(f)
    df = pd.DataFrame(comps)
    if competition_id: df = df[df["competition_id"] == competition_id]
    if season_id:      df = df[df["season_id"]      == season_id]
    all_events, meta = {}, {}
    for _, row in df.iterrows():
        cid, sid = row["competition_id"], row["season_id"]
        m_path = os.path.join(base_path, "matches", str(cid), f"{sid}.json")
        if not os.path.exists(m_path): continue
        with open(m_path, encoding="utf-8") as f: matches = json.load(f)
        mdf = pd.json_normalize(matches)
        if max_matches: mdf = mdf.head(max_matches)
        evlist = []
        for _, mrow in mdf.iterrows():
            mid = mrow["match_id"]; meta[mid] = mrow
            ev_path = os.path.join(base_path, "events", f"{mid}.json")
            if not os.path.exists(ev_path): continue
            with open(ev_path, encoding="utf-8") as f: ev = json.load(f)
            ev_df = pd.json_normalize(ev)
            ev_df["match_id"]  = mid
            ev_df["home_team"] = mrow.get("home_team.home_team_name", "")
            ev_df["away_team"] = mrow.get("away_team.away_team_name", "")
            evlist.append(ev_df)
        if evlist:
            c = pd.concat(evlist, ignore_index=True)
            all_events[(cid, sid)] = c
            if verbose:
                print(f"  [ok] {row.get('competition_name','?')} "
                      f"{row.get('season_name','?')} "
                      f"[{len(evlist)} matches / {len(c):,} events]")
    return df, all_events, meta


def load_lineups(base_path, match_id):
    ln = os.path.join(base_path, "lineups", f"{match_id}.json")
    result = {}
    if not os.path.exists(ln): return result
    with open(ln, encoding="utf-8") as f: raw = json.load(f)
    for tb in raw:
        for p in tb.get("lineup", []):
            name      = p.get("player_name", "")
            positions = p.get("positions", [])
            is_starter = any(pos.get("start_reason") == "Starting XI" for pos in positions)
            sub_min = None
            for pos in positions:
                if pos.get("start_reason") in ("Substitution", "Tactical Shift"):
                    try: sub_min = int(str(pos.get("from", "0:0")).split(":")[0])
                    except Exception: pass
            result[name] = {"starter": is_starter, "sub_minute": sub_min}
    return result


def get_combined(all_events):
    if not all_events: raise RuntimeError("No events loaded.")
    df = pd.concat(list(all_events.values()), ignore_index=True)
    if "location" in df.columns:
        df["loc_x"] = df["location"].apply(
            lambda l: float(l[0]) if isinstance(l, list) and len(l) >= 2 else np.nan)
        df["loc_y"] = df["location"].apply(
            lambda l: float(l[1]) if isinstance(l, list) and len(l) >= 2 else np.nan)
    return df


def pick_match(combined, match_id=None):
    if match_id and "match_id" in combined.columns:
        m = combined[combined["match_id"] == match_id]
        if len(m) >= 200: return m.copy()
    if "match_id" in combined.columns:
        best = combined["match_id"].value_counts().idxmax()
        m    = combined[combined["match_id"] == best].copy()
        print(f"  Using match_id={best}  ({len(m)} events)")
        return m
    return combined.copy()


# ─────────────────────────────────────────────────────────────────
# PITCH
# ─────────────────────────────────────────────────────────────────
def draw_pitch(ax, alpha=0.45):
    ax.set_facecolor(PITCH_G)
    ax.set_xlim(-3, 123); ax.set_ylim(-3, 83)
    ax.set_aspect('equal'); ax.axis('off')
    kw = dict(color=LC, lw=1.1, alpha=alpha, zorder=2)
    ax.plot([0,120,120,0,0],[0,0,80,80,0],**kw)
    ax.plot([60,60],[0,80],**kw)
    ax.add_patch(plt.Circle((60,40),10,fill=False,**kw))
    ax.plot(60,40,'o',color=LC,ms=2.5,alpha=alpha,zorder=2)
    for x0,w in [(0,18),(102,18)]:
        ax.add_patch(patches.Rectangle((x0,18),w,44,fill=False,ec=LC,lw=1.1,alpha=alpha))
    for x0,w in [(0,6),(114,6)]:
        ax.add_patch(patches.Rectangle((x0,30),w,20,fill=False,ec=LC,lw=1.1,alpha=alpha))
    for xp in [12,108]:
        ax.plot(xp,40,'o',color=LC,ms=2,alpha=alpha,zorder=2)
        th=np.linspace(0,2*np.pi,200)
        ax_=xp+10*np.cos(th); ay_=40+10*np.sin(th)
        mask=(ax_>18) if xp==12 else (ax_<102)
        ax.plot(ax_[mask],ay_[mask],**kw)
    for xg in [0,120]:
        ax.add_patch(patches.Rectangle(
            (xg if xg==0 else xg-2, 36), 2, 8,
            fill=False, ec=LC, lw=1.1, alpha=alpha))


# ─────────────────────────────────────────────────────────────────
# SCORE BANNER
# ─────────────────────────────────────────────────────────────────
def draw_score_banner(fig, me, home, away, comp, season, top=0.982, h=0.100):
    ax = fig.add_axes([0.04, top-h, 0.92, h])
    ax.set_facecolor(BG_CARD); ax.set_xlim(0,1); ax.set_ylim(0,1); ax.axis('off')
    ax.add_patch(patches.FancyBboxPatch((0.001,0.02),0.998,0.96,
        boxstyle="round,pad=0.005",fill=False,ec=BORDER,lw=0.8))

    sh=sa=0
    if "shot.outcome.name" in me.columns and "team.name" in me.columns:
        s=me[me["type.name"]=="Shot"]
        sh=int((s[s["team.name"]==home]["shot.outcome.name"]=="Goal").sum())
        sa=int((s[s["team.name"]==away]["shot.outcome.name"]=="Goal").sum())
    xgh=xga=np.nan
    if "shot.statsbomb_xg" in me.columns:
        s=me[me["type.name"]=="Shot"]
        xgh=s[s["team.name"]==home]["shot.statsbomb_xg"].sum()
        xga=s[s["team.name"]==away]["shot.statsbomb_xg"].sum()
    eh=(me["team.name"]==home).sum() if "team.name" in me.columns else 0
    ea=(me["team.name"]==away).sum() if "team.name" in me.columns else 0
    ph=eh/(eh+ea)*100 if (eh+ea)>0 else 50
    nsh=nsa=0
    if "type.name" in me.columns:
        s=me[me["type.name"]=="Shot"]
        if "team.name" in s.columns:
            nsh=int((s["team.name"]==home).sum())
            nsa=int((s["team.name"]==away).sum())

    scorers={home:[],away:[]}
    if "shot.outcome.name" in me.columns and "team.name" in me.columns:
        goals=me[(me["type.name"]=="Shot")&(me["shot.outcome.name"]=="Goal")]
        if "player.name" in goals.columns and "minute" in goals.columns:
            for _,g in goals.sort_values("minute").iterrows():
                t=g.get("team.name",""); p=g.get("player.name",""); m=int(g.get("minute",0))
                ln=p.split()[-1] if p else "?"
                entry=f"⚽  {ln}  {m}'"
                if t==home: scorers[home].append(entry)
                elif t==away: scorers[away].append(entry)

    ax.text(0.5,0.96,f"{comp}  ·  {season}",
            ha='center',va='top',fontsize=7,color=DIMMED,transform=ax.transAxes)

    SCORE_Y=0.56; SCORER_TOP=0.80; SCORER_FS=11; SCORER_GAP=0.175

    ax.text(0.04,SCORE_Y,home,ha='left',va='center',fontsize=38,
            color=TEAM_A,fontweight='bold',transform=ax.transAxes)
    ax.text(0.96,SCORE_Y,away,ha='right',va='center',fontsize=38,
            color=TEAM_B,fontweight='bold',transform=ax.transAxes)
    ax.text(0.415,SCORE_Y,str(sh),ha='center',va='center',fontsize=46,
            color=WHITE,fontweight='bold',transform=ax.transAxes)
    ax.text(0.500,SCORE_Y,"–",ha='center',va='center',fontsize=32,
            color=NEUTRAL,transform=ax.transAxes)
    ax.text(0.585,SCORE_Y,str(sa),ha='center',va='center',fontsize=46,
            color=WHITE,fontweight='bold',transform=ax.transAxes)

    for i,entry in enumerate(scorers[home]):
        ax.text(0.385,SCORER_TOP-i*SCORER_GAP,entry,ha='right',va='top',
                fontsize=SCORER_FS,color=TEAM_A,style='italic',fontweight='bold',
                transform=ax.transAxes)
    for i,entry in enumerate(scorers[away]):
        ax.text(0.615,SCORER_TOP-i*SCORER_GAP,entry,ha='left',va='top',
                fontsize=SCORER_FS,color=TEAM_B,style='italic',fontweight='bold',
                transform=ax.transAxes)

    xgh_s=f"{xgh:.2f}" if not np.isnan(xgh) else "–"
    xga_s=f"{xga:.2f}" if not np.isnan(xga) else "–"
    ax.text(0.5,0.08,
            f"xG  {xgh_s} – {xga_s}     Shots  {nsh} – {nsa}     Possession  {ph:.0f}% – {100-ph:.0f}%",
            ha='center',va='center',fontsize=9,color=NEUTRAL,transform=ax.transAxes)
    return sh,sa,xgh,xga,ph,nsh,nsa


def draw_insight_strip(fig,me,home,away,gh,ga,xgh,xga,ph,nsh,nsa,y):
    bullets=[]
    if not(np.isnan(xgh) or np.isnan(xga)):
        diff=abs(xgh-xga); dom=home if xgh>xga else away
        if diff>0.5: bullets.append(f"{dom} created {diff:.2f} more xG — dominant territorial control")
        else: bullets.append(f"Closely contested: {home} {xgh:.2f} xG vs {away} {xga:.2f} xG")
    if ph>58:   bullets.append(f"{home} controlled possession ({ph:.0f}%) — structured build-up play")
    elif ph<42: bullets.append(f"{away} dominated possession ({100-ph:.0f}%) — {home} sat deep and defended")
    else:       bullets.append("Even possession — contested midfield throughout")
    ch=gh/max(nsh,1); ca=ga/max(nsa,1)
    if gh>ga and ch>0.15: bullets.append(f"{home} clinical: {gh}G from {nsh} shots ({ch*100:.0f}%)")
    elif ga>gh and ca>0.15: bullets.append(f"{away} clinical: {ga}G from {nsa} shots ({ca*100:.0f}%)")
    else: bullets.append(f"{nsh+nsa} shots combined, {gh+ga} goals — goalkeepers influential")
    for i,b in enumerate(bullets[:3]):
        fig.text(0.5,y-i*0.014,f"▸  {b}",ha='center',
                 color=GOLD if i==0 else WHITE,fontsize=9,alpha=0.92,transform=fig.transFigure)


def section_label(fig,y,number,title,question):
    fig.text(0.005,y+0.005,str(number),fontsize=52,color=WHITE,
             fontweight='bold',alpha=0.06,va='top',transform=fig.transFigure)
    fig.add_artist(plt.Line2D([0.04,0.96],[y+0.003,y+0.003],
                              transform=fig.transFigure,color=BORDER,lw=0.8))
    fig.text(0.04,y-0.004,title,fontsize=12,color=WHITE,
             fontweight='bold',va='top',transform=fig.transFigure)
    fig.text(0.04,y-0.020,question,fontsize=8,color=NEUTRAL,
             style='italic',va='top',transform=fig.transFigure)


# ─────────────────────────────────────────────────────────────────
# PASSING NETWORK  (v9: glow ring, dynamic MIN_PASSES, wider labels)
# ─────────────────────────────────────────────────────────────────
def draw_network(ax, me, team, col, lineup_info, global_max, mirror=False):
    """col is already the luminance-corrected effective color."""
    draw_pitch(ax)
    te     = me[me["team.name"]==team].copy() if "team.name" in me.columns else pd.DataFrame()
    passes = te[te["type.name"]=="Pass"].copy() if "type.name" in te.columns else pd.DataFrame()
    if "pass.outcome.name" in passes.columns:
        passes = passes[passes["pass.outcome.name"].isna()]

    edges_raw = defaultdict(int)
    pos_acc   = defaultdict(list)
    for _,r in passes.iterrows():
        src=r.get("player.name"); tgt=r.get("pass.recipient.name"); loc=r.get("location")
        if src and tgt and src!=tgt and isinstance(loc,list) and len(loc)==2:
            edges_raw[(src,tgt)]+=1
            pos_acc[src].append([float(loc[0]),float(loc[1])])

    # v9: dynamic threshold — 8% of total raw edges, min 3, cap at 20 heaviest
    n_raw      = len(edges_raw)
    MIN_PASSES = max(3, int(n_raw * 0.08))
    edges      = {k:v for k,v in edges_raw.items() if v>=MIN_PASSES}
    if len(edges) > 20:
        edges  = dict(sorted(edges.items(), key=lambda kv: -kv[1])[:20])

    if not edges:
        ax.text(60,40,"Insufficient\npass data",ha='center',va='center',color=WHITE,fontsize=9)
        ax.set_title(team,color=col,fontsize=11,fontweight='bold',pad=10); return

    avg_pos={p:np.mean(v,axis=0) for p,v in pos_acc.items()
             if p in {k for pair in edges for k in pair}}

    G=nx.DiGraph()
    for (s,t),w in edges.items():
        if s in avg_pos and t in avg_pos: G.add_edge(s,t,weight=w)
    if len(G.nodes())==0: return

    def mx(x): return 120.0-float(x) if mirror else float(x)
    npos={n:(mx(avg_pos[n][0]),float(avg_pos[n][1])) for n in G.nodes() if n in avg_pos}

    max_w=max(global_max,1)
    try:    ev_c=nx.eigenvector_centrality(G,weight='weight',max_iter=500)
    except: ev_c={n:G.degree(n,weight='weight') for n in G.nodes()}
    btw=nx.betweenness_centrality(G,weight='weight')
    max_ev=max(ev_c.values()) or 1
    total_deg=sum(dict(G.degree(weight='weight')).values()) or 1

    for u,v,d in G.edges(data=True):
        if u not in npos or v not in npos: continue
        x1,y1=npos[u]; x2,y2=npos[v]; w=d['weight']
        dx=(x2-x1)*(-1 if mirror else 1)
        ec=col if dx>4 else (DIMMED if dx<-4 else GREEN)
        lw=0.5+3.5*(w/max_w); alp=0.12+0.68*(w/max_w)
        ax.annotate("",xy=(x2,y2),xytext=(x1,y1),
                    arrowprops=dict(arrowstyle="-|>",color=ec,lw=lw,
                                   alpha=alp,mutation_scale=8),zorder=3)

    top2=sorted(btw.items(),key=lambda x:-x[1])[:2]
    playmaker_set={h[0] for h in top2}

    for node,(x,y) in npos.items():
        t_share=G.degree(node,weight='weight')/total_deg
        size=55+400*t_share
        ev_n=ev_c.get(node,0)/max_ev
        base_alp=0.95 if ev_n>0.25 else 0.60
        info=lineup_info.get(node,{})
        is_starter=info.get("starter",True)

        # v9: white glow ring behind the main node
        ax.scatter(x,y,s=size*1.55,
                   facecolors='none',edgecolors='white',
                   linewidths=2.0,zorder=4,alpha=0.14)

        face=col if is_starter else "none"
        ew=2.5 if node in playmaker_set else (1.4 if is_starter else 1.6)
        ec2=GOLD if node in playmaker_set else (WHITE if is_starter else col)
        ax.scatter(x,y,s=size,facecolors=face,edgecolors=ec2,
                   linewidths=ew,zorder=5,alpha=base_alp)

        short=node.split()[-1][:11] if node else ""
        sm=info.get("sub_minute",None)
        if sm and not is_starter: short=f"{short}({sm}')"

        # v9: path_effects stroke widened to 2.8
        ax.text(x,y+3.2,short,ha='center',va='bottom',fontsize=5.5,
                color=WHITE,fontweight='bold' if node in playmaker_set else 'normal',
                zorder=6,alpha=base_alp,
                path_effects=[pe.withStroke(linewidth=2.8,foreground='black')])

    if top2 and top2[0][0] in npos:
        hn=top2[0][0]; hx,hy=npos[hn]; bv=top2[0][1]
        ox=float(np.clip(min(hx+14,110) if hx<=80 else max(hx-14,10), 10, 110))
        oy=float(np.clip(min(hy+12,72), 8, 72))
        ax.annotate(f"Playmaker: {hn.split()[-1]} (btw={bv:.2f})",
                    xy=(hx,hy),xytext=(ox,oy),fontsize=6,color=GOLD,fontweight='bold',
                    arrowprops=dict(arrowstyle='->',color=GOLD,lw=0.9,alpha=0.85),zorder=9)

    ax.set_title(team,color=col,fontsize=11,fontweight='bold',pad=10)
    if not mirror:
        leg=[Line2D([0],[0],color=col,lw=2,label='Forward pass'),
             Line2D([0],[0],color=GREEN,lw=2,label='Lateral pass'),
             Line2D([0],[0],color=DIMMED,lw=2,label='Backward pass'),
             Line2D([0],[0],marker='o',color='none',markerfacecolor=WHITE,
                    markersize=6,label='Starter'),
             Line2D([0],[0],marker='o',color='none',markerfacecolor=col,
                    markersize=7,markeredgecolor=GOLD,markeredgewidth=2,label="Playmaker")]
        # v9: legend font bumped from 5.2 → 6.5
        ax.legend(handles=leg,loc='lower left',fontsize=6.5,framealpha=0.20,
                  facecolor=BG,labelcolor=WHITE,handlelength=1.1,
                  borderpad=0.4,labelspacing=0.28,handletextpad=0.4)


# ─────────────────────────────────────────────────────────────────
# v9 NEW: PRESSURE INDEX  (rolling 10-min final-third entries)
# ─────────────────────────────────────────────────────────────────
def _compute_pressure_index(me, team, is_home, n_minutes=92):
    """
    Returns a numpy array of length n_minutes, normalised 0–1.
    Home final third: loc_x > 80.  Away final third (mirrored): loc_x < 40.
    """
    if "type.name" not in me.columns or "minute" not in me.columns:
        return np.zeros(n_minutes)
    if "team.name" not in me.columns:
        return np.zeros(n_minutes)
    te = me[me["team.name"] == team].copy()
    if len(te) == 0:
        return np.zeros(n_minutes)
    relevant = {"Pass","Carry","Ball Receipt*","Shot"}
    if "type.name" in te.columns:
        te = te[te["type.name"].isin(relevant)]
    if "loc_x" not in te.columns:
        return np.zeros(n_minutes)
    threshold_x = 80 if is_home else 40
    cmp = (te["loc_x"] > threshold_x) if is_home else (te["loc_x"] < threshold_x)
    te  = te[cmp & te["loc_x"].notna()]
    counts = np.zeros(n_minutes)
    for m in te["minute"].dropna().astype(int):
        m = min(m, n_minutes-1)
        counts[m] += 1
    rolling = np.zeros(n_minutes)
    for i in range(n_minutes):
        rolling[i] = counts[max(0, i-9):i+1].sum()
    mx = rolling.max()
    if mx > 0: rolling /= mx
    return rolling


# ─────────────────────────────────────────────────────────────────
# xG CUMULATIVE FLOW  (v9: pressure index overlay, fill alpha 0.06)
# ─────────────────────────────────────────────────────────────────
def plot_xg_flow(ax, me, home, away, key_events=None):
    ax.set_facecolor(BG_PANEL)
    if "type.name" not in me.columns:
        ax.text(0.5,0.5,"No data",transform=ax.transAxes,ha='center',va='center',color=NEUTRAL); return
    shots=me[me["type.name"]=="Shot"].copy()
    if len(shots)==0:
        ax.text(0.5,0.5,"No shots",transform=ax.transAxes,ha='center',va='center',color=NEUTRAL); return
    if "shot.statsbomb_xg" not in shots.columns: shots["shot.statsbomb_xg"]=0.07
    if "minute" not in shots.columns:
        ax.text(0.5,0.5,"No minute data",transform=ax.transAxes,ha='center',va='center',color=NEUTRAL); return

    shots["minute"]=shots["minute"].fillna(0).astype(int)
    shots["xg"]=shots["shot.statsbomb_xg"].fillna(0.05)
    minutes=np.arange(0,92)
    cum_h=np.zeros(92); cum_a=np.zeros(92)
    for _,r in shots.iterrows():
        m=min(int(r["minute"]),91); x=float(r["xg"])
        if r.get("team.name","")==home: cum_h[m:]+=x
        else:                           cum_a[m:]+=x

    # v9: Pressure Index — very faint area, drawn before the xG lines (zorder=1)
    y_scale=max(cum_h.max(), cum_a.max(), 0.1)
    pi_h=_compute_pressure_index(me, home, is_home=True)
    pi_a=_compute_pressure_index(me, away, is_home=False)
    ax.fill_between(minutes, pi_h*y_scale, alpha=0.04, color=TEAM_A, zorder=1)
    ax.fill_between(minutes, pi_a*y_scale, alpha=0.04, color=TEAM_B, zorder=1)

    # v9: main xG — fill alpha reduced 0.10 → 0.06
    ax.plot(minutes,cum_h,color=TEAM_A,lw=2.5,alpha=0.95,label=home,  zorder=3)
    ax.fill_between(minutes,cum_h,alpha=0.06,color=TEAM_A,             zorder=2)
    ax.plot(minutes,cum_a,color=TEAM_B,lw=2.5,alpha=0.95,label=away,  zorder=3)
    ax.fill_between(minutes,cum_a,alpha=0.06,color=TEAM_B,             zorder=2)

    ax.axvspan(44,46,color=NEUTRAL,alpha=0.06)
    ax.axvline(45,color=NEUTRAL,lw=1.0,ls=':',alpha=0.4)
    ymax=ax.get_ylim()[1] if ax.get_ylim()[1]>0 else 1
    ax.text(46,ymax*0.92,"HT",color=NEUTRAL,fontsize=7,alpha=0.55)

    if key_events:
        for (minute,label,team_ev) in key_events[:8]:
            c=TEAM_A if team_ev==home else TEAM_B
            ax.axvline(minute,color=c,lw=1.6,ls='--',alpha=0.8)
            ymax2=ax.get_ylim()[1]
            ax.text(minute+0.7,ymax2*0.82,label,color=c,fontsize=6,rotation=90,
                    va='top',fontweight='bold')

    xgh_f=cum_h[-1]; xga_f=cum_a[-1]
    ax.text(91.5,xgh_f,f"{xgh_f:.2f}",color=TEAM_A,fontsize=7.5,fontweight='bold',va='center')
    ax.text(91.5,xga_f,f"{xga_f:.2f}",color=TEAM_B,fontsize=7.5,fontweight='bold',va='center')

    ax.set_xlabel("Match Minute",fontsize=8,labelpad=5)
    ax.set_ylabel("Cumulative xG",fontsize=8,labelpad=5)
    ax.tick_params(labelsize=7)
    ax.spines['left'].set_color(BORDER); ax.spines['bottom'].set_color(BORDER)
    ax.grid(alpha=0.10,lw=0.5)
    ax.legend(fontsize=8,loc='upper left',framealpha=0.2,labelcolor=WHITE,
              facecolor=BG,borderpad=0.5)
    ax.set_title("xG Flow  —  How Did Chances Build?",color=WHITE,fontsize=11,fontweight='bold')
    ax.text(0.5,-0.12,
            "Steeper slope = burst of dangerous play  ·  Dashed lines = goals  ·  Faint area = final-third pressure",
            transform=ax.transAxes,ha='center',color=NEUTRAL,fontsize=7,style='italic',clip_on=False)


# ─────────────────────────────────────────────────────────────────
# POSSESSION ORIGIN ARROWS
# ─────────────────────────────────────────────────────────────────
def plot_possession_arrows(ax,me,home,away):
    draw_pitch(ax)
    if "type.name" not in me.columns:
        ax.set_title("Possession Origins → Shots",color=WHITE,fontsize=11,fontweight='bold',pad=10); return
    df=me.copy()
    if "loc_x" not in df.columns:
        df["loc_x"]=df["location"].apply(lambda l:float(l[0]) if isinstance(l,list) and len(l)>=2 else np.nan)
        df["loc_y"]=df["location"].apply(lambda l:float(l[1]) if isinstance(l,list) and len(l)>=2 else np.nan)
    df=df.reset_index(drop=True)
    shots_idx=df.index[df["type.name"]=="Shot"].tolist()
    if not shots_idx:
        ax.text(60,40,"No shots",ha='center',va='center',color=WHITE,fontsize=9)
        ax.set_title("Possession Origins → Shots",color=WHITE,fontsize=11,fontweight='bold',pad=10); return

    zone_cnt={home:{"Left":0,"Central":0,"Right":0},away:{"Left":0,"Central":0,"Right":0}}
    plotted=0
    for sidx in shots_idx:
        row=df.iloc[sidx]; sx=row.get("loc_x",np.nan); sy=row.get("loc_y",np.nan)
        if np.isnan(sx) or np.isnan(sy): continue
        team=row.get("team.name",""); col=TEAM_A if team==home else TEAM_B
        is_goal=row.get("shot.outcome.name","")=="Goal"
        ox=oy=None
        for b in range(1,16):
            if sidx-b<0: break
            prev=df.iloc[sidx-b]
            if prev.get("team.name","")!=team: break
            if prev.get("period",1)!=row.get("period",1): break
            px=prev.get("loc_x",np.nan); py=prev.get("loc_y",np.nan)
            if not(np.isnan(px) or np.isnan(py)): ox=px; oy=py
        if ox is None: ox=sx; oy=sy
        zone="Left" if oy<27 else("Right" if oy>53 else "Central")
        if team in zone_cnt: zone_cnt[team][zone]+=1
        if abs(ox-sx)>5 or abs(oy-sy)>5:
            ax.annotate("",xy=(sx,sy),xytext=(ox,oy),
                        arrowprops=dict(arrowstyle="-|>",color=col,lw=0.9,
                                       alpha=0.50,mutation_scale=7),zorder=3)
        if is_goal: ax.scatter(sx,sy,s=90,c=GOLD,marker='*',edgecolors=WHITE,linewidths=0.5,zorder=6)
        else:       ax.scatter(sx,sy,s=22,facecolors=col,edgecolors='none',zorder=4,alpha=0.65)
        plotted+=1

    for ti,(team,tc) in enumerate([(home,TEAM_A),(away,TEAM_B)]):
        zc=zone_cnt.get(team,{}); tot=sum(zc.values()) or 1
        dom=max(zc,key=zc.get,default="–"); pct=zc.get(dom,0)/tot*100
        bx=30 if ti==0 else 90
        ax.text(bx,6,f"{team.split()[-1]}: {pct:.0f}% {dom}",
                ha='center',color=tc,fontsize=6.5,fontweight='bold',zorder=8,
                bbox=dict(facecolor=BG,edgecolor=tc,lw=0.7,pad=2.5,alpha=0.82,boxstyle='round,pad=0.3'))

    leg=[Line2D([0],[0],color=TEAM_A,lw=1.5,label=f"{home}"),
         Line2D([0],[0],color=TEAM_B,lw=1.5,label=f"{away}"),
         Line2D([0],[0],marker='*',color='none',markerfacecolor=GOLD,markersize=9,label='Goal'),
         Line2D([0],[0],marker='o',color='none',markerfacecolor=NEUTRAL,markersize=6,label='Shot')]
    ax.legend(handles=leg,loc='upper left',fontsize=6,framealpha=0.20,
              facecolor=BG,labelcolor=WHITE,borderpad=0.4,labelspacing=0.3)
    ax.set_title("Possession Origins → Shots",color=WHITE,fontsize=11,fontweight='bold',pad=10)
    ax.text(0.5,-0.07,
            f"Arrow: possession start → shot endpoint  ·  {plotted} shots  ·  Zone box = dominant origin",
            transform=ax.transAxes,ha='center',color=NEUTRAL,fontsize=7,style='italic',clip_on=False)


# ─────────────────────────────────────────────────────────────────
# SHOT MAP
# ─────────────────────────────────────────────────────────────────
def plot_shot_map(ax,me,home,away):
    draw_pitch(ax)
    if "type.name" not in me.columns:
        ax.set_title("Shot Map",color=WHITE,fontsize=11,fontweight='bold',pad=10); return
    shots=me[me["type.name"]=="Shot"].copy()
    if "loc_x" not in shots.columns:
        shots["loc_x"]=shots["location"].apply(lambda l:float(l[0]) if isinstance(l,list) else np.nan)
        shots["loc_y"]=shots["location"].apply(lambda l:float(l[1]) if isinstance(l,list) else np.nan)
    shots=shots[shots["loc_x"].notna()].copy()
    if len(shots)==0:
        ax.text(60,40,"No shots",ha='center',va='center',color=WHITE,fontsize=9)
        ax.set_title("Shot Map",color=WHITE,fontsize=11,fontweight='bold',pad=10); return

    shots["goal"]=shots["shot.outcome.name"]=="Goal" if "shot.outcome.name" in shots.columns else False
    shots["xg"]=(shots["shot.statsbomb_xg"].fillna(0.05) if "shot.statsbomb_xg" in shots.columns else 0.05).clip(0.01,0.75)

    np.random.seed(13)
    for _,row in shots.iterrows():
        is_home=row.get("team.name","")==home
        sx=float(row["loc_x"]); sy=float(row["loc_y"])
        if not is_home: sx=120.0-sx; sy=80.0-sy
        sx=float(np.clip(sx+np.random.normal(0,0.4),0,120))
        sy=float(np.clip(sy+np.random.normal(0,0.4),0,80))
        col=TEAM_A if is_home else TEAM_B; xg=float(row["xg"])
        size=max(xg*220,16); size=min(size,160)
        if row["goal"]:
            ax.scatter(sx,sy,s=size*1.8,c=GOLD,marker='*',edgecolors=WHITE,linewidths=0.6,zorder=6,alpha=1.0)
        else:
            ax.scatter(sx,sy,s=size,facecolors=col,edgecolors='none',zorder=4,alpha=0.60)

    sh=shots[shots["team.name"]==home]; sa=shots[shots["team.name"]==away]
    xh=sh["xg"].sum(); xa=sa["xg"].sum(); gh=int(sh["goal"].sum()); ga=int(sa["goal"].sum())
    ax.text(108,72,f"{home.split()[-1]}\nxG {xh:.2f} / {gh}G",
            ha='center',va='center',color=TEAM_A,fontsize=6.5,fontweight='bold',
            zorder=7,bbox=dict(facecolor=BG,alpha=0.6,edgecolor='none',pad=2))
    ax.text(12,72,f"{away.split()[-1]}\nxG {xa:.2f} / {ga}G",
            ha='center',va='center',color=TEAM_B,fontsize=6.5,fontweight='bold',
            zorder=7,bbox=dict(facecolor=BG,alpha=0.6,edgecolor='none',pad=2))

    for team,tc in [(home,TEAM_A),(away,TEAM_B)]:
        ts=shots[shots["team.name"]==team]
        if len(ts)==0: continue
        best=ts.nlargest(1,"xg").iloc[0]
        bx=float(best["loc_x"]); by=float(best["loc_y"])
        if team==away: bx=120-bx; by=80-by
        ox=min(bx+10,112) if bx<60 else max(bx-10,8)
        oy=min(by+10,74) if by<40 else max(by-10,6)
        ax.annotate(f"Best: {best['xg']:.2f}xG",xy=(bx,by),xytext=(ox,oy),
                    fontsize=5.8,color=tc,fontweight='bold',
                    arrowprops=dict(arrowstyle='->',color=tc,lw=0.7),zorder=9)

    ax.text(28,76,"← away attacks",ha='center',color=TEAM_B,fontsize=6.5,alpha=0.65,zorder=7)
    ax.text(92,76,"home attacks →",ha='center',color=TEAM_A,fontsize=6.5,alpha=0.65,zorder=7)
    leg=[Line2D([0],[0],marker='o',color='none',markerfacecolor=TEAM_A,markersize=8,label=home),
         Line2D([0],[0],marker='o',color='none',markerfacecolor=TEAM_B,markersize=8,label=away),
         Line2D([0],[0],marker='*',color='none',markerfacecolor=GOLD,markersize=10,label='Goal'),
         Line2D([0],[0],marker='o',color='none',markerfacecolor=NEUTRAL,
                markersize=7,label='Shot  (size = xG)')]
    ax.legend(handles=leg,loc='lower right',fontsize=6,framealpha=0.2,facecolor=BG,
              labelcolor=WHITE,borderpad=0.4)
    ax.set_title("Shot Map  —  Both Teams",color=WHITE,fontsize=11,fontweight='bold',pad=10)
    ax.text(0.5,-0.07,"Both teams attack right for comparison  ·  Gold star = goal  ·  Size = xG",
            transform=ax.transAxes,ha='center',color=NEUTRAL,fontsize=7,style='italic',clip_on=False)


# ─────────────────────────────────────────────────────────────────
# VAEP  (v9: role tags + dark-team outside-bar labels)
# ─────────────────────────────────────────────────────────────────
def compute_vaep(me):
    ATYPES=["Pass","Carry","Shot","Dribble","Pressure","Ball Receipt*","Duel","Clearance"]
    df=me.copy()
    if "type.name" not in df.columns: return None
    df=df[df["type.name"].isin(ATYPES)].copy()
    if "loc_x" not in df.columns:
        df["loc_x"]=df["location"].apply(lambda l:float(l[0]) if isinstance(l,list) and len(l)>=2 else np.nan)
        df["loc_y"]=df["location"].apply(lambda l:float(l[1]) if isinstance(l,list) and len(l)>=2 else np.nan)
    df=df[df["loc_x"].notna()].copy()
    if len(df)<30: return None
    df["dist"]=np.sqrt((120-df["loc_x"])**2+(40-df["loc_y"])**2)
    df["angle"]=np.arctan2(np.abs(df["loc_y"]-40),np.maximum(120-df["loc_x"],0.1))
    df["press"]=df["under_pressure"].fillna(False).astype(int) if "under_pressure" in df.columns else 0
    df["plen"]=df["pass.length"].fillna(0) if "pass.length" in df.columns else 0
    le=LabelEncoder(); df["ae"]=le.fit_transform(df["type.name"])
    df=df.reset_index(drop=True)
    dxg=np.zeros(len(df))
    xc="shot.statsbomb_xg" if "shot.statsbomb_xg" in df.columns else None
    for i in range(len(df)-5):
        w=df.iloc[i+1:i+6]; s=w[w["type.name"]=="Shot"]
        if len(s)>0: dxg[i]=float(s[xc].fillna(0.05).max()) if xc else 0.05
    df["dxg"]=dxg
    X=df[["ae","loc_x","loc_y","dist","angle","press","plen"]].values
    try:
        m=GradientBoostingRegressor(n_estimators=60,max_depth=3,learning_rate=0.1,random_state=42)
        m.fit(X,df["dxg"].values); df["vaep"]=m.predict(X)
    except: df["vaep"]=df["dxg"]
    return df


def compute_vaep_roles(vaep_df):
    """
    Per-player role tag based on which action type contributes the most
    cumulative VAEP for that player.

    Returns dict: { player_name: role_string }
    """
    if vaep_df is None or "player.name" not in vaep_df.columns:
        return {}
    ROLE_MAP = {
        "Shot":          "Finisher",
        "Pass":          "Progressor",
        "Carry":         "Carrier",
        "Dribble":       "Carrier",
        "Pressure":      "Presser",
        "Duel":          "Presser",
        "Clearance":     "Defender",
        "Ball Receipt*": "Contributor",
    }
    roles = {}
    for player, grp in vaep_df.groupby("player.name"):
        agg = grp.groupby("type.name")["vaep"].sum()
        roles[player] = ROLE_MAP.get(agg.idxmax() if len(agg) else "", "Contributor")
    return roles


_ROLE_BADGE = {
    "Finisher":    "🎯 Finisher",
    "Progressor":  "↑ Progressor",
    "Carrier":     "⚡ Carrier",
    "Presser":     "⚔ Presser",
    "Defender":    "🛡 Defender",
    "Contributor": "· Contrib.",
}
_ROLE_COLOR = {
    "Finisher":    "#f85149",
    "Progressor":  "#3fb950",
    "Carrier":     "#e3b341",
    "Presser":     "#58a6ff",
    "Defender":    "#8b949e",
    "Contributor": "#484f58",
}


def plot_vaep(ax_h,ax_a,me,home,away,lineup_info):
    vdf   = compute_vaep(me)
    roles = compute_vaep_roles(vdf)

    xmax=0
    if vdf is not None and "player.name" in vdf.columns and "team.name" in vdf.columns:
        for team in [home,away]:
            td=vdf[vdf["team.name"]==team]; pv=td.groupby("player.name")["vaep"].sum()
            if len(pv)>0: xmax=max(xmax,pv.nlargest(5).max())
    xmax=max(xmax*1.22,0.05)   # extra headroom for outside labels

    # Effective colors (already set as TEAM_A/B globals, recheck here for label logic)
    eff_a,dark_a=get_effective_color(TEAM_A)
    eff_b,dark_b=get_effective_color(TEAM_B)

    for ax,team,eff_col,is_dark,is_right in [
        (ax_h,home,eff_a,dark_a,False),
        (ax_a,away,eff_b,dark_b,True),
    ]:
        ax.set_facecolor(BG_PANEL)
        if vdf is None or "player.name" not in vdf.columns:
            ax.text(0.5,0.5,"No data",transform=ax.transAxes,ha='center',va='center',color=NEUTRAL); continue
        td=vdf[vdf["team.name"]==team] if "team.name" in vdf.columns else vdf
        pv=td.groupby("player.name")["vaep"].agg(["sum","count"]).reset_index()
        pv.columns=["player","total","n"]; pv=pv[pv["n"]>=5].nlargest(5,"total")
        if len(pv)==0:
            ax.text(0.5,0.5,"No data",transform=ax.transAxes,ha='center',va='center',color=NEUTRAL); continue
        tavg=td.groupby("player.name")["vaep"].sum().mean()

        labels=[]
        for p in pv["player"]:
            info=lineup_info.get(p,{}); sm=info.get("sub_minute",None); starter=info.get("starter",True)
            suf=f"({sm}')" if (sm and not starter) else ""
            labels.append(f"{p.split()[-1]}{suf}")

        n=len(pv); alphas=np.linspace(0.95,0.50,n)
        bars=ax.barh(labels,pv["total"],color=eff_col,edgecolor='none',height=0.62)
        for bar,a2 in zip(bars,alphas): bar.set_alpha(a2)

        # v9: label placement logic
        for bar,val,player in zip(bars,pv["total"],pv["player"]):
            bar_w=bar.get_width()
            bar_y=bar.get_y()+bar.get_height()/2
            role =roles.get(player,"Contributor")
            badge=_ROLE_BADGE.get(role,"")
            rc   =_ROLE_COLOR.get(role,NEUTRAL)
            if is_dark:
                # Outside bar — value in effective_col, badge below
                ax.text(bar_w+xmax*0.015, bar_y,   f"{val:.3f}",
                        va='center',ha='left',color=eff_col,fontsize=7,fontweight='bold')
                ax.text(bar_w+xmax*0.015, bar_y-0.22, badge,
                        va='center',ha='left',color=rc,fontsize=5.5)
            else:
                # Inside bar — value centred, badge to the right
                ax.text(bar_w*0.5, bar_y,              f"{val:.3f}",
                        va='center',ha='center',color=WHITE,fontsize=7,fontweight='bold')
                ax.text(bar_w+xmax*0.015, bar_y,       badge,
                        va='center',ha='left',color=rc,fontsize=5.5)

        ax.axvline(tavg,color=WHITE,lw=1.2,ls='--',alpha=0.45,label=f"Avg {tavg:.3f}")
        ax.set_xlim(0,xmax)
        ax.set_xlabel("VAEP  (ΔxG contributed)",fontsize=8,labelpad=5)
        ax.set_title(team,color=eff_col,fontsize=11,fontweight='bold')
        ax.legend(fontsize=7,framealpha=0.2,labelcolor=WHITE,facecolor=BG,loc='lower right',borderpad=0.4)
        ax.grid(axis='x',alpha=0.12,lw=0.5)
        if is_right: ax.tick_params(axis='y',labelsize=8,pad=6); ax.yaxis.set_tick_params(labelleft=True)
        else:        ax.tick_params(labelsize=8)
        ax.tick_params(axis='x',labelsize=8)
        ax.spines['left'].set_color(BORDER); ax.spines['bottom'].set_color(BORDER)


# ─────────────────────────────────────────────────────────────────
# COUNTERATTACK TIMELINE
# ─────────────────────────────────────────────────────────────────
def plot_ca_timeline(ax,me,home,away):
    ax.set_facecolor(BG_PANEL)
    TOVER={"Ball Recovery","Interception","Block"}
    if "type.name" not in me.columns:
        ax.text(0.5,0.5,"No data",transform=ax.transAxes,ha='center',va='center',color=NEUTRAL)
        ax.set_title("Counterattack Timeline",color=WHITE,fontsize=11,fontweight='bold'); return
    df=me.reset_index(drop=True)
    tidxs=df.index[df["type.name"].isin(TOVER)].tolist()
    if not tidxs:
        ax.text(0.5,0.5,"No turnovers detected",transform=ax.transAxes,ha='center',va='center',color=NEUTRAL)
        ax.set_title("Counterattack Timeline",color=WHITE,fontsize=11,fontweight='bold'); return

    all_ev=[]
    for idx in tidxs:
        row=df.iloc[idx]; minute=int(row.get("minute",0)); team=row.get("team.name","")
        col=TEAM_A if team==home else TEAM_B
        seq=df.iloc[idx+1:idx+10]
        shot_r=seq[seq["type.name"]=="Shot"] if "type.name" in seq.columns else pd.DataFrame()
        led=len(shot_r)>0
        xg=float(shot_r["shot.statsbomb_xg"].fillna(0.05).max()) if (led and "shot.statsbomb_xg" in shot_r.columns) else 0
        is_goal=any(shot_r["shot.outcome.name"]=="Goal") if "shot.outcome.name" in shot_r.columns else False
        all_ev.append(dict(minute=minute,col=col,led=led,xg=xg,goal=is_goal))

    shot_ev=[e for e in all_ev if e["led"]]; noshot_ev=[e for e in all_ev if not e["led"]]
    if len(noshot_ev)>15:
        step=max(1,len(noshot_ev)//15); noshot_ev=noshot_ev[::step][:15]
    display=sorted(shot_ev+noshot_ev,key=lambda x:x["minute"])

    ax.set_xlim(-3,95); ax.set_ylim(0,2.0); ax.axis('off')
    ax.plot([0,90],[0.85,0.85],color=BORDER,lw=2.5,solid_capstyle='round',zorder=1)
    for m in [0,15,30,45,60,75,90]:
        ax.plot([m,m],[0.78,0.92],color=NEUTRAL,lw=0.9,alpha=0.5)
        ax.text(m,0.68,f"{m}'",ha='center',va='top',fontsize=7.5,color=NEUTRAL)
    ax.text(45,0.58,"HT",ha='center',va='top',fontsize=7,color=NEUTRAL,alpha=0.5)

    last_label_pos=-99
    for i,ev in enumerate(display):
        m=float(ev["minute"]); c=ev["col"]
        if ev["led"]:
            sz=min(120+ev["xg"]*600,380); mk='*' if ev["goal"] else 'D'
            fc=GOLD if ev["goal"] else c
            ax.scatter(m,0.85,s=sz,c=fc,marker=mk,
                       edgecolors=WHITE if ev["goal"] else 'none',linewidths=0.6,zorder=5)
            if m-last_label_pos>5:
                yoff=1.35 if i%2==0 else 1.60
                lbl=f"{ev['xg']:.2f}" if ev["xg"]>0.01 else "shot"
                ax.text(m,yoff,lbl,ha='center',va='center',fontsize=6.5,
                        color=GOLD if ev["goal"] else c,fontweight='bold')
                ax.plot([m,m],[0.93,yoff-0.06],color=c,lw=0.5,alpha=0.35)
                last_label_pos=m
        else:
            ax.scatter(m,0.85,s=22,facecolors='none',edgecolors=c,linewidths=0.9,zorder=3,alpha=0.50)

    n_shot=len(shot_ev); n_all=len(all_ev)
    ax.set_title(f"Counterattack Timeline  ·  {n_all} turnovers  ·  {n_shot} led to shots",
                 color=WHITE,fontsize=11,fontweight='bold')
    leg=[Line2D([0],[0],marker='*',color='none',markerfacecolor=GOLD,markersize=10,label='→ Goal'),
         Line2D([0],[0],marker='D',color='none',markerfacecolor=TEAM_A,markersize=8,label='→ Shot'),
         Line2D([0],[0],marker='o',color='none',markerfacecolor='none',
                markeredgecolor=NEUTRAL,markersize=7,label='→ No shot (sampled)'),
         Line2D([0],[0],marker='D',color='none',markerfacecolor=TEAM_A,markersize=7,label=home),
         Line2D([0],[0],marker='D',color='none',markerfacecolor=TEAM_B,markersize=7,label=away)]
    ax.legend(handles=leg,loc='upper right',fontsize=7,framealpha=0.2,facecolor=BG,
              labelcolor=WHITE,ncol=3,borderpad=0.5,columnspacing=0.9,handletextpad=0.4)
    ax.text(0.5,-0.18,"Diamond size = xG of resulting shot  ·  Gold star = goal",
            transform=ax.transAxes,ha='center',color=NEUTRAL,fontsize=7,style='italic',clip_on=False)


# ─────────────────────────────────────────────────────────────────
# GAME STATE TABLE
# ─────────────────────────────────────────────────────────────────
def plot_game_state(ax,me,home,away):
    ax.set_facecolor(BG_PANEL); ax.axis('off')
    first_goal=None
    if "type.name" in me.columns and "shot.outcome.name" in me.columns:
        g=me[(me["type.name"]=="Shot")&(me["shot.outcome.name"]=="Goal")]
        if len(g)>0 and "minute" in g.columns: first_goal=int(g["minute"].min())

    if first_goal is None:
        ax.set_title("Game State  —  No Goals Scored",color=NEUTRAL,fontsize=11,fontweight='bold',pad=10)
        ax.text(0.5,0.5,"No goals scored —\ncomparison not applicable",
                ha='center',va='center',color=NEUTRAL,fontsize=9,transform=ax.transAxes); return

    before=me[me["minute"]<first_goal]  if "minute" in me.columns else me
    after =me[me["minute"]>=first_goal] if "minute" in me.columns else me

    def cnt(df,t,ev):
        if "type.name" not in df.columns or "team.name" not in df.columns: return 0
        return int(df[(df["type.name"]==ev)&(df["team.name"]==t)].shape[0])
    def pcomp(df,t):
        if "type.name" not in df.columns: return None
        p=df[df["type.name"]=="Pass"]
        if "team.name" in p.columns: p=p[p["team.name"]==t]
        if len(p)==0: return None
        return p["pass.outcome.name"].isna().mean()*100 if "pass.outcome.name" in p.columns else None

    rows_data=[]
    for label,etype in [("Passes","Pass"),("Shots","Shot"),("Pressures","Pressure")]:
        bh=cnt(before,home,etype); ah=cnt(after,home,etype)
        ba=cnt(before,away,etype); aa=cnt(after,away,etype)
        rows_data.append((label,bh,ah,ba,aa,False))
    pbh=pcomp(before,home); pah=pcomp(after,home)
    pba=pcomp(before,away); paa=pcomp(after,away)
    if all(v is not None for v in [pbh,pah,pba,paa]):
        rows_data.append(("Pass %",pbh,pah,pba,paa,True))

    ax.set_title(f"Before vs After  {first_goal}' Goal",
                 color=WHITE,fontsize=11,fontweight='bold',pad=10)

    CX={"label":0.02,"h_bef":0.24,"h_arr":0.33,"h_aft":0.42,
        "div":0.51,"a_bef":0.59,"a_arr":0.68,"a_aft":0.77}
    N=len(rows_data); DATA_TOP=0.82; DATA_BOT=0.08; ROW_H=(DATA_TOP-DATA_BOT)/max(N,1)

    ax.text((CX["h_bef"]+CX["h_aft"])/2,DATA_TOP+0.07,home,
            ha='center',color=TEAM_A,fontsize=8.5,fontweight='bold',transform=ax.transAxes)
    ax.text((CX["a_bef"]+CX["a_aft"])/2,DATA_TOP+0.07,away,
            ha='center',color=TEAM_B,fontsize=8.5,fontweight='bold',transform=ax.transAxes)
    for cx,lbl in [(CX["h_bef"],"Before"),(CX["h_aft"],"After"),
                   (CX["a_bef"],"Before"),(CX["a_aft"],"After")]:
        ax.text(cx,DATA_TOP+0.01,lbl,ha='center',va='bottom',
                color=NEUTRAL,fontsize=6.5,transform=ax.transAxes)
    ax.plot([0.01,0.94],[DATA_TOP,DATA_TOP],color=BORDER,lw=0.8,transform=ax.transAxes)
    ax.plot([CX["div"],CX["div"]],[DATA_BOT,DATA_TOP],
            color=BORDER,lw=0.5,ls='--',alpha=0.45,transform=ax.transAxes)

    def fmt_val(v,is_pct): return f"{v:.0f}%" if is_pct else str(int(v))
    def delta_fmt(b,a,is_pct):
        try:
            d=float(a)-float(b); s=(f"{d:+.0f}pp" if is_pct else f"{d:+.0f}")
            c=GREEN if d>0 else(RED if d<0 else NEUTRAL); return s,c
        except: return "",NEUTRAL

    for i,(label,bh,ah,ba,aa,is_pct) in enumerate(rows_data):
        cy=DATA_TOP-(i+0.5)*ROW_H
        ax.text(CX["label"],cy,label,ha='left',va='center',
                color=NEUTRAL,fontsize=8.5,fontweight='bold',transform=ax.transAxes)
        ax.text(CX["h_bef"],cy,fmt_val(bh,is_pct),ha='center',va='center',
                color=WHITE,fontsize=9,transform=ax.transAxes)
        ax.text(CX["h_arr"],cy,"→",ha='center',va='center',
                color=DIMMED,fontsize=9,transform=ax.transAxes)
        ax.text(CX["h_aft"],cy,fmt_val(ah,is_pct),ha='center',va='center',
                color=WHITE,fontsize=9,fontweight='bold',transform=ax.transAxes)
        ds_h,dc_h=delta_fmt(bh,ah,is_pct)
        if ds_h: ax.text(CX["h_aft"],cy-ROW_H*0.30,ds_h,ha='center',va='center',
                         color=dc_h,fontsize=7,fontweight='bold',transform=ax.transAxes)
        ax.text(CX["a_bef"],cy,fmt_val(ba,is_pct),ha='center',va='center',
                color=WHITE,fontsize=9,transform=ax.transAxes)
        ax.text(CX["a_arr"],cy,"→",ha='center',va='center',
                color=DIMMED,fontsize=9,transform=ax.transAxes)
        ax.text(CX["a_aft"],cy,fmt_val(aa,is_pct),ha='center',va='center',
                color=WHITE,fontsize=9,fontweight='bold',transform=ax.transAxes)
        ds_a,dc_a=delta_fmt(ba,aa,is_pct)
        if ds_a: ax.text(CX["a_aft"],cy-ROW_H*0.30,ds_a,ha='center',va='center',
                         color=dc_a,fontsize=7,fontweight='bold',transform=ax.transAxes)
        sep_y=DATA_TOP-(i+1)*ROW_H
        ax.plot([0.01,0.94],[sep_y,sep_y],color=BORDER,lw=0.35,alpha=0.30,transform=ax.transAxes)

    ax.text(0.47,DATA_BOT-0.04,"Green = increase after goal  ·  Red = decrease",
            ha='center',va='top',color=NEUTRAL,fontsize=7,style='italic',
            transform=ax.transAxes,clip_on=False)


# ─────────────────────────────────────────────────────────────────
# v9 NEW: JSON SIDECAR EXPORT
# ─────────────────────────────────────────────────────────────────
def export_match_json(me, match_id, home, away, vaep_df, output_dir,
                      comp_name="", season_name="", date_str=""):
    """
    Write a structured JSON file for the FutDash web frontend.

    Output path: {output_dir}/{match_id}.json

    Schema sections: meta, xg_flow, shots, network_home, network_away,
                     vaep, game_state, insights
    """
    os.makedirs(output_dir, exist_ok=True)
    out_path = os.path.join(output_dir, f"{match_id}.json")

    def _sf(v, d=4):
        try:
            f=float(v); return round(f,d) if not np.isnan(f) else None
        except: return None
    def _si(v):
        try:    return int(v)
        except: return None

    # ── meta ──
    sh=sa=nsh=nsa=0; xgh=xga=None; ph=50.0
    if "type.name" in me.columns and "team.name" in me.columns:
        shots=me[me["type.name"]=="Shot"]
        if "shot.outcome.name" in shots.columns:
            sh=int((shots[shots["team.name"]==home]["shot.outcome.name"]=="Goal").sum())
            sa=int((shots[shots["team.name"]==away]["shot.outcome.name"]=="Goal").sum())
        if "shot.statsbomb_xg" in shots.columns:
            xgh=_sf(shots[shots["team.name"]==home]["shot.statsbomb_xg"].sum(),3)
            xga=_sf(shots[shots["team.name"]==away]["shot.statsbomb_xg"].sum(),3)
        nsh=int((shots["team.name"]==home).sum()); nsa=int((shots["team.name"]==away).sum())
    eh=int((me["team.name"]==home).sum()) if "team.name" in me.columns else 0
    ea=int((me["team.name"]==away).sum()) if "team.name" in me.columns else 0
    if (eh+ea)>0: ph=round(eh/(eh+ea)*100,1)

    raw_a=get_team_color(home,_HOME_FALLBACK); raw_b=get_team_color(away,_AWAY_FALLBACK)
    eff_a,_=get_effective_color(raw_a);         eff_b,_=get_effective_color(raw_b)

    meta={"match_id":_si(match_id),"home":home,"away":away,
          "home_color_raw":raw_a,"home_color":eff_a,
          "away_color_raw":raw_b,"away_color":eff_b,
          "score_home":sh,"score_away":sa,
          "xg_home":xgh,"xg_away":xga,
          "shots_home":nsh,"shots_away":nsa,
          "possession_home":ph,
          "competition":comp_name,"season":season_name,"date":date_str}

    # ── xg_flow + pressure index ──
    cum_h=[0.0]*92; cum_a=[0.0]*92
    if "type.name" in me.columns and "minute" in me.columns:
        sdf=me[me["type.name"]=="Shot"].copy()
        sdf["minute"]=sdf["minute"].fillna(0).astype(int)
        sdf["_xg"]=(sdf["shot.statsbomb_xg"].fillna(0.05)
                    if "shot.statsbomb_xg" in sdf.columns else 0.05)
        for _,r in sdf.iterrows():
            m=min(int(r["minute"]),91); x=float(r["_xg"])
            if r.get("team.name","")==home:
                for j in range(m,92): cum_h[j]=round(cum_h[j]+x,4)
            else:
                for j in range(m,92): cum_a[j]=round(cum_a[j]+x,4)
    pi_h=[round(v,4) for v in _compute_pressure_index(me,home,is_home=True).tolist()]
    pi_a=[round(v,4) for v in _compute_pressure_index(me,away,is_home=False).tolist()]
    xg_flow={"minutes":list(range(92)),"home":cum_h,"away":cum_a,
              "pressure_home":pi_h,"pressure_away":pi_a}

    # ── shots ──
    shots_out=[]
    if "type.name" in me.columns:
        sdf=me[me["type.name"]=="Shot"].copy()
        if "loc_x" not in sdf.columns and "location" in sdf.columns:
            sdf["loc_x"]=sdf["location"].apply(
                lambda l:float(l[0]) if isinstance(l,list) and len(l)>=2 else np.nan)
            sdf["loc_y"]=sdf["location"].apply(
                lambda l:float(l[1]) if isinstance(l,list) and len(l)>=2 else np.nan)
        for _,r in sdf.iterrows():
            shots_out.append({
                "x":_sf(r.get("loc_x"),2),"y":_sf(r.get("loc_y"),2),
                "xg":_sf(r.get("shot.statsbomb_xg",0.05),4),
                "goal":bool(r.get("shot.outcome.name","")=="Goal"),
                "team":"home" if r.get("team.name","")==home else "away",
                "player":str(r.get("player.name","")).split()[-1],
                "player_full":str(r.get("player.name","")),
                "minute":_si(r.get("minute",0)),
                "technique":str(r.get("shot.technique.name","")),
                "body_part":str(r.get("shot.body_part.name","")),
            })

    # ── pass network builder ──
    def _build_net(team_events, mirror=False):
        passes=(team_events[team_events["type.name"]=="Pass"].copy()
                if "type.name" in team_events.columns else pd.DataFrame())
        if "pass.outcome.name" in passes.columns:
            passes=passes[passes["pass.outcome.name"].isna()]
        er=defaultdict(int); pa=defaultdict(list)
        for _,r in passes.iterrows():
            src=r.get("player.name"); tgt=r.get("pass.recipient.name"); loc=r.get("location")
            if src and tgt and src!=tgt and isinstance(loc,list) and len(loc)==2:
                er[(src,tgt)]+=1; pa[src].append([float(loc[0]),float(loc[1])])
        n_raw=len(er); min_p=max(3,int(n_raw*0.08))
        ef={k:v for k,v in er.items() if v>=min_p}
        if len(ef)>20: ef=dict(sorted(ef.items(),key=lambda kv:-kv[1])[:20])
        avg_p={p:np.mean(v,axis=0).tolist() for p,v in pa.items()
               if p in {k for pair in ef for k in pair}}
        G=nx.DiGraph()
        for (s,t),w in ef.items():
            if s in avg_p and t in avg_p: G.add_edge(s,t,weight=w)
        try:    ev_c=nx.eigenvector_centrality(G,weight='weight',max_iter=500)
        except: ev_c={n:G.degree(n,weight='weight') for n in G.nodes()}
        btw=nx.betweenness_centrality(G,weight='weight')
        top2=sorted(btw.items(),key=lambda x:-x[1])[:2]
        pm_set={h[0] for h in top2}
        tdeg=sum(dict(G.degree(weight='weight')).values()) or 1
        def mx(x): return round(120.0-float(x),2) if mirror else round(float(x),2)
        nodes=[{"id":n,"short":n.split()[-1][:11],
                "x":mx(avg_p[n][0]),"y":round(float(avg_p[n][1]),2),
                "size":round(55+400*G.degree(n,weight='weight')/tdeg,1),
                "is_playmaker":n in pm_set,
                "betweenness":round(btw.get(n,0),4),
                "eigenvector":round(ev_c.get(n,0),4)}
               for n in G.nodes() if n in avg_p]
        edges_o=[]
        for u,v,d in G.edges(data=True):
            if u not in avg_p or v not in avg_p: continue
            dx=(avg_p[v][0]-avg_p[u][0])*(-1 if mirror else 1)
            edges_o.append({"source":u,"target":v,"weight":d["weight"],
                            "direction":"forward" if dx>4 else("backward" if dx<-4 else "lateral")})
        return {"nodes":nodes,"edges":edges_o}

    te_h=me[me["team.name"]==home] if "team.name" in me.columns else pd.DataFrame()
    te_a=me[me["team.name"]==away] if "team.name" in me.columns else pd.DataFrame()
    network_home=_build_net(te_h,mirror=False)
    network_away=_build_net(te_a,mirror=True)

    # ── vaep ──
    vaep_out={"home":[],"away":[]}
    roles_map=compute_vaep_roles(vaep_df)
    if vaep_df is not None and "player.name" in vaep_df.columns and "team.name" in vaep_df.columns:
        for flag,tname in [("home",home),("away",away)]:
            td=vaep_df[vaep_df["team.name"]==tname]
            pv=td.groupby("player.name")["vaep"].agg(["sum","count"]).reset_index()
            pv.columns=["player","total","n"]; pv=pv[pv["n"]>=5].nlargest(5,"total")
            for _,row in pv.iterrows():
                vaep_out[flag].append({"player":row["player"],"short":row["player"].split()[-1],
                                       "vaep":round(float(row["total"]),4),
                                       "role":roles_map.get(row["player"],"Contributor"),
                                       "n_actions":int(row["n"])})

    # ── game_state ──
    game_state_out={}
    first_goal=None
    if "type.name" in me.columns and "shot.outcome.name" in me.columns:
        g=me[(me["type.name"]=="Shot")&(me["shot.outcome.name"]=="Goal")]
        if len(g)>0 and "minute" in g.columns: first_goal=int(g["minute"].min())
    if first_goal is not None:
        before=me[me["minute"]<first_goal]  if "minute" in me.columns else me
        after =me[me["minute"]>=first_goal] if "minute" in me.columns else me
        def _c(df,t,ev):
            if "type.name" not in df.columns or "team.name" not in df.columns: return 0
            return int(df[(df["type.name"]==ev)&(df["team.name"]==t)].shape[0])
        game_state_out={"goal_minute":first_goal,
                        "home_before":{"passes":_c(before,home,"Pass"),
                                       "shots":_c(before,home,"Shot"),
                                       "pressures":_c(before,home,"Pressure")},
                        "home_after": {"passes":_c(after,home,"Pass"),
                                       "shots":_c(after,home,"Shot"),
                                       "pressures":_c(after,home,"Pressure")},
                        "away_before":{"passes":_c(before,away,"Pass"),
                                       "shots":_c(before,away,"Shot"),
                                       "pressures":_c(before,away,"Pressure")},
                        "away_after": {"passes":_c(after,away,"Pass"),
                                       "shots":_c(after,away,"Shot"),
                                       "pressures":_c(after,away,"Pressure")}}

    # ── insights ──
    insights=[]
    if xgh is not None and xga is not None:
        diff=abs(xgh-xga); dom=home if xgh>xga else away
        if diff>0.5: insights.append(f"{dom} created {diff:.2f} more xG — dominant territorial control")
        else: insights.append(f"Closely contested: {home} {xgh:.2f} xG vs {away} {xga:.2f} xG")
    if ph>58: insights.append(f"{home} controlled possession ({ph:.0f}%) — structured build-up play")
    elif ph<42: insights.append(f"{away} dominated possession ({100-ph:.0f}%) — {home} sat deep and defended")
    else: insights.append("Even possession — contested midfield throughout")

    payload={"meta":meta,"xg_flow":xg_flow,"shots":shots_out,
             "network_home":network_home,"network_away":network_away,
             "vaep":vaep_out,"game_state":game_state_out,"insights":insights}

    with open(out_path,"w",encoding="utf-8") as f:
        json.dump(payload,f,ensure_ascii=False,indent=2)
    print(f"  📄  JSON → {out_path}  ({os.path.getsize(out_path)//1024} KB)")
    return out_path


# ─────────────────────────────────────────────────────────────────
# ASSEMBLY
# ─────────────────────────────────────────────────────────────────
def build_dashboard(all_events, comps_df, match_id=None, base_path=None,
                    output_path=None, export_json=False, json_dir="./data/matches"):
    combined=get_combined(all_events); me=pick_match(combined,match_id)
    teams=me["team.name"].dropna().unique().tolist() if "team.name" in me.columns else []
    home=teams[0] if len(teams)>=1 else "Home"
    away=teams[1] if len(teams)>=2 else "Away"

    used_mid=match_id
    if used_mid is None and "match_id" in me.columns:
        used_mid=int(me["match_id"].iloc[0])
    lineup_info={}
    if base_path and used_mid: lineup_info=load_lineups(base_path,used_mid)

    key_events=[]
    if "type.name" in me.columns and "shot.outcome.name" in me.columns:
        g=me[(me["type.name"]=="Shot")&(me["shot.outcome.name"]=="Goal")]
        if "minute" in g.columns and "team.name" in g.columns:
            for _,r in g.iterrows():
                key_events.append((int(r.get("minute",0)),
                                   f"⚽{r.get('team.name','').split()[-1]}",
                                   r.get("team.name","")))

    comp_n=season_n=""
    if comps_df is not None and len(comps_df)>0:
        c=comps_df.iloc[0]; comp_n=c.get("competition_name",""); season_n=c.get("season_name","")

    # ── v9: resolve effective colors before any drawing ───────────
    global TEAM_A, TEAM_B
    raw_a=get_team_color(home, fallback=_HOME_FALLBACK)
    raw_b=get_team_color(away, fallback=_AWAY_FALLBACK)
    if raw_a.lower()==raw_b.lower(): raw_b=_AWAY_FALLBACK
    eff_a,_=get_effective_color(raw_a)
    eff_b,_=get_effective_color(raw_b)
    TEAM_A=eff_a; TEAM_B=eff_b

    # Network global max — mirrors draw_network's dynamic threshold
    def edge_max(t_ev):
        p=t_ev[t_ev["type.name"]=="Pass"] if "type.name" in t_ev.columns else pd.DataFrame()
        if "pass.outcome.name" in p.columns: p=p[p["pass.outcome.name"].isna()]
        ec=defaultdict(int)
        for _,r in p.iterrows():
            s=r.get("player.name"); t=r.get("pass.recipient.name"); loc=r.get("location")
            if s and t and s!=t and isinstance(loc,list): ec[(s,t)]+=1
        n_raw=len(ec); min_p=max(3,int(n_raw*0.08))
        filtered={k:v for k,v in ec.items() if v>=min_p}
        return max(filtered.values()) if filtered else 1
    te_h=me[me["team.name"]==home] if "team.name" in me.columns else pd.DataFrame()
    te_a=me[me["team.name"]==away] if "team.name" in me.columns else pd.DataFrame()
    gmax=max(edge_max(te_h),edge_max(te_a),1)

    # ── Figure ────────────────────────────────────────────────────
    FW,FH=26,33
    fig=plt.figure(figsize=(FW,FH),facecolor=BG)
    LM=0.040; RM=0.962; MID=0.501; GAP=0.014
    LW=MID-LM-GAP/2; RW=RM-MID-GAP/2
    def ax_(l,b,w,h): return fig.add_axes([l,b,w,h])

    gh,ga,xgh,xga,ph,nsh,nsa=draw_score_banner(
        fig,me,home,away,comp_n,season_n,top=0.984,h=0.100)
    draw_insight_strip(fig,me,home,away,gh,ga,xgh,xga,ph,nsh,nsa,y=0.898)

    S1_DIV=0.876
    section_label(fig,S1_DIV,1,"Tactical Structure","How did both teams build play?")
    NET_T=0.856; NET_B=0.620; NET_H=NET_T-NET_B
    XGF_T=NET_B-0.016; XGF_B=0.488; XGF_H=XGF_T-XGF_B
    ax_nh=ax_(LM,NET_B,LW,NET_H); ax_na=ax_(MID+GAP/2,NET_B,RW,NET_H)
    ax_xg=ax_(LM,XGF_B,RM-LM,XGF_H)
    print("  [1a] Home network..."); draw_network(ax_nh,me,home,TEAM_A,lineup_info,gmax,mirror=False)
    print("  [1b] Away network..."); draw_network(ax_na,me,away,TEAM_B,lineup_info,gmax,mirror=True)
    print("  [1c] xG flow...");     plot_xg_flow(ax_xg,me,home,away,key_events or None)

    S2_DIV=0.476
    section_label(fig,S2_DIV,2,"Chance Creation","Where did danger come from?")
    CC_T=0.458; CC_B=0.268; CC_H=CC_T-CC_B
    ax_pa=ax_(LM,CC_B,LW,CC_H); ax_sm=ax_(MID+GAP/2,CC_B,RW,CC_H)
    print("  [2a] Possession arrows..."); plot_possession_arrows(ax_pa,me,home,away)
    print("  [2b] Shot map...");          plot_shot_map(ax_sm,me,home,away)

    S3_DIV=0.256
    section_label(fig,S3_DIV,3,"Individual Impact","Who made the difference?")
    VI_T=0.238; VI_B=0.098; VI_H=VI_T-VI_B
    ax_vh=ax_(LM,VI_B,LW-0.01,VI_H); ax_va=ax_(MID+GAP/2+0.025,VI_B,RW-0.025,VI_H)
    print("  [3] VAEP..."); plot_vaep(ax_vh,ax_va,me,home,away,lineup_info)
    fig.text((LM+RM)/2,VI_T+0.005,
             "Top 5 players by VAEP  (match-only  ·  same scale  ·  dashed line = team average  ·  role tags shown)",
             ha='center',color=NEUTRAL,fontsize=7.5,style='italic',transform=fig.transFigure)

    S4_DIV=0.088
    section_label(fig,S4_DIV,4,"Game State Effects","Did the match change after goals?")
    GS_T=0.072; GS_B=0.010; GS_H=GS_T-GS_B
    ax_ca=ax_(LM,GS_B,LW+0.072,GS_H); ax_gs=ax_(MID+0.086,GS_B,RW-0.086,GS_H)
    print("  [4a] CA timeline..."); plot_ca_timeline(ax_ca,me,home,away)
    print("  [4b] Game state...");  plot_game_state(ax_gs,me,home,away)

    fig.text(0.5,0.003,
             f"All panels use match-only data  ·  GBM VAEP  ·  StatsBomb Open Data  ·  Events: {len(me):,}",
             ha='center',color=DIMMED,fontsize=7,transform=fig.transFigure)

    out=output_path or "statsbomb_report_v9.png"
    plt.savefig(out,dpi=160,bbox_inches='tight',facecolor=BG)
    print(f"\n  ✅  Saved → {out}\n")

    if export_json and used_mid:
        vdf=compute_vaep(me)
        export_match_json(me,used_mid,home,away,vdf,
                          output_dir=json_dir,
                          comp_name=comp_n,season_name=season_n)
    return fig


# ─────────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────────
def main():
    p=argparse.ArgumentParser(
        description="StatsBomb Match Intelligence Report v9 — FutDash Phase 1")
    p.add_argument("--base-path",      default=DEFAULT_BASE)
    p.add_argument("--competition-id", type=int,default=None)
    p.add_argument("--season-id",      type=int,default=None)
    p.add_argument("--match-id",       type=int,default=None)
    p.add_argument("--sample-only",    action="store_true",
                   help="Load only 3 matches for a quick demo")
    p.add_argument("--output",         default="statsbomb_report_v9.png")
    p.add_argument("--export-json",    action="store_true",
                   help="Also write a JSON sidecar for the web frontend")
    p.add_argument("--json-dir",       default="./data/matches",
                   help="Output directory for JSON sidecar files")
    args=p.parse_args()

    print(f"\n{'='*60}")
    print(f"  StatsBomb Match Intelligence Report v9  (FutDash Phase 1)")
    print(f"  {args.base_path}")
    print(f"{'='*60}\n")

    cdf,aev,_=load_data(args.base_path,args.competition_id,args.season_id,
                        3 if args.sample_only else None)
    if not aev: print("[ERROR] No events loaded."); sys.exit(1)
    build_dashboard(aev,cdf,match_id=args.match_id,base_path=args.base_path,
                    output_path=args.output,
                    export_json=args.export_json,json_dir=args.json_dir)

if __name__=="__main__":
    main()
