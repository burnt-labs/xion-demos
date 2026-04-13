#[cfg(not(feature = "library"))]
use cosmwasm_std::entry_point;
use cosmwasm_std::{
    to_json_binary, BankMsg, Binary, Coin, Deps, DepsMut, Env, MessageInfo, Response, StdResult,
    Uint128,
};
use cw2::set_contract_version;
use shakmaty::{Chess, Position, Move, Role};
use shakmaty::fen::Fen;

use crate::error::ContractError;
use crate::msg::{
    ExecuteMsg, InstantiateMsg, QueryMsg, GameStatus, VerificationResponse, MoveValidationResponse,
    GameResponse, GamesResponse, GameIdsResponse, TimeStatusResponse, UserProfileResponse,
    UsersResponse, OpenGamesResponse, SpectatorWagersResponse,
};
use crate::state::{
    ChessGame, UserProfile, SpectatorWager, GAMES, GAME_IDS, USER_PROFILES, USER_ADDRESSES,
    SPECTATOR_WAGERS,
};

// version info for migration info
const CONTRACT_NAME: &str = "crates.io:xion_chess";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    _msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    Ok(Response::new()
        .add_attribute("method", "instantiate")
        .add_attribute("owner", info.sender))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::InitializeUser { username } => {
            execute::initialize_user(deps, env, info, username)
        }
        ExecuteMsg::VerifyPosition { fen, claimed_status } => {
            execute::verify_position(fen, claimed_status)
        }
        ExecuteMsg::CreateGame {
            game_id,
            opponent,
            time_control,
            wager_amount,
            allow_spectator_wagers,
            invite_code,
        } => execute::create_game(
            deps,
            env,
            info,
            game_id,
            opponent,
            time_control,
            wager_amount,
            allow_spectator_wagers,
            invite_code,
        ),
        ExecuteMsg::JoinGame { game_id, invite_code } => {
            execute::join_game(deps, env, info, game_id, invite_code)
        }
        ExecuteMsg::MakeMove { game_id, from, to, promotion } => {
            execute::make_move(deps, env, info, game_id, from, to, promotion)
        }
        ExecuteMsg::UpdateGameStatus { game_id, status } => {
            execute::update_game_status(deps, info, game_id, status)
        }
        ExecuteMsg::ResignGame { game_id } => {
            execute::resign_game(deps, info, game_id)
        }
        ExecuteMsg::ProposeDrawRequest { game_id } => {
            execute::propose_draw(deps, info, game_id)
        }
        ExecuteMsg::RespondToDrawRequest { game_id, accept } => {
            execute::respond_to_draw(deps, info, game_id, accept)
        }
        ExecuteMsg::PlaceSpectatorWager { game_id, prediction } => {
            execute::place_spectator_wager(deps, info, game_id, prediction)
        }
        ExecuteMsg::ClaimWinnings { game_id } => {
            execute::claim_winnings(deps, info, game_id)
        }
        ExecuteMsg::CancelGame { game_id } => {
            execute::cancel_game(deps, info, game_id)
        }
        ExecuteMsg::AdminSetElo { address, elo } => {
            execute::admin_set_elo(deps, address, elo)
        }
        ExecuteMsg::AdminSetStats {
            address,
            wins,
            draws,
            losses,
            games_played,
        } => execute::admin_set_stats(deps, address, wins, draws, losses, games_played),
    }
}

pub mod execute {
    use super::*;

    /// Calculate new ELO ratings after a game using integer arithmetic
    /// Uses scaled integers (x1000) to avoid floating point operations
    /// k_factor is 32, scores: win=1000, draw=500, loss=0
    fn calculate_elo(winner_elo: u32, loser_elo: u32, is_draw: bool) -> (u32, u32) {
        let k_factor = 32u32;
        let scale = 1000u32;

        let rating_diff = if winner_elo >= loser_elo {
            (winner_elo - loser_elo).min(800)
        } else {
            (loser_elo - winner_elo).min(800)
        };

        let expected_winner_scaled = match rating_diff {
            0..=25 => 500,
            26..=50 => 537,
            51..=100 => 640,
            101..=150 => 691,
            151..=200 => 760,
            201..=300 => 849,
            301..=400 => 909,
            _ => 950,
        };

        let (winner_expected, _loser_expected) = if winner_elo >= loser_elo {
            (expected_winner_scaled, scale - expected_winner_scaled)
        } else {
            (scale - expected_winner_scaled, expected_winner_scaled)
        };

        let (winner_actual, loser_actual) = if is_draw {
            (scale / 2, scale / 2)
        } else {
            (scale, 0)
        };

        let winner_change =
            (k_factor as i32 * (winner_actual as i32 - winner_expected as i32)) / scale as i32;
        let loser_change =
            (k_factor as i32 * (loser_actual as i32 - winner_expected as i32 * -1)) / scale as i32;
        let _ = loser_change; // suppress unused warning — calculated symmetrically below

        let new_winner_elo = if winner_change >= 0 {
            winner_elo + winner_change as u32
        } else {
            winner_elo.saturating_sub((-winner_change) as u32)
        };

        // Loser's change is the mirror of winner's
        let new_loser_elo = if winner_change <= 0 {
            loser_elo + (-winner_change) as u32
        } else {
            loser_elo.saturating_sub(winner_change as u32)
        };

        (new_winner_elo.max(100), new_loser_elo.max(100))
    }

