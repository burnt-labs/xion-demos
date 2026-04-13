#!/bin/bash

# Xion Chess Contract Deployment Script
# Based on: https://docs.burnt.com/xion/developers/getting-started-advanced/your-first-contract/deploy-a-cosmwasm-smart-contract

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
RPC_URL="https://rpc.xion-testnet-2.burnt.com:443"
CHAIN_ID="xion-testnet-2"
CONTRACT_WASM="./artifacts/xion_chess.wasm"
GAS_PRICES="0.001uxion"

# Check if required tools are installed
check_dependencies() {
    echo -e "${YELLOW}Checking dependencies...${NC}"
    
    if ! command -v xiond &> /dev/null; then
        echo -e "${RED}Error: xiond not found. Please install the Xion CLI.${NC}"
        echo "Visit: https://docs.burnt.com/xion/developers/getting-started/installation"
        exit 1
    fi
    
    if [ ! -f "$CONTRACT_WASM" ]; then
        echo -e "${RED}Error: Contract WASM not found at $CONTRACT_WASM${NC}"
        echo "Please run the optimizer first: docker run --rm -v \"\$(pwd)\":/code ... cosmwasm/optimizer:0.17.0"
        exit 1
    fi
    
    echo -e "${GREEN}Dependencies check passed!${NC}"
}

# Check wallet configuration
check_wallet() {
    echo -e "${YELLOW}Checking wallet configuration...${NC}"
    
    if [ -z "$WALLET_NAME" ]; then
        echo -e "${RED}Error: WALLET_NAME environment variable not set${NC}"
        echo "Please set your wallet name: export WALLET_NAME=your-wallet-name"
        exit 1
    fi
    
    # Check if wallet exists
    if ! xiond keys show "$WALLET_NAME" &> /dev/null; then
        echo -e "${RED}Error: Wallet '$WALLET_NAME' not found${NC}"
        echo "Please create or import your wallet first:"
        echo "  xiond keys add $WALLET_NAME"
        echo "  # or import existing:"
        echo "  xiond keys add $WALLET_NAME --recover"
        exit 1
    fi
    
    # Get wallet address
    WALLET_ADDRESS=$(xiond keys show $WALLET_NAME -a)
    echo -e "${GREEN}Using wallet: $WALLET_NAME ($WALLET_ADDRESS)${NC}"
    
    # Check balance
    BALANCE=$(xiond query bank balances $WALLET_ADDRESS --node $RPC_URL --chain-id $CHAIN_ID --output json | jq -r '.balances[0].amount // "0"')
    echo -e "${GREEN}Wallet balance: ${BALANCE}uxion${NC}"
    
    if [ "$BALANCE" -lt 1000000 ]; then
        echo -e "${YELLOW}Warning: Low balance. You may need more XION tokens for deployment.${NC}"
        echo "Get testnet tokens from: https://faucet.burnt.com/"
    fi
}

# Upload the contract
upload_contract() {
    # Check if code_id.txt already exists
    if [ -f "code_id.txt" ]; then
        EXISTING_CODE_ID=$(cat code_id.txt)
        if [[ "$EXISTING_CODE_ID" =~ ^[0-9]+$ ]]; then
            echo -e "${YELLOW}Found existing code ID: $EXISTING_CODE_ID${NC}"
            read -p "Do you want to use the existing code ID or upload again? (u)se existing / (r)e-upload: " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Uu]$ ]]; then
                CODE_ID=$EXISTING_CODE_ID
                echo -e "${GREEN}Using existing code ID: $CODE_ID${NC}"
                return 0
            fi
        fi
    fi
    
    echo -e "${YELLOW}Uploading contract...${NC}"
    
    UPLOAD_RESULT=$(xiond tx wasm store $CONTRACT_WASM \
        --chain-id $CHAIN_ID \
        --gas-adjustment 1.3 \
        --gas-prices $GAS_PRICES \
        --gas auto \
        -y --output json \
        --node $RPC_URL \
        --from $WALLET_NAME)
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Error: Failed to upload contract${NC}"
        exit 1
    fi
    
    # Debug: Show the upload result
    echo -e "${YELLOW}Upload result:${NC}"
    echo "$UPLOAD_RESULT" | jq '.'
    
    # Extract code ID from the response - try multiple possible locations
    CODE_ID=$(echo $UPLOAD_RESULT | jq -r '.logs[0].events[] | select(.type=="store_code") | .attributes[] | select(.key=="code_id") | .value' 2>/dev/null)
    
    # If first method fails, try alternative extraction methods
    if [ "$CODE_ID" = "null" ] || [ -z "$CODE_ID" ]; then
        CODE_ID=$(echo $UPLOAD_RESULT | jq -r '.events[]? | select(.type=="store_code") | .attributes[] | select(.key=="code_id") | .value' 2>/dev/null)
    fi
    
    if [ "$CODE_ID" = "null" ] || [ -z "$CODE_ID" ]; then
        CODE_ID=$(echo $UPLOAD_RESULT | jq -r '.raw_log' | grep -o '"code_id","value":"[^"]*"' | sed 's/.*"value":"\([^"]*\)".*/\1/' 2>/dev/null)
    fi
    
    if [ "$CODE_ID" = "null" ] || [ -z "$CODE_ID" ]; then
        echo -e "${YELLOW}Could not automatically extract code ID from response.${NC}"
        echo -e "${YELLOW}Transaction hash: $(echo $UPLOAD_RESULT | jq -r '.txhash')${NC}"
        echo ""
        echo -e "${YELLOW}Please check the transaction in the explorer and find the code ID:${NC}"
        echo "https://explorer.burnt.com/xion-testnet-2/tx/$(echo $UPLOAD_RESULT | jq -r '.txhash')"
        echo ""
        read -p "Enter the Code ID from the explorer: " CODE_ID
        
        if [ -z "$CODE_ID" ]; then
            echo -e "${RED}No code ID provided. Exiting.${NC}"
            exit 1
        fi
        
        # Validate it's a number
        if ! [[ "$CODE_ID" =~ ^[0-9]+$ ]]; then
            echo -e "${RED}Invalid code ID. Must be a number.${NC}"
            exit 1
        fi
    fi
    
    echo -e "${GREEN}Contract uploaded successfully! Code ID: $CODE_ID${NC}"
    echo "$CODE_ID" > code_id.txt
    
    return 0
}

