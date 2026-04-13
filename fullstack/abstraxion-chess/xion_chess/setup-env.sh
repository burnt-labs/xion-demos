#!/bin/bash

# Environment Setup Helper for Xion Chess Contract Deployment

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🔧 Xion Chess Contract - Environment Setup${NC}"
echo "==========================================="

# Check if xiond is installed
if ! command -v xiond &> /dev/null; then
    echo -e "${RED}❌ xiond not found${NC}"
    echo ""
    echo -e "${YELLOW}Please install xiond first:${NC}"
    echo "1. Visit: https://docs.burnt.com/xion/developers/getting-started/installation"
    echo "2. Follow the installation instructions for your OS"
    echo ""
    exit 1
else
    echo -e "${GREEN}✅ xiond found${NC}"
fi

# Check if wallet is configured
if [ -z "$WALLET_NAME" ]; then
    echo ""
    echo -e "${YELLOW}⚠️  WALLET_NAME not set${NC}"
    echo ""
    echo "Please set up your wallet:"
    echo ""
    echo "1. Create a new wallet:"
    echo "   xiond keys add my-wallet"
    echo ""
    echo "2. Or import existing wallet:"
    echo "   xiond keys add my-wallet --recover"
    echo ""
    echo "3. Set environment variable:"
    echo "   export WALLET_NAME=my-wallet"
    echo ""
    echo "4. Add to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
    echo "   echo 'export WALLET_NAME=my-wallet' >> ~/.zshrc"
    echo ""
    echo "5. Get testnet tokens:"
    echo "   Visit: https://faucet.burnt.com/"
    echo ""
else
    echo -e "${GREEN}✅ WALLET_NAME set: $WALLET_NAME${NC}"
    
    if xiond keys show "$WALLET_NAME" &> /dev/null; then
        WALLET_ADDRESS=$(xiond keys show $WALLET_NAME -a)
        echo -e "${GREEN}✅ Wallet found: $WALLET_ADDRESS${NC}"
        
        # Check balance
        BALANCE=$(xiond query bank balances $WALLET_ADDRESS \
            --node https://rpc.xion-testnet-2.burnt.com:443 \
            --chain-id xion-testnet-2 \
            --output json 2>/dev/null | jq -r '.balances[0].amount // "0"')
        
        if [ "$BALANCE" -gt 0 ]; then
            echo -e "${GREEN}✅ Wallet has balance: ${BALANCE}uxion${NC}"
        else
            echo -e "${YELLOW}⚠️  Wallet balance is 0 or could not be checked${NC}"
            echo "   Get testnet tokens: https://faucet.burnt.com/"
        fi
    else
        echo -e "${RED}❌ Wallet '$WALLET_NAME' not found${NC}"
        echo "   Create it with: xiond keys add $WALLET_NAME"
    fi
fi

# Check if contract is built
if [ -f "./artifacts/xion_chess.wasm" ]; then
    echo -e "${GREEN}✅ Contract WASM found${NC}"
else
    echo -e "${YELLOW}⚠️  Contract WASM not found${NC}"
    echo "   Build with: docker run --rm -v \"\$(pwd)\":/code ... cosmwasm/optimizer:0.17.0"
    echo "   Or use: ./redeploy.sh"
fi

echo ""
echo -e "${GREEN}🚀 Ready to deploy!${NC}"
echo ""
echo "Commands:"
echo "  ./deploy.sh      - Deploy the contract"
echo "  ./redeploy.sh    - Build, optimize, and deploy in one go"
echo ""