    /// Update player profiles after game ends
    fn update_profiles_after_game(
        deps: &mut DepsMut,
        game: &ChessGame,
        white_won: bool,
        black_won: bool,
        is_draw: bool,
    ) -> Result<(), ContractError> {
        let white_addr = game.white.clone();
        let black_addr = match &game.black {
            Some(addr) => addr.clone(),
            None => return Ok(()),
        };

        let mut white_profile = USER_PROFILES.load(deps.storage, white_addr.clone())?;
        let mut black_profile = USER_PROFILES.load(deps.storage, black_addr.clone())?;

        let (new_white_elo, new_black_elo) = if is_draw {
            calculate_elo(white_profile.elo, black_profile.elo, true)
        } else if white_won {
            calculate_elo(white_profile.elo, black_profile.elo, false)
        } else {
            let (black_new, white_new) =
                calculate_elo(black_profile.elo, white_profile.elo, false);
            (white_new, black_new)
        };

        white_profile.elo = new_white_elo;
        white_profile.games_played += 1;
        if white_won {
            white_profile.wins += 1;
        } else if black_won {
            white_profile.losses += 1;
        } else {
            white_profile.draws += 1;
        }
        white_profile.current_games.retain(|id| id != &game.id);

        black_profile.elo = new_black_elo;
        black_profile.games_played += 1;
        if black_won {
            black_profile.wins += 1;
        } else if white_won {
            black_profile.losses += 1;
        } else {
            black_profile.draws += 1;
        }
        black_profile.current_games.retain(|id| id != &game.id);

        USER_PROFILES.save(deps.storage, white_addr, &white_profile)?;
        USER_PROFILES.save(deps.storage, black_addr, &black_profile)?;

        Ok(())
    }

    pub fn initialize_user(
        deps: DepsMut,
        env: Env,
        info: MessageInfo,
        username: String,
    ) -> Result<Response, ContractError> {
        let sender = info.sender.clone();

        let mut profile = USER_PROFILES
            .may_load(deps.storage, sender.clone())?
            .unwrap_or_else(|| UserProfile {
                username: username.clone(),
                elo: 1200,
                games_played: 0,
                wins: 0,
                draws: 0,
                losses: 0,
                current_games: Vec::new(),
                created_at: env.block.height,
                verified: false,
                verified_platform: None,
                verified_at: None,
            });

        if !username.is_empty() {
            profile.username = username;
        }

        USER_PROFILES.save(deps.storage, sender.clone(), &profile)?;
        USER_ADDRESSES.save(deps.storage, sender.clone(), &true)?;

        Ok(Response::new()
            .add_attribute("action", "initialize_user")
            .add_attribute("user", sender)
            .add_attribute("username", profile.username))
    }

    pub fn verify_position(
        fen: String,
        claimed_status: GameStatus,
    ) -> Result<Response, ContractError> {
        let verification = query::verify_position_internal(fen.clone())?;

        let status_matches = match (&claimed_status, &verification.status) {
            (GameStatus::Checkmate, GameStatus::Checkmate) => true,
            (GameStatus::Stalemate, GameStatus::Stalemate) => true,
            (GameStatus::Draw, GameStatus::Draw) => true,
            (GameStatus::Active, GameStatus::Active) => true,
            _ => false,
        };

        if !status_matches {
            return Err(ContractError::InvalidClaim {
                claimed: format!("{:?}", claimed_status),
                actual: format!("{:?}", verification.status),
            });
        }

        Ok(Response::new()
            .add_attribute("action", "verify_position")
            .add_attribute("fen", fen)
            .add_attribute("status", format!("{:?}", verification.status))
            .add_attribute("is_check", verification.is_check.to_string()))
    }

