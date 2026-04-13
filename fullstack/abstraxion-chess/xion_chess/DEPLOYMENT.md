# Xion Chess Contract Deployment Guide

## Quick Start

1. **Set up environment**:
   ```bash
   ./setup-env.sh
   ```

2. **Deploy contract**:
   ```bash
   ./deploy.sh
   ```

3. **For development iterations**:
   ```bash
   ./redeploy.sh  # Builds, optimizes, and deploys in one command
   ```

## Prerequisites

### 1. Install xiond
Follow the installation guide: https://docs.burnt.com/xion/developers/getting-started/installation

### 2. Set up wallet
```bash
# Create new wallet
xiond keys add my-wallet

# Or import existing
xiond keys add my-wallet --recover

# Set environment variable
export WALLET_NAME=my-wallet

# Add to shell profile
echo 'export WALLET_NAME=my-wallet' >> ~/.zshrc  # or ~/.bashrc
```

### 3. Get testnet tokens
Visit: https://faucet.burnt.com/

## Manual Deployment Commands

If you prefer to run commands manually:

### 1. Build and optimize
```bash
docker run --rm -v "$(pwd)":/code \
  --mount type=volume,source="$(basename "$(pwd)")_cache",target=/target \
  --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
  cosmwasm/optimizer:0.17.0
```

### 2. Upload contract
```bash
xiond tx wasm store ./artifacts/xion_chess.wasm \
  --chain-id xion-testnet-2 \
  --gas-adjustment 1.3 \
  --gas-prices 0.001uxion \
  --gas auto \
  -y --output json \
  --node https://rpc.xion-testnet-2.burnt.com:443 \
  --from $WALLET_NAME
```

### 3. Instantiate contract
```bash
# Replace CODE_ID with the ID from upload step
xiond tx wasm instantiate CODE_ID '{}' \
  --from $WALLET_NAME \
  --label "Xion Chess Game Contract" \
  --gas-prices 0.001uxion \
  --gas auto \
  --gas-adjustment 1.3 \
  -y --no-admin \
  --chain-id xion-testnet-2 \
  --node https://rpc.xion-testnet-2.burnt.com:443
```

## Contract Functions

### Execute Messages

1. **Create Game**:
   ```json
   {
     "create_game": {
       "game_id": "unique-game-id",
       "opponent": "xion1...",
       "time_control": "1d"
     }
   }
   ```

2. **Make Move**:
   ```json
   {
     "make_move": {
       "game_id": "game-id",
       "from": "e2",
       "to": "e4",
       "promotion": null
     }
   }
   ```

3. **Update Game Status**:
   ```json
   {
     "update_game_status": {
       "game_id": "game-id",
       "status": "resigned"
     }
   }
   ```

### Query Messages

1. **Get Game**:
   ```json
   {"get_game": {"game_id": "game-id"}}
   ```

2. **Get Player Games**:
   ```json
   {"get_player_games": {"player": "xion1..."}}
   ```

3. **Get All Game IDs**:
   ```json
   {"get_all_game_ids": {}}
   ```

## Files Created After Deployment

- `code_id.txt` - Contains the uploaded contract code ID
- `contract_address.txt` - Contains the instantiated contract address
- `../frontend/.env.local` - Updated with new contract address

## Troubleshooting

### Common Issues

1. **"xiond not found"**: Install the Xion CLI first
2. **"insufficient fees"**: Increase gas prices or get more testnet tokens
3. **"account does not exist"**: Make sure your wallet has tokens from the faucet
4. **"contract not found"**: Check that CODE_ID is correct from upload step

### Getting Help

- Xion Documentation: https://docs.burnt.com/xion/developers/
- Discord: https://discord.gg/burnt
- Telegram: https://t.me/burnt_xion

## Development Workflow

For active development:

1. Make changes to contract code
2. Run `./redeploy.sh`
3. Test with new contract address
4. Repeat

The scripts automatically update your frontend environment variables!