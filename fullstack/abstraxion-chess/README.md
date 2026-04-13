# Xion Chess dApp

A fully on-chain chess game built on the Xion blockchain using CosmWasm smart contracts and React/Next.js frontend.

## Features

- Full chess implementation with move validation
- ELO rating system with automatic updates
- Time controls (~2 days per game)
- Draw offers and resignation
- Real-time gameplay with optimistic UI

## Quick Start

### Prerequisites
- Node.js (v18+)
- Docker
- [Xion CLI](https://docs.burnt.com/xion/developers/getting-started/installation)
- Setup of your own Treasury/faucet for feegrants of users, you can use: https://quickstart.dev.testnet.burnt.com/

### Setup
```bash
# Clone repository
git clone <repository-url>
cd chess-dapp

# Deploy smart contract
cd xion_chess
./setup-env.sh
./deploy.sh

# Start frontend
cd ../frontend
npm install
npm run dev
```

Visit `http://localhost:3000` and get testnet tokens from [Xion Faucet](https://faucet.burnt.com/).

## Architecture

- **Smart Contract**: Rust/CosmWasm with unified game state and user profiles
- **Frontend**: Next.js 14 with TypeScript and chess.js
- **Blockchain**: Xion testnet with account abstraction via Abstraxion

## Development

```bash
# Contract development
cd xion_chess
cargo test
./redeploy.sh

# Frontend development
cd frontend
npm run lint
npm run build
```

## Project Structure

```
chess-dapp/
├── xion_chess/     # CosmWasm smart contract
└── abstraxion_ui/       # Next.js application
```

## Key Features

- **On-chain validation**: All moves validated by smart contract
- **Atomic ELO updates**: Ratings updated with game results
- **Error recovery**: UI rollback on failed transactions

## Links

- [Xion Blockchain](https://burnt.com)
- [CosmWasm](https://cosmwasm.com)
