#[cfg(test)]
mod tests {
    use crate::helpers::ChessVerifierContract;
    use crate::msg::{InstantiateMsg, QueryMsg, GameStatus, VerificationResponse, MoveValidationResponse};
    use cosmwasm_std::testing::MockApi;
    use cosmwasm_std::{Addr, Coin, Empty, Uint128, from_json};
    use cw_multi_test::{App, AppBuilder, Contract, ContractWrapper, Executor};

    pub fn chess_verifier_contract() -> Box<dyn Contract<Empty>> {
        let contract = ContractWrapper::new(
            crate::contract::execute,
            crate::contract::instantiate,
            crate::contract::query,
        );
        Box::new(contract)
    }

    const USER: &str = "USER";
    const ADMIN: &str = "ADMIN";
    const NATIVE_DENOM: &str = "denom";

    fn mock_app() -> App {
        AppBuilder::new().build(|router, _, storage| {
            router
                .bank
                .init_balance(
                    storage,
                    &MockApi::default().addr_make(USER),
                    vec![Coin {
                        denom: NATIVE_DENOM.to_string(),
                        amount: Uint128::new(1),
                    }],
                )
                .unwrap();
        })
    }

    fn proper_instantiate() -> (App, ChessVerifierContract) {
        let mut app = mock_app();
        let contract_id = app.store_code(chess_verifier_contract());

        let msg = InstantiateMsg {};
        let contract_addr = app
            .instantiate_contract(
                contract_id,
                Addr::unchecked(ADMIN),
                &msg,
                &[],
                "chess-verifier",
                None,
            )
            .unwrap();

        let chess_contract = ChessVerifierContract(contract_addr);
        (app, chess_contract)
    }

    mod chess_verification {
        use super::*;

        #[test]
        fn proper_initialization() {
            let (_app, _contract) = proper_instantiate();
            // If we get here, instantiation succeeded
        }

        #[test]
        fn verify_starting_position() {
            let (app, contract) = proper_instantiate();
            let starting_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
            
            let res: VerificationResponse = app
                .wrap()
                .query_wasm_smart(contract.addr(), &QueryMsg::VerifyPosition { 
                    fen: starting_fen.to_string() 
                })
                .unwrap();
            
            matches!(res.status, GameStatus::Active);
            assert!(!res.is_check);
            assert!(res.legal_moves.len() == 20); // 16 pawn moves + 4 knight moves
        }

        #[test]
        fn verify_checkmate_position() {
            let (app, contract) = proper_instantiate();
            // Scholar's mate position - checkmate in 4 moves
            let checkmate_fen = "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4";
            
            let res: VerificationResponse = app
                .wrap()
                .query_wasm_smart(contract.addr(), &QueryMsg::VerifyPosition { 
                    fen: checkmate_fen.to_string() 
                })
                .unwrap();
            
            matches!(res.status, GameStatus::Checkmate);
            assert!(res.is_check);
            assert!(res.legal_moves.is_empty());
        }

        #[test]
        fn validate_legal_move() {
            let (app, contract) = proper_instantiate();
            let starting_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
            
            let res: MoveValidationResponse = app
                .wrap()
                .query_wasm_smart(contract.addr(), &QueryMsg::ValidateMove { 
                    current_fen: starting_fen.to_string(),
                    move_from: "e2".to_string(),
                    move_to: "e4".to_string(),
                    promotion: None,
                })
                .unwrap();
            
            assert!(res.is_valid);
            assert!(res.resulting_fen.is_some());
            assert!(res.error.is_none());
        }

        #[test]
        fn validate_illegal_move() {
            let (app, contract) = proper_instantiate();
            let starting_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
            
            let res: MoveValidationResponse = app
                .wrap()
                .query_wasm_smart(contract.addr(), &QueryMsg::ValidateMove { 
                    current_fen: starting_fen.to_string(),
                    move_from: "e2".to_string(),
                    move_to: "e5".to_string(), // Illegal pawn move
                    promotion: None,
                })
                .unwrap();
            
            assert!(!res.is_valid);
            assert!(res.resulting_fen.is_none());
            assert!(res.error.is_some());
        }
    }
}
