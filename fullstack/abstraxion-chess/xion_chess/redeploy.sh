#!/bin/bash

# Quick Redeploy Script for Testing
# This script rebuilds, optimizes, and redeploys the contract in one go

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🔄 Quick Redeploy: Build -> Optimize -> Deploy${NC}"
echo "=============================================="

# Step 1: Build and optimize
echo -e "${YELLOW}Step 1: Building and optimizing contract...${NC}"
docker run --rm -v "$(pwd)":/code \
  --mount type=volume,source="$(basename "$(pwd)")_cache",target=/target \
  --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
  cosmwasm/optimizer:0.17.0

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to build/optimize contract${NC}"
    exit 1
fi

echo -e "${GREEN}Contract optimized successfully!${NC}"

# Step 2: Deploy
echo -e "${YELLOW}Step 2: Deploying contract...${NC}"
./deploy.sh

echo -e "${GREEN}🎉 Redeploy complete!${NC}"