# Instantiate the contract
instantiate_contract() {
    local CODE_ID=$1
    
    # Check if contract_address.txt already exists
    if [ -f "contract_address.txt" ]; then
        EXISTING_CONTRACT_ADDRESS=$(cat contract_address.txt)
        if [[ "$EXISTING_CONTRACT_ADDRESS" =~ ^xion1[a-z0-9]{38}$ ]]; then
            echo -e "${YELLOW}Found existing contract address: $EXISTING_CONTRACT_ADDRESS${NC}"
            read -p "Do you want to use the existing contract or instantiate a new one? (u)se existing / (n)ew instance: " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Uu]$ ]]; then
                CONTRACT_ADDRESS=$EXISTING_CONTRACT_ADDRESS
                echo -e "${GREEN}Using existing contract address: $CONTRACT_ADDRESS${NC}"
                return 0
            fi
        fi
    fi
    
    echo -e "${YELLOW}Instantiating contract with Code ID: $CODE_ID...${NC}"
    
    # Instantiate message (empty for our contract)
    INSTANTIATE_MSG='{}'
    
    INSTANTIATE_RESULT=$(xiond tx wasm instantiate $CODE_ID "$INSTANTIATE_MSG" \
        --from $WALLET_NAME \
        --label "Xion Chess Game Contract" \
        --gas-prices $GAS_PRICES \
        --gas auto \
        --gas-adjustment 1.3 \
        -y --no-admin \
        --chain-id $CHAIN_ID \
        --node $RPC_URL \
        --output json)
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Error: Failed to instantiate contract${NC}"
        exit 1
    fi
    
    # Debug: Show the instantiate result
    echo -e "${YELLOW}Instantiate result:${NC}"
    echo "$INSTANTIATE_RESULT" | jq '.'
    
    # Extract contract address - try multiple possible locations
    CONTRACT_ADDRESS=$(echo $INSTANTIATE_RESULT | jq -r '.logs[0].events[] | select(.type=="instantiate") | .attributes[] | select(.key=="_contract_address") | .value' 2>/dev/null)
    
    # If first method fails, try alternative extraction methods
    if [ "$CONTRACT_ADDRESS" = "null" ] || [ -z "$CONTRACT_ADDRESS" ]; then
        CONTRACT_ADDRESS=$(echo $INSTANTIATE_RESULT | jq -r '.events[]? | select(.type=="instantiate") | .attributes[] | select(.key=="_contract_address") | .value' 2>/dev/null)
    fi
    
    if [ "$CONTRACT_ADDRESS" = "null" ] || [ -z "$CONTRACT_ADDRESS" ]; then
        CONTRACT_ADDRESS=$(echo $INSTANTIATE_RESULT | jq -r '.raw_log' | grep -o '"_contract_address","value":"[^"]*"' | sed 's/.*"value":"\([^"]*\)".*/\1/' 2>/dev/null)
    fi
    
    if [ "$CONTRACT_ADDRESS" = "null" ] || [ -z "$CONTRACT_ADDRESS" ]; then
        echo -e "${YELLOW}Could not automatically extract contract address from response.${NC}"
        echo -e "${YELLOW}Transaction hash: $(echo $INSTANTIATE_RESULT | jq -r '.txhash')${NC}"
        echo ""
        echo -e "${YELLOW}Please check the transaction in the explorer and find the contract address:${NC}"
        echo "https://explorer.burnt.com/xion-testnet-2/tx/$(echo $INSTANTIATE_RESULT | jq -r '.txhash')"
        echo ""
        read -p "Enter the Contract Address from the explorer: " CONTRACT_ADDRESS
        
        if [ -z "$CONTRACT_ADDRESS" ]; then
            echo -e "${RED}No contract address provided. Exiting.${NC}"
            exit 1
        fi
        
        # Basic validation - should start with xion1
        if ! [[ "$CONTRACT_ADDRESS" =~ ^xion1[a-z0-9]{38}$ ]]; then
            echo -e "${YELLOW}Warning: Contract address format may be invalid. Continuing anyway...${NC}"
        fi
    fi
    
    echo -e "${GREEN}Contract instantiated successfully!${NC}"
    echo -e "${GREEN}Contract Address: $CONTRACT_ADDRESS${NC}"
    echo "$CONTRACT_ADDRESS" > contract_address.txt
    
    return 0
}