    pub fn create_game(
        deps: DepsMut,
        env: Env,
        info: MessageInfo,
        game_id: String,
        opponent: Option<cosmwasm_std::Addr>,
        time_control: String,
        wager_amount: Option<Uint128>,
        allow_spectator_wagers: Option<bool>,
        invite_code: Option<String>,
    ) -> Result<Response, ContractError> {
        if GAMES.has(deps.storage, game_id.clone()) {
            return Err(ContractError::GameAlreadyExists { id: game_id });
        }

        let white_addr = info.sender.clone();
        let initial_time = 172_800u64;

        let (wager_funded_white, wager_funded_black) = if let Some(amount) = wager_amount {
            if amount > Uint128::zero() {
                let sent = info
                    .funds
                    .iter()
                    .find(|c| c.denom == "uxion")
                    .map(|c| c.amount)
                    .unwrap_or(Uint128::zero());
                if sent < amount {
                    return Err(ContractError::InsufficientFunds {
                        required: amount.to_string(),
                        sent: sent.to_string(),
                    });
                }
                (true, false)
            } else {
                (false, false)
            }
        } else {
            (false, false)
        };

        let (status, black_addr) = match &opponent {
            Some(opp) => ("active".to_string(), Some(opp.clone())),
            None => ("waiting".to_string(), None),
        };

        let mut white_profile = USER_PROFILES
            .may_load(deps.storage, white_addr.clone())?
            .unwrap_or_else(|| UserProfile {
                username: white_addr.to_string(),
                elo: 1200,
                games_played: 0,
                wins: 0,
                draws: 0,
                losses: 0,
                current_games: Vec::new(),
                created_at: env.block.height,
                verified: false,
                verified_platform: None,
                verified_at: None,
            });

        white_profile.current_games.push(game_id.clone());
        USER_PROFILES.save(deps.storage, white_addr.clone(), &white_profile)?;
        USER_ADDRESSES.save(deps.storage, white_addr.clone(), &true)?;

        if let Some(ref black) = black_addr {
            let mut black_profile = USER_PROFILES
                .may_load(deps.storage, black.clone())?
                .unwrap_or_else(|| UserProfile {
                    username: black.to_string(),
                    elo: 1200,
                    games_played: 0,
                    wins: 0,
                    draws: 0,
                    losses: 0,
                    current_games: Vec::new(),
                    created_at: env.block.height,
                    verified: false,
                    verified_platform: None,
                    verified_at: None,
                });
            black_profile.current_games.push(game_id.clone());
            USER_PROFILES.save(deps.storage, black.clone(), &black_profile)?;
            USER_ADDRESSES.save(deps.storage, black.clone(), &true)?;
        }

        let game = ChessGame {
            id: game_id.clone(),
            white: white_addr.clone(),
            black: black_addr.clone(),
            moves: String::new(),
            current_fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1".to_string(),
            status,
            current_turn: "white".to_string(),
            last_move_block: env.block.height,
            white_time_remaining: initial_time,
            black_time_remaining: initial_time,
            created_block: env.block.height,
            claim_block: None,
            time_control,
            move_count: 0,
            draw_proposed_by: None,
            wager_amount,
            wager_denom: "uxion".to_string(),
            wager_funded_white,
            wager_funded_black,
            spectator_wagers_enabled: allow_spectator_wagers.unwrap_or(false),
            invite_code,
        };

        GAMES.save(deps.storage, game_id.clone(), &game)?;
        GAME_IDS.save(deps.storage, game_id.clone(), &true)?;

        Ok(Response::new()
            .add_attribute("action", "create_game")
            .add_attribute("game_id", game_id)
            .add_attribute("white", white_addr)
            .add_attribute(
                "black",
                black_addr
                    .map(|a| a.to_string())
                    .unwrap_or_else(|| "open".to_string()),
            ))
    }

    pub fn join_game(
        deps: DepsMut,
        env: Env,
        info: MessageInfo,
        game_id: String,
        invite_code: Option<String>,
    ) -> Result<Response, ContractError> {
        let mut game = GAMES.load(deps.storage, game_id.clone())?;

        if game.status != "waiting" {
            return Err(ContractError::GameNotWaiting {});
        }

        if game.white == info.sender {
            return Err(ContractError::CannotJoinOwnGame {});
        }

        if let Some(ref code) = game.invite_code {
            match invite_code {
                Some(ref provided) if provided == code => {}
                _ => return Err(ContractError::InvalidInviteCode {}),
            }
        }

        if let Some(wager) = game.wager_amount {
            if wager > Uint128::zero() {
                let sent = info
                    .funds
                    .iter()
                    .find(|c| c.denom == game.wager_denom)
                    .map(|c| c.amount)
                    .unwrap_or(Uint128::zero());
                if sent < wager {
                    return Err(ContractError::InsufficientFunds {
                        required: wager.to_string(),
                        sent: sent.to_string(),
                    });
                }
                game.wager_funded_black = true;
            }
        }

        let joiner = info.sender.clone();

        let mut joiner_profile = USER_PROFILES
            .may_load(deps.storage, joiner.clone())?
            .unwrap_or_else(|| UserProfile {
                username: joiner.to_string(),
                elo: 1200,
                games_played: 0,
                wins: 0,
                draws: 0,
                losses: 0,
                current_games: Vec::new(),
                created_at: env.block.height,
                verified: false,
                verified_platform: None,
                verified_at: None,
            });
        joiner_profile.current_games.push(game_id.clone());
        USER_PROFILES.save(deps.storage, joiner.clone(), &joiner_profile)?;
        USER_ADDRESSES.save(deps.storage, joiner.clone(), &true)?;

        game.black = Some(joiner.clone());
        game.status = "active".to_string();

        GAMES.save(deps.storage, game_id.clone(), &game)?;

        Ok(Response::new()
            .add_attribute("action", "join_game")
            .add_attribute("game_id", game_id)
            .add_attribute("black", joiner))
    }

