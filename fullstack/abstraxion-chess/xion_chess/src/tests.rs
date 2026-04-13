#[cfg(test)]
mod unit_tests {
    use super::*;
    use crate::contract::{instantiate, query};
    use crate::msg::{InstantiateMsg, QueryMsg, GameStatus, VerificationResponse, MoveValidationResponse};
    use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};
    use cosmwasm_std::{from_json};

    #[test]
    fn proper_initialization() {
        let mut deps = mock_dependencies();
        let msg = InstantiateMsg {};
        let info = mock_info("creator", &[]);

        let res = instantiate(deps.as_mut(), mock_env(), info, msg).unwrap();
        assert_eq!(0, res.messages.len());
    }

    #[test]
    fn verify_starting_position() {
        let deps = mock_dependencies();
        let starting_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        
        let res = query(deps.as_ref(), mock_env(), QueryMsg::VerifyPosition { 
            fen: starting_fen.to_string() 
        }).unwrap();
        
        let response: VerificationResponse = from_json(&res).unwrap();
        matches!(response.status, GameStatus::Active);
        assert!(!response.is_check);
        assert!(response.legal_moves.len() == 20); // 16 pawn moves + 4 knight moves
    }

    #[test] 
    fn verify_checkmate_position() {
        let deps = mock_dependencies();
        // Scholar's mate position - checkmate in 4 moves
        let checkmate_fen = "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4";
        
        let res = query(deps.as_ref(), mock_env(), QueryMsg::VerifyPosition { 
            fen: checkmate_fen.to_string() 
        }).unwrap();
        
        let response: VerificationResponse = from_json(&res).unwrap();
        matches!(response.status, GameStatus::Checkmate);
        assert!(response.is_check);
        assert!(response.legal_moves.is_empty());
    }

    #[test]
    fn verify_stalemate_position() {
        let deps = mock_dependencies();
        // Stalemate position - king has no moves but is not in check
        let stalemate_fen = "k7/8/1K6/8/8/8/8/1Q6 b - - 0 1";
        
        let res = query(deps.as_ref(), mock_env(), QueryMsg::VerifyPosition { 
            fen: stalemate_fen.to_string() 
        }).unwrap();
        
        let response: VerificationResponse = from_json(&res).unwrap();
        matches!(response.status, GameStatus::Stalemate);
        assert!(!response.is_check);
        assert!(response.legal_moves.is_empty());
    }

    #[test]
    fn validate_legal_pawn_move() {
        let deps = mock_dependencies();
        let starting_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        
        let res = query(deps.as_ref(), mock_env(), QueryMsg::ValidateMove { 
            current_fen: starting_fen.to_string(),
            move_from: "e2".to_string(),
            move_to: "e4".to_string(),
            promotion: None,
        }).unwrap();
        
        let response: MoveValidationResponse = from_json(&res).unwrap();
        assert!(response.is_valid);
        assert!(response.resulting_fen.is_some());
        assert!(response.error.is_none());
        
        // Verify the resulting FEN is correct
        let expected_fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
        assert_eq!(response.resulting_fen.unwrap(), expected_fen);
    }

    #[test]
    fn validate_legal_knight_move() {
        let deps = mock_dependencies();
        let starting_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        
        let res = query(deps.as_ref(), mock_env(), QueryMsg::ValidateMove { 
            current_fen: starting_fen.to_string(),
            move_from: "g1".to_string(),
            move_to: "f3".to_string(),
            promotion: None,
        }).unwrap();
        
        let response: MoveValidationResponse = from_json(&res).unwrap();
        assert!(response.is_valid);
        assert!(response.resulting_fen.is_some());
        assert!(response.error.is_none());
    }

    #[test]
    fn validate_illegal_move() {
        let deps = mock_dependencies();
        let starting_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        
        let res = query(deps.as_ref(), mock_env(), QueryMsg::ValidateMove { 
            current_fen: starting_fen.to_string(),
            move_from: "e2".to_string(),
            move_to: "e5".to_string(), // Illegal pawn move (too far)
            promotion: None,
        }).unwrap();
        
        let response: MoveValidationResponse = from_json(&res).unwrap();
        assert!(!response.is_valid);
        assert!(response.resulting_fen.is_none());
        assert!(response.error.is_some());
    }

    #[test]
    fn validate_move_from_empty_square() {
        let deps = mock_dependencies();
        let starting_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        
        let res = query(deps.as_ref(), mock_env(), QueryMsg::ValidateMove { 
            current_fen: starting_fen.to_string(),
            move_from: "e4".to_string(), // Empty square
            move_to: "e5".to_string(),
            promotion: None,
        }).unwrap();
        
        let response: MoveValidationResponse = from_json(&res).unwrap();
        assert!(!response.is_valid);
        assert!(response.resulting_fen.is_none());
        assert!(response.error.is_some());
        assert!(response.error.unwrap().contains("No piece"));
    }

    #[test]
    fn validate_pawn_promotion() {
        let deps = mock_dependencies();
        // Position where white pawn can promote
        let promotion_fen = "rnbqkbnr/pppppPpp/8/8/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1";
        
        let res = query(deps.as_ref(), mock_env(), QueryMsg::ValidateMove { 
            current_fen: promotion_fen.to_string(),
            move_from: "f7".to_string(),
            move_to: "f8".to_string(),
            promotion: Some("q".to_string()), // Promote to queen
        }).unwrap();
        
        let response: MoveValidationResponse = from_json(&res).unwrap();
        assert!(response.is_valid);
        assert!(response.resulting_fen.is_some());
        assert!(response.error.is_none());
    }

    #[test]
    fn validate_invalid_promotion_piece() {
        let deps = mock_dependencies();
        let promotion_fen = "rnbqkbnr/pppppPpp/8/8/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1";
        
        let res = query(deps.as_ref(), mock_env(), QueryMsg::ValidateMove { 
            current_fen: promotion_fen.to_string(),
            move_from: "f7".to_string(),
            move_to: "f8".to_string(),
            promotion: Some("x".to_string()), // Invalid promotion piece
        }).unwrap();
        
        let response: MoveValidationResponse = from_json(&res).unwrap();
        assert!(!response.is_valid);
        assert!(response.resulting_fen.is_none());
        assert!(response.error.is_some());
        assert!(response.error.unwrap().contains("Invalid promotion"));
    }
}