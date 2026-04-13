use cosmwasm_std::{Addr, Uint128};
use cosmwasm_schema::cw_serde;
use cw_storage_plus::Map;

#[cw_serde]
pub struct UserProfile {
    pub username: String,
    pub elo: u32,
    pub games_played: u32,
    pub wins: u32,
    pub draws: u32,
    pub losses: u32,
    pub current_games: Vec<String>,  // Active game IDs
    pub created_at: u64,             // Block height when created
    #[serde(default)]
    pub verified: bool,
    #[serde(default)]
    pub verified_platform: Option<String>,
    #[serde(default)]
    pub verified_at: Option<u64>,
}

impl Default for UserProfile {
    fn default() -> Self {
        UserProfile {
            username: String::new(),
            elo: 1200,
            games_played: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            current_games: Vec::new(),
            created_at: 0,
            verified: false,
            verified_platform: None,
            verified_at: None,
        }
    }
}

#[cw_serde]
pub struct ChessGame {
    pub id: String,
    pub white: Addr,
    pub black: Option<Addr>,         // None for open lobby games
    pub moves: String,
    pub current_fen: String,
    pub status: String,
    pub current_turn: String,
    pub last_move_block: u64,
    pub white_time_remaining: u64,   // Blocks remaining for white
    pub black_time_remaining: u64,   // Blocks remaining for black
    pub created_block: u64,
    pub claim_block: Option<u64>,
    pub time_control: String,
    pub move_count: u32,
    pub draw_proposed_by: Option<String>,
    #[serde(default)]
    pub wager_amount: Option<Uint128>,
    #[serde(default = "default_denom")]
    pub wager_denom: String,
    #[serde(default)]
    pub wager_funded_white: bool,
    #[serde(default)]
    pub wager_funded_black: bool,
    #[serde(default)]
    pub spectator_wagers_enabled: bool,
    #[serde(default)]
    pub invite_code: Option<String>,
}

fn default_denom() -> String {
    "uxion".to_string()
}

#[cw_serde]
pub struct SpectatorWager {
    pub game_id: String,
    pub bettor: Addr,
    pub prediction: String,   // "white", "black", "draw"
    pub amount: Uint128,
    pub denom: String,
    pub claimed: bool,
}

// Game storage: game_id -> ChessGame
pub const GAMES: Map<String, ChessGame> = Map::new("games");

// Index of all game IDs for listing
pub const GAME_IDS: Map<String, bool> = Map::new("game_ids");

// User profiles: address -> UserProfile
pub const USER_PROFILES: Map<Addr, UserProfile> = Map::new("user_profiles");

// Index of all user addresses
pub const USER_ADDRESSES: Map<Addr, bool> = Map::new("user_addresses");

// Spectator wagers: (game_id, bettor) -> SpectatorWager
pub const SPECTATOR_WAGERS: Map<(String, Addr), SpectatorWager> = Map::new("spectator_wagers");