    pub fn make_move(
        mut deps: DepsMut,
        env: Env,
        info: MessageInfo,
        game_id: String,
        from: String,
        to: String,
        promotion: Option<String>,
    ) -> Result<Response, ContractError> {
        let mut game = GAMES.load(deps.storage, game_id.clone())?;

        let is_white = game.white == info.sender;
        let is_black = game
            .black
            .as_ref()
            .map(|b| b == &info.sender)
            .unwrap_or(false);

        if !is_white && !is_black {
            return Err(ContractError::NotPlayerInGame {});
        }

        if (is_white && game.current_turn != "white")
            || (is_black && game.current_turn != "black")
        {
            return Err(ContractError::NotYourTurn {});
        }

        if game.move_count >= 2 {
            let time_used = env.block.height.saturating_sub(game.last_move_block);
            let current_time_remaining = if is_white {
                game.white_time_remaining
            } else {
                game.black_time_remaining
            };

            if time_used >= current_time_remaining {
                let white_won = !is_white;
                let black_won = !is_black;
                game.status = if is_white { "black_won" } else { "white_won" }.to_string();
                update_profiles_after_game(&mut deps, &game, white_won, black_won, false)?;
                GAMES.save(deps.storage, game_id.clone(), &game)?;
                return Err(ContractError::IllegalMove {
                    error: "Time expired - you have lost the game".to_string(),
                });
            }

            if is_white {
                game.white_time_remaining =
                    game.white_time_remaining.saturating_sub(time_used);
            } else {
                game.black_time_remaining =
                    game.black_time_remaining.saturating_sub(time_used);
            }
        }

        let move_validation = query::validate_move(
            game.current_fen.clone(),
            from.clone(),
            to.clone(),
            promotion.clone(),
        )?;

        if !move_validation.is_valid {
            return Err(ContractError::IllegalMove {
                error: move_validation.error.unwrap_or("Unknown error".to_string()),
            });
        }

        let move_string = format!("{}{}{}", from, to, promotion.unwrap_or_default());
        game.moves = if game.moves.is_empty() {
            move_string
        } else {
            format!("{},{}", game.moves, move_string)
        };

        if let Some(new_fen) = move_validation.resulting_fen {
            game.current_fen = new_fen.clone();
            let position_check = query::verify_position_internal(new_fen)?;
            match position_check.status {
                GameStatus::Checkmate => {
                    let white_won = game.current_turn == "white";
                    let black_won = game.current_turn == "black";
                    game.status = if white_won { "white_won" } else { "black_won" }.to_string();
                    update_profiles_after_game(&mut deps, &game, white_won, black_won, false)?;
                }
                GameStatus::Stalemate | GameStatus::Draw => {
                    game.status = "draw".to_string();
                    update_profiles_after_game(&mut deps, &game, false, false, true)?;
                }
                GameStatus::Active => {}
            }
        }

        if game.move_count >= 2 {
            let increment = if game.move_count <= 20 { 600u64 } else { 60u64 };
            if is_white {
                game.white_time_remaining =
                    game.white_time_remaining.saturating_add(increment);
            } else {
                game.black_time_remaining =
                    game.black_time_remaining.saturating_add(increment);
            }
        }

        game.move_count += 1;
        game.last_move_block = env.block.height;

        if game.status == "active" {
            game.current_turn = if game.current_turn == "white" {
                "black"
            } else {
                "white"
            }
            .to_string();
        }

        GAMES.save(deps.storage, game_id.clone(), &game)?;

        Ok(Response::new()
            .add_attribute("action", "make_move")
            .add_attribute("game_id", game_id)
            .add_attribute("player", info.sender)
            .add_attribute("move", format!("{}{}", from, to)))
    }

    pub fn update_game_status(
        mut deps: DepsMut,
        info: MessageInfo,
        game_id: String,
        status: String,
    ) -> Result<Response, ContractError> {
        let mut game = GAMES.load(deps.storage, game_id.clone())?;

        let is_player = game.white == info.sender
            || game
                .black
                .as_ref()
                .map(|b| b == &info.sender)
                .unwrap_or(false);
        if !is_player {
            return Err(ContractError::NotPlayerInGame {});
        }

        let old_status = game.status.clone();
        game.status = status.clone();

        if old_status == "active" {
            match status.as_str() {
                "white_won" => {
                    update_profiles_after_game(&mut deps, &game, true, false, false)?;
                }
                "black_won" => {
                    update_profiles_after_game(&mut deps, &game, false, true, false)?;
                }
                "draw" => {
                    update_profiles_after_game(&mut deps, &game, false, false, true)?;
                }
                _ => {}
            }
        }

        GAMES.save(deps.storage, game_id.clone(), &game)?;

        Ok(Response::new()
            .add_attribute("action", "update_game_status")
            .add_attribute("game_id", game_id)
            .add_attribute("status", status)
            .add_attribute("player", info.sender))
    }

