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
  body_part: string;
  period?: number;  // 1-2=regular, 3-4=ET, 5=shootout
  is_penalty_shootout?: boolean;
}

export interface NetworkNode {
  id: string;
  short: string;
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
  network_home: Network;
  network_away: Network;
  vaep: {
    home: VaepPlayer[];
    away: VaepPlayer[];
  };
  game_state: GameState;
  insights: string[];
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
