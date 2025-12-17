EChain-ID — 2-Hour PoC (Hardhat + Ganache + MetaMask + React + IPFS via Pinata)

This package contains a minimal end-to-end proof-of-concept for EChain-ID:
- Solidity contract (contracts/EChainID.sol)
- Hardhat config and deploy script (scripts/deploy.js)
- React frontend (frontend/) that connects to MetaMask and uses ethers.js
- IPFS pinning via Pinata (frontend uploads JSON with Pinata JWT)

Quick start (recommended):
1. Start Ganache on http://127.0.0.1:8545 (chainId 1337). Copy a private key from one of the funded accounts.
2. In project root, create a `.env` file with:
   PRIVATE_KEY="<your ganache private key>"
3. Install & deploy contract:
   npm install
   npx hardhat compile
   npx hardhat run --network ganache scripts/deploy.js
   (after deploy note the contract address printed)
4. Frontend:
   cd frontend
   cp .env.example .env
   edit frontend/.env to set REACT_APP_CONTRACT_ADDRESS to the deployed address and REACT_APP_PINATA_JWT for IPFS pinning.
   npm install
   npm start
5. In MetaMask add custom RPC http://127.0.0.1:8545 (chainId 1337) and import an account from Ganache.
6. Use the frontend to issue, verify, and revoke credentials.

Notes:
- This is a fast PoC on Ethereum-like chain (Ganache). For full Hyperledger Fabric production, migrate chaincode and storage accordingly.
- The ABI file frontend/src/contract/abi.json is included but will update automatically after `npx hardhat compile` if you want to copy artifacts.