    pub fn resign_game(
        mut deps: DepsMut,
        info: MessageInfo,
        game_id: String,
    ) -> Result<Response, ContractError> {
        let mut game = GAMES.load(deps.storage, game_id.clone())?;

        let is_player = game.white == info.sender
            || game
                .black
                .as_ref()
                .map(|b| b == &info.sender)
                .unwrap_or(false);
        if !is_player {
            return Err(ContractError::NotPlayerInGame {});
        }

        if game.status != "active" {
            return Err(ContractError::GameNotActive {});
        }

        let is_white = game.white == info.sender;
        let white_won = !is_white;
        let black_won = is_white;

        game.status = if is_white { "black_won" } else { "white_won" }.to_string();
        update_profiles_after_game(&mut deps, &game, white_won, black_won, false)?;

        GAMES.save(deps.storage, game_id.clone(), &game)?;

        let winner = if is_white {
            game.black
                .map(|a| a.to_string())
                .unwrap_or_default()
        } else {
            game.white.to_string()
        };

        Ok(Response::new()
            .add_attribute("action", "resign_game")
            .add_attribute("game_id", game_id)
            .add_attribute("resigned_player", info.sender)
            .add_attribute("winner", winner))
    }

    pub fn propose_draw(
        deps: DepsMut,
        info: MessageInfo,
        game_id: String,
    ) -> Result<Response, ContractError> {
        let mut game = GAMES.load(deps.storage, game_id.clone())?;

        let is_player = game.white == info.sender
            || game
                .black
                .as_ref()
                .map(|b| b == &info.sender)
                .unwrap_or(false);
        if !is_player {
            return Err(ContractError::NotPlayerInGame {});
        }

        if game.status != "active" {
            return Err(ContractError::GameNotActive {});
        }

        if let Some(ref proposer) = game.draw_proposed_by {
            if proposer == &info.sender.to_string() {
                return Err(ContractError::DrawAlreadyProposed {});
            }
        }

        game.draw_proposed_by = Some(info.sender.to_string());
        GAMES.save(deps.storage, game_id.clone(), &game)?;

        Ok(Response::new()
            .add_attribute("action", "propose_draw")
            .add_attribute("game_id", game_id)
            .add_attribute("proposed_by", info.sender))
    }

    pub fn respond_to_draw(
        mut deps: DepsMut,
        info: MessageInfo,
        game_id: String,
        accept: bool,
    ) -> Result<Response, ContractError> {
        let mut game = GAMES.load(deps.storage, game_id.clone())?;

        let is_player = game.white == info.sender
            || game
                .black
                .as_ref()
                .map(|b| b == &info.sender)
                .unwrap_or(false);
        if !is_player {
            return Err(ContractError::NotPlayerInGame {});
        }

        if game.status != "active" {
            return Err(ContractError::GameNotActive {});
        }

        let draw_proposer = game
            .draw_proposed_by
            .clone()
            .ok_or(ContractError::NoDrawProposal {})?;

        if draw_proposer == info.sender.to_string() {
            return Err(ContractError::CannotRespondToOwnProposal {});
        }

        if accept {
            game.status = "draw".to_string();
            game.draw_proposed_by = None;
            update_profiles_after_game(&mut deps, &game, false, false, true)?;
            GAMES.save(deps.storage, game_id.clone(), &game)?;

            Ok(Response::new()
                .add_attribute("action", "accept_draw")
                .add_attribute("game_id", game_id)
                .add_attribute("accepted_by", info.sender)
                .add_attribute("result", "draw"))
        } else {
            game.draw_proposed_by = None;
            GAMES.save(deps.storage, game_id.clone(), &game)?;

            Ok(Response::new()
                .add_attribute("action", "decline_draw")
                .add_attribute("game_id", game_id)
                .add_attribute("declined_by", info.sender))
        }
    }

    pub fn place_spectator_wager(
        deps: DepsMut,
        info: MessageInfo,
        game_id: String,
        prediction: String,
    ) -> Result<Response, ContractError> {
        let game = GAMES.load(deps.storage, game_id.clone())?;

        if !game.spectator_wagers_enabled {
            return Err(ContractError::SpectatorWagersDisabled {});
        }

        if game.status != "active" && game.status != "waiting" {
            return Err(ContractError::GameNotActive {});
        }

        let denom = game.wager_denom.clone();
        let sent = info
            .funds
            .iter()
            .find(|c| c.denom == denom)
            .map(|c| c.amount)
            .unwrap_or(Uint128::zero());

        if sent.is_zero() {
            return Err(ContractError::InsufficientFunds {
                required: "1".to_string(),
                sent: "0".to_string(),
            });
        }

        let bettor = info.sender.clone();
        let wager = SpectatorWager {
            game_id: game_id.clone(),
            bettor: bettor.clone(),
            prediction: prediction.clone(),
            amount: sent,
            denom,
            claimed: false,
        };

        SPECTATOR_WAGERS.save(deps.storage, (game_id.clone(), bettor.clone()), &wager)?;

        Ok(Response::new()
            .add_attribute("action", "place_spectator_wager")
            .add_attribute("game_id", game_id)
            .add_attribute("bettor", bettor)
            .add_attribute("prediction", prediction)
            .add_attribute("amount", sent))
    }