# Update frontend environment
update_frontend_env() {
    local CONTRACT_ADDRESS=$1
    local FRONTEND_ENV_FILE="../frontend/.env.local"
    
    echo -e "${YELLOW}Updating frontend environment...${NC}"
    
    if [ -f "$FRONTEND_ENV_FILE" ]; then
        # Update existing file
        if grep -q "NEXT_PUBLIC_CHESS_GAME_ADDRESS" "$FRONTEND_ENV_FILE"; then
            # Replace existing line
            if [[ "$OSTYPE" == "darwin"* ]]; then
                # macOS
                sed -i '' "s/NEXT_PUBLIC_CHESS_GAME_ADDRESS=.*/NEXT_PUBLIC_CHESS_GAME_ADDRESS=\"$CONTRACT_ADDRESS\"/" "$FRONTEND_ENV_FILE"
            else
                # Linux
                sed -i "s/NEXT_PUBLIC_CHESS_GAME_ADDRESS=.*/NEXT_PUBLIC_CHESS_GAME_ADDRESS=\"$CONTRACT_ADDRESS\"/" "$FRONTEND_ENV_FILE"
            fi
        else
            # Add new line
            echo "NEXT_PUBLIC_CHESS_GAME_ADDRESS=\"$CONTRACT_ADDRESS\"" >> "$FRONTEND_ENV_FILE"
        fi
        echo -e "${GREEN}Updated $FRONTEND_ENV_FILE${NC}"
    else
        echo -e "${YELLOW}Frontend .env.local not found. Please manually update NEXT_PUBLIC_CHESS_GAME_ADDRESS=${CONTRACT_ADDRESS}${NC}"
    fi
}

# Test contract
test_contract() {
    local CONTRACT_ADDRESS=$1
    
    echo -e "${YELLOW}Testing contract deployment...${NC}"
    
    # Try to query the contract (this should not fail even with empty storage)
    TEST_RESULT=$(xiond query wasm contract-state smart $CONTRACT_ADDRESS '{"get_all_game_ids":{}}' \
        --node $RPC_URL \
        --chain-id $CHAIN_ID \
        --output json 2>/dev/null || echo '{"error": "query failed"}')
    
    if echo "$TEST_RESULT" | jq -e '.data.game_ids' > /dev/null 2>&1; then
        echo -e "${GREEN}Contract test successful! Contract is responding to queries.${NC}"
    else
        echo -e "${YELLOW}Contract deployed but test query returned: $TEST_RESULT${NC}"
        echo -e "${YELLOW}This might be normal if the contract storage is empty.${NC}"
    fi
}

# Main deployment function
main() {
    echo -e "${GREEN}🚀 Starting Xion Chess Contract Deployment${NC}"
    echo "=================================="
    
    check_dependencies
    check_wallet
    
    echo ""
    echo -e "${YELLOW}Ready to deploy with the following configuration:${NC}"
    echo "  RPC URL: $RPC_URL"
    echo "  Chain ID: $CHAIN_ID" 
    echo "  Wallet: $WALLET_NAME ($WALLET_ADDRESS)"
    echo "  Contract: $CONTRACT_WASM"
    echo ""
    
    read -p "Continue with deployment? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Deployment cancelled."
        exit 0
    fi
    
    echo ""
    upload_contract
    
    CODE_ID=$(cat code_id.txt)
    instantiate_contract $CODE_ID
    
    CONTRACT_ADDRESS=$(cat contract_address.txt)
    update_frontend_env $CONTRACT_ADDRESS
    test_contract $CONTRACT_ADDRESS
    
    echo ""
    echo -e "${GREEN}🎉 Deployment Complete!${NC}"
    echo "=================================="
    echo -e "${GREEN}Code ID: $CODE_ID${NC}"
    echo -e "${GREEN}Contract Address: $CONTRACT_ADDRESS${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "1. Update your frontend to use the new contract address"
    echo "2. Remove temporary workarounds from useChessGame.ts"
    echo "3. Test game creation and moves!"
    echo ""
    echo -e "${YELLOW}Files created:${NC}"
    echo "  - code_id.txt (contains: $CODE_ID)"
    echo "  - contract_address.txt (contains: $CONTRACT_ADDRESS)"
}

# Run main function
main "$@"