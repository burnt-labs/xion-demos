export interface ChessUser {
  address: string;
  username: string;
  elo: number;
  games_played: number;
  wins: number;
  draws: number;
  losses: number;
  current_games: string[];
  created_at: string;
  verified: boolean;
  verified_platform: string | null;
  verified_at: number | null;
}

export interface ChessGame {
  id: string;
  white: string;
  black: string | null;
  moves: string;
  current_fen: string;
  status: 'waiting' | 'active' | 'checkmate_claimed' | 'disputed' | 'white_won' | 'black_won' | 'draw' | 'stalemate' | 'timeout' | 'cancelled';
  current_turn: 'white' | 'black';
  last_move_block: number;
  white_time_remaining: number;
  black_time_remaining: number;
  created_block: number;
  claim_block: number | null;
  time_control: string;
  move_count: number;
  draw_proposed_by: string | null;
  wager_amount: string | null;
  wager_denom: string;
  wager_funded_white: boolean;
  wager_funded_black: boolean;
  spectator_wagers_enabled: boolean;
  invite_code: string | null;
}

export interface TimeStatus {
  white_time_remaining: number;
  black_time_remaining: number;
  current_player: string;
  time_expired: boolean;
  move_count: number;
  time_since_last_move: number;
}

export interface ChessMove {
  from: string;
  to: string;
  promotion?: string;
  resulting_fen?: string;  // FEN after this move is applied
}