    pub fn claim_winnings(
        deps: DepsMut,
        info: MessageInfo,
        game_id: String,
    ) -> Result<Response, ContractError> {
        let game = GAMES.load(deps.storage, game_id.clone())?;

        let is_finished = matches!(
            game.status.as_str(),
            "white_won" | "black_won" | "draw" | "stalemate"
        );
        if !is_finished {
            return Err(ContractError::GameNotFinished {});
        }

        let claimant = info.sender.clone();
        let is_white = game.white == claimant;
        let is_black = game
            .black
            .as_ref()
            .map(|b| b == &claimant)
            .unwrap_or(false);

        let mut messages: Vec<cosmwasm_std::CosmosMsg> = Vec::new();
        let mut claimed_anything = false;

        // Player wager claims
        if (is_white || is_black)
            && game
                .wager_amount
                .map(|a| a > Uint128::zero())
                .unwrap_or(false)
            && game.wager_funded_white
            && game.wager_funded_black
        {
            let should_pay = matches!(
                (game.status.as_str(), is_white, is_black),
                ("white_won", true, _) | ("black_won", _, true) | ("draw", _, _)
            );

            if should_pay {
                let payout = if game.status == "draw" {
                    game.wager_amount.unwrap() // each player gets their stake back
                } else {
                    game.wager_amount.unwrap() * Uint128::new(2) // winner takes all
                };

                messages.push(cosmwasm_std::CosmosMsg::Bank(BankMsg::Send {
                    to_address: claimant.to_string(),
                    amount: vec![Coin {
                        denom: game.wager_denom.clone(),
                        amount: payout,
                    }],
                }));
                claimed_anything = true;
            }
        }

        // Spectator wager claims
        if let Ok(mut spec_wager) =
            SPECTATOR_WAGERS.load(deps.storage, (game_id.clone(), claimant.clone()))
        {
            if spec_wager.claimed {
                return Err(ContractError::AlreadyClaimed {});
            }

            let won = match game.status.as_str() {
                "white_won" => spec_wager.prediction == "white",
                "black_won" => spec_wager.prediction == "black",
                "draw" | "stalemate" => spec_wager.prediction == "draw",
                _ => false,
            };

            if won {
                messages.push(cosmwasm_std::CosmosMsg::Bank(BankMsg::Send {
                    to_address: claimant.to_string(),
                    amount: vec![Coin {
                        denom: spec_wager.denom.clone(),
                        amount: spec_wager.amount * Uint128::new(2),
                    }],
                }));
                spec_wager.claimed = true;
                SPECTATOR_WAGERS.save(
                    deps.storage,
                    (game_id.clone(), claimant.clone()),
                    &spec_wager,
                )?;
                claimed_anything = true;
            }
        }

        if !claimed_anything {
            return Err(ContractError::NoWinningsToClaim {});
        }

        Ok(Response::new()
            .add_messages(messages)
            .add_attribute("action", "claim_winnings")
            .add_attribute("game_id", game_id)
            .add_attribute("claimant", claimant))
    }

    pub fn cancel_game(
        deps: DepsMut,
        info: MessageInfo,
        game_id: String,
    ) -> Result<Response, ContractError> {
        let mut game = GAMES.load(deps.storage, game_id.clone())?;

        if game.white != info.sender {
            return Err(ContractError::NotGameCreator {});
        }

        if game.status != "waiting" {
            return Err(ContractError::GameNotWaiting {});
        }

        game.status = "cancelled".to_string();
        GAMES.save(deps.storage, game_id.clone(), &game)?;

        let mut messages: Vec<cosmwasm_std::CosmosMsg> = Vec::new();

        if game.wager_funded_white {
            if let Some(amount) = game.wager_amount {
                if amount > Uint128::zero() {
                    messages.push(cosmwasm_std::CosmosMsg::Bank(BankMsg::Send {
                        to_address: info.sender.to_string(),
                        amount: vec![Coin {
                            denom: game.wager_denom,
                            amount,
                        }],
                    }));
                }
            }
        }

        Ok(Response::new()
            .add_messages(messages)
            .add_attribute("action", "cancel_game")
            .add_attribute("game_id", game_id)
            .add_attribute("cancelled_by", info.sender))
    }

    pub fn admin_set_elo(
        deps: DepsMut,
        address: cosmwasm_std::Addr,
        elo: u32,
    ) -> Result<Response, ContractError> {
        let mut profile = USER_PROFILES
            .may_load(deps.storage, address.clone())?
            .unwrap_or_default();
        profile.elo = elo;
        USER_PROFILES.save(deps.storage, address.clone(), &profile)?;
        USER_ADDRESSES.save(deps.storage, address.clone(), &true)?;

        Ok(Response::new()
            .add_attribute("action", "admin_set_elo")
            .add_attribute("address", address)
            .add_attribute("elo", elo.to_string()))
    }

