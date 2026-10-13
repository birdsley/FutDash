// ── Match data types ──────────────────────────────────────────────

export interface MatchMeta {
  match_id: number;
  home: string;
  away: string;
  home_color_raw: string;
  home_color: string;
  away_color_raw: string;
  away_color: string;
  score_home: number;
  score_away: number;
  // Penalty shootout (if applicable)
  penalty_home?: number | null;
  penalty_away?: number | null;
  has_extra_time?: boolean;
  has_penalties?: boolean;
  max_minute?: number;  // for games with extra time
  xg_home: number | null;
  xg_away: number | null;
  shots_home: number;
  shots_away: number;
  possession_home: number;
  competition: string;
  season: string;
  date: string;
}

export interface XgFlow {
  minutes: number[];
  home: number[];
  away: number[];
  pressure_home: number[];
  pressure_away: number[];
}

export interface Shot {
  x: number | null;
  y: number | null;
  xg: number | null;
  goal: boolean;
  team: 'home' | 'away';
  player: string;
  player_full: string;
  minute: number | null;
  technique: string;
  shot_type?: string;  // 'Penalty', 'Open Play', 'Free Kick', ... (absent in older exports)
  body_part: string;
  period?: number;  // 1-2=regular, 3-4=ET, 5=shootout
  is_penalty_shootout?: boolean;
}

export interface OwnGoal {
  team: 'home' | 'away';  // side credited with the goal
  player: string;         // player who put it into their own net
  player_full: string;
  minute: number | null;
  period?: number;
}

export interface NetworkNode {
  id: string;            // StatsBomb legal name; edges reference it
  short: string;
  name?: string;         // common name for display (absent in older exports)
  x: number;
  y: number;
  size: number;
  is_playmaker: boolean;
  betweenness: number;
  eigenvector: number;
}

export interface NetworkEdge {
  source: string;
  target: string;
  weight: number;
  direction: 'forward' | 'lateral' | 'backward';
}

export interface Network {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}

export interface VaepPlayer {
  player: string;
  short: string;
  vaep: number;
  role: string;
  n_actions: number;
}

export interface GameStateStats {
  passes: number;
  shots: number;
  pressures: number;
  pass_pct?: number;
}

export interface GameState {
  goal_minute: number | null;
  home_before: GameStateStats;
  home_after: GameStateStats;
  away_before: GameStateStats;
  away_after: GameStateStats;
}

export interface MatchData {
  meta: MatchMeta;
  xg_flow: XgFlow;
  shots: Shot[];
  own_goals?: OwnGoal[];
  network_home: Network;
  network_away: Network;
  vaep: {
    home: VaepPlayer[];
    away: VaepPlayer[];
  };
  game_state: GameState;
  insights: string[];
  phases?: Phases;
}

// ── 360 possession phases (only on matches with StatsBomb 360 data) ──
// Defending team's shape while the other side has the ball, in the
// possessing team's attacking-right frame (defenders' goal at x = 120).
export interface PhaseShape {
  n_frames: number;
  n_frames_shape: number;
  defense_heat: number[];   // rows x cols, row-major, max = 1
  line_height: number;      // yards from own goal
  width: number;
  depth: number;
}

export interface Phases {
  available: boolean;
  source: string;
  grid: { cols: number; rows: number };
  home_possession: PhaseShape;
  away_possession: PhaseShape;
}

// ── Index / catalog types ─────────────────────────────────────────

export interface MatchSummary {
  match_id: number;
  home: string;
  away: string;
  score_home: number;
  score_away: number;
  date: string;
  home_color: string;
  away_color: string;
}

export interface Season {
  id: number;
  name: string;
  matches: MatchSummary[];
}

export interface Competition {
  id: number;
  name: string;
  flag?: string;
  seasons: Season[];
}

export interface MatchIndex {
  competitions: Competition[];
}

// ── Prediction types ──────────────────────────────────────────────

/**
 * The three outcome probabilities for a match prediction.
 * Exported here so all components reference the same canonical type.
 */
export interface ProbabilitySet {
  home_win: number;
  draw: number;
  away_win: number;
}

export interface PredictionMatch {
  match_id: string;
  date: string;
  home: string;
  away: string;
  home_color: string;
  away_color: string;
  league_name?: string;
  league_code?: string;
  predicted: ProbabilitySet;
  actual: {
    home_goals: number;
    away_goals: number;
    outcome: 'H' | 'D' | 'A';
  } | null;
  is_upset: boolean;
  has_statsbomb: boolean;
  statsbomb_match_id: number | null;
  confidence?: string;
  matchday?: number | null;
  venue?: string | null;
  status?: string;
}
