use cosmwasm_std::StdError;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("Invalid position claim: claimed {claimed}, actual {actual}")]
    InvalidClaim { claimed: String, actual: String },

    #[error("Invalid FEN format: {fen}")]
    InvalidFen { fen: String },

    #[error("Invalid move: {details}")]
    InvalidMove { details: String },

    #[error("Game already exists with ID: {id}")]
    GameAlreadyExists { id: String },

    #[error("You are not a player in this game")]
    NotPlayerInGame {},

    #[error("It's not your turn")]
    NotYourTurn {},

    #[error("Illegal chess move: {error}")]
    IllegalMove { error: String },

    #[error("Game is not active")]
    GameNotActive {},

    #[error("Draw already proposed by this player")]
    DrawAlreadyProposed {},

    #[error("No draw proposal to respond to")]
    NoDrawProposal {},

    #[error("Cannot respond to your own draw proposal")]
    CannotRespondToOwnProposal {},

    // Wager errors
    #[error("Insufficient funds: required {required}, sent {sent}")]
    InsufficientFunds { required: String, sent: String },

    #[error("No wager required for this game")]
    NoWagerRequired {},

    #[error("Wager already funded")]
    WagerAlreadyFunded {},

    #[error("Spectator wagering is not enabled for this game")]
    SpectatorWagersDisabled {},

    #[error("Game is not finished yet")]
    GameNotFinished {},

    #[error("No winnings to claim")]
    NoWinningsToClaim {},

    #[error("Winnings already claimed")]
    AlreadyClaimed {},

    #[error("Only the game creator can cancel")]
    NotGameCreator {},

    #[error("Invalid invite code")]
    InvalidInviteCode {},

    #[error("Game is not waiting for a player")]
    GameNotWaiting {},

    #[error("Cannot join your own game")]
    CannotJoinOwnGame {},
}