    pub fn admin_set_stats(
        deps: DepsMut,
        address: cosmwasm_std::Addr,
        wins: u32,
        draws: u32,
        losses: u32,
        games_played: u32,
    ) -> Result<Response, ContractError> {
        let mut profile = USER_PROFILES
            .may_load(deps.storage, address.clone())?
            .unwrap_or_default();
        profile.wins = wins;
        profile.draws = draws;
        profile.losses = losses;
        profile.games_played = games_played;
        USER_PROFILES.save(deps.storage, address.clone(), &profile)?;
        USER_ADDRESSES.save(deps.storage, address.clone(), &true)?;

        Ok(Response::new()
            .add_attribute("action", "admin_set_stats")
            .add_attribute("address", address))
    }
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::VerifyPosition { fen } => to_json_binary(&query::verify_position_internal(fen)?),
        QueryMsg::ValidateMove {
            current_fen,
            move_from,
            move_to,
            promotion,
        } => to_json_binary(&query::validate_move(
            current_fen,
            move_from,
            move_to,
            promotion,
        )?),
        QueryMsg::GetGame { game_id } => to_json_binary(&query::get_game(deps, game_id)?),
        QueryMsg::GetPlayerGames { player } => {
            to_json_binary(&query::get_player_games(deps, player)?)
        }
        QueryMsg::GetAllGameIds {} => to_json_binary(&query::get_all_game_ids(deps)?),
        QueryMsg::CheckTimeStatus { game_id } => {
            to_json_binary(&query::check_time_status(deps, env, game_id)?)
        }
        QueryMsg::GetUserProfile { address } => {
            to_json_binary(&query::get_user_profile(deps, address)?)
        }
        QueryMsg::GetAllUsers {} => to_json_binary(&query::get_all_users(deps)?),
        QueryMsg::GetOpenGames {} => to_json_binary(&query::get_open_games(deps)?),
        QueryMsg::GetSpectatorWagers { game_id } => {
            to_json_binary(&query::get_spectator_wagers(deps, game_id)?)
        }
    }
}

pub mod query {
    use super::*;
    use cosmwasm_std::Addr;
    use cosmwasm_std::Order;
    use shakmaty::san::SanPlus;

    pub fn verify_position_internal(fen: String) -> StdResult<VerificationResponse> {
        let fen_parsed: Fen = fen
            .parse()
            .map_err(|_| cosmwasm_std::StdError::generic_err("Invalid FEN format"))?;

        let pos: Chess = fen_parsed
            .into_position(shakmaty::CastlingMode::Standard)
            .map_err(|_| cosmwasm_std::StdError::generic_err("Invalid chess position"))?;

        let is_check = pos.checkers().any();

        let legal_moves: Vec<String> = pos
            .legal_moves()
            .iter()
            .map(|m| SanPlus::from_move(pos.clone(), m).to_string())
            .collect();

        let status = if legal_moves.is_empty() {
            if is_check {
                GameStatus::Checkmate
            } else {
                GameStatus::Stalemate
            }
        } else if pos.is_insufficient_material() {
            GameStatus::Draw
        } else {
            GameStatus::Active
        };

        Ok(VerificationResponse {
            status,
            is_check,
            legal_moves,
        })
    }

    pub fn validate_move(
        current_fen: String,
        move_from: String,
        move_to: String,
        promotion: Option<String>,
    ) -> StdResult<MoveValidationResponse> {
        let fen_parsed: Fen = current_fen
            .parse()
            .map_err(|_| cosmwasm_std::StdError::generic_err("Invalid FEN format"))?;

        let mut pos: Chess = fen_parsed
            .into_position(shakmaty::CastlingMode::Standard)
            .map_err(|_| cosmwasm_std::StdError::generic_err("Invalid chess position"))?;

        let from_square = move_from
            .parse()
            .map_err(|_| cosmwasm_std::StdError::generic_err("Invalid from square"))?;
        let to_square = move_to
            .parse()
            .map_err(|_| cosmwasm_std::StdError::generic_err("Invalid to square"))?;

        let promotion_role = if let Some(promo) = promotion {
            match promo.to_lowercase().as_str() {
                "q" => Some(Role::Queen),
                "r" => Some(Role::Rook),
                "b" => Some(Role::Bishop),
                "n" => Some(Role::Knight),
                _ => {
                    return Ok(MoveValidationResponse {
                        is_valid: false,
                        resulting_fen: None,
                        error: Some("Invalid promotion piece".to_string()),
                    })
                }
            }
        } else {
            None
        };

        let piece = pos.board().piece_at(from_square);
        let capture_role = pos.board().piece_at(to_square).map(|p| p.role);

        if piece.is_none() {
            return Ok(MoveValidationResponse {
                is_valid: false,
                resulting_fen: None,
                error: Some("No piece at from square".to_string()),
            });
        }

        let chess_move = Move::Normal {
            from: from_square,
            to: to_square,
            capture: capture_role,
            promotion: promotion_role,
            role: piece.unwrap().role,
        };

        if pos.is_legal(&chess_move) {
            pos.play_unchecked(&chess_move);
            let resulting_fen =
                Fen::from_position(pos, shakmaty::EnPassantMode::Legal).to_string();
            Ok(MoveValidationResponse {
                is_valid: true,
                resulting_fen: Some(resulting_fen),
                error: None,
            })
        } else {
            Ok(MoveValidationResponse {
                is_valid: false,
                resulting_fen: None,
                error: Some("Illegal move".to_string()),
            })
        }
    }

    pub fn get_game(deps: Deps, game_id: String) -> StdResult<GameResponse> {
        let game = GAMES.may_load(deps.storage, game_id)?;
        Ok(GameResponse { game })
    }

    pub fn get_player_games(deps: Deps, player: Addr) -> StdResult<GamesResponse> {
        let all_game_ids: Vec<String> = GAME_IDS
            .keys(deps.storage, None, None, Order::Ascending)
            .collect::<StdResult<Vec<_>>>()?;

        let mut player_games = Vec::new();
        for game_id in all_game_ids {
            if let Some(game) = GAMES.may_load(deps.storage, game_id)? {
                let in_game = game.white == player
                    || game.black.as_ref().map(|b| b == &player).unwrap_or(false);
                if in_game {
                    player_games.push(game);
                }
            }
        }

        Ok(GamesResponse { games: player_games })
    }

    pub fn get_all_game_ids(deps: Deps) -> StdResult<GameIdsResponse> {
        let game_ids: Vec<String> = GAME_IDS
            .keys(deps.storage, None, None, Order::Ascending)
            .collect::<StdResult<Vec<_>>>()?;
        Ok(GameIdsResponse { game_ids })
    }

    pub fn check_time_status(
        deps: Deps,
        env: Env,
        game_id: String,
    ) -> StdResult<TimeStatusResponse> {
        let game = GAMES.load(deps.storage, game_id)?;
        let time_since_last_move = env.block.height.saturating_sub(game.last_move_block);

        let (white_time_remaining, black_time_remaining) = if game.move_count >= 2 {
            if game.current_turn == "white" {
                let white_remaining =
                    game.white_time_remaining.saturating_sub(time_since_last_move);
                (white_remaining, game.black_time_remaining)
            } else {
                let black_remaining =
                    game.black_time_remaining.saturating_sub(time_since_last_move);
                (game.white_time_remaining, black_remaining)
            }
        } else {
            (game.white_time_remaining, game.black_time_remaining)
        };

        let time_expired = if game.move_count >= 2 {
            let current_time = if game.current_turn == "white" {
                white_time_remaining
            } else {
                black_time_remaining
            };
            current_time == 0
        } else {
            false
        };

        Ok(TimeStatusResponse {
            white_time_remaining,
            black_time_remaining,
            current_player: game.current_turn,
            time_expired,
            move_count: game.move_count,
            time_since_last_move,
        })
    }

    pub fn get_user_profile(deps: Deps, address: Addr) -> StdResult<UserProfileResponse> {
        let profile = USER_PROFILES.may_load(deps.storage, address)?;
        Ok(UserProfileResponse { profile })
    }

    pub fn get_all_users(deps: Deps) -> StdResult<UsersResponse> {
        let users: Vec<Addr> = USER_ADDRESSES
            .keys(deps.storage, None, None, Order::Ascending)
            .collect::<StdResult<Vec<_>>>()?;
        Ok(UsersResponse { users })
    }

    pub fn get_open_games(deps: Deps) -> StdResult<OpenGamesResponse> {
        let all_game_ids: Vec<String> = GAME_IDS
            .keys(deps.storage, None, None, Order::Ascending)
            .collect::<StdResult<Vec<_>>>()?;

        let mut open_games = Vec::new();
        for game_id in all_game_ids {
            if let Some(game) = GAMES.may_load(deps.storage, game_id)? {
                if game.status == "waiting" {
                    open_games.push(game);
                }
            }
        }

        Ok(OpenGamesResponse { games: open_games })
    }

    pub fn get_spectator_wagers(
        deps: Deps,
        game_id: String,
    ) -> StdResult<SpectatorWagersResponse> {
        let prefix = SPECTATOR_WAGERS.prefix(game_id);
        let wagers: Vec<SpectatorWager> = prefix
            .range(deps.storage, None, None, Order::Ascending)
            .map(|item| item.map(|(_, v)| v))
            .collect::<StdResult<Vec<_>>>()?;

        let mut total_white = Uint128::zero();
        let mut total_black = Uint128::zero();
        let mut total_draw = Uint128::zero();

        for w in &wagers {
            match w.prediction.as_str() {
                "white" => total_white += w.amount,
                "black" => total_black += w.amount,
                "draw" => total_draw += w.amount,
                _ => {}
            }
        }

        Ok(SpectatorWagersResponse {
            wagers,
            total_white,
            total_black,
            total_draw,
        })
    }
}
