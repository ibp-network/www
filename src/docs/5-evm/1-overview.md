---
sidebar_position: 1
title: EVM on Asset Hub
description: Solidity on Polkadot via the PolkaVM-backed EVM compatibility layer. ethers v6 and viem, reading and writing.
---

# EVM on Asset Hub

By the end of this page you'll know what Polkadot's EVM compatibility layer is (and isn't), and how to read state and send transactions against it with both **ethers v6** and **viem**.

EVM on Asset Hub is live across **Polkadot**, **Kusama** and **Paseo** (testnet). The contract code you deploy is the same on all three: Paseo for testing, Polkadot for production.

If you have a Solidity codebase and you want to deploy it on Polkadot, this is your page.

## What is EVM-on-Asset-Hub?

Polkadot's EVM compatibility layer ships as a pallet (`pallet-revive`) on Asset Hub, backed by **PolkaVM**: a RISC-V-based virtual machine that Polkadot uses for both native runtime execution and contract execution. Solidity bytecode is recompiled to PolkaVM under the hood; from a developer's perspective, it looks like an EVM.

- **Standard Ethereum JSON-RPC.** `eth_call`, `eth_sendRawTransaction`, `eth_getLogs`, the lot.
- **MetaMask works.** Add the chain by RPC URL and chain ID; users sign with EOAs they already have.
- **Hardhat, Foundry, Remix all work.** Point them at the RPC URL, deploy, done.
- **Same Solidity, same ABIs.** No new language to learn.

What's different under the hood: gas semantics map onto Polkadot's `weight` model, balances are denominated in DOT (10 decimals), and your contract shares chain with the native Asset Hub pallets, so it can in principle interoperate with USDT, NFTs, etc. via dispatchable calls. That cross-VM story is still maturing; for day-one Solidity deployment, ignore it and treat Asset Hub-EVM as a normal EVM chain.

:::warning Two flavours of address on the same chain
Asset Hub has one set of accounts but two ways to address them: **0x… (20-byte EVM)** and **SS58 (32-byte Substrate)**. They are *not* automatically the same. A user signing with MetaMask sees an `0x` address; the same person in Talisman sees `1…` SS58. The `pallet-revive` runtime maps between them by **left-padding the EVM 20-byte address with `0xEE` repeated 12 times** to produce a 32-byte public key, then re-encoding that public key as SS58 (`map_account`).

If you're surfacing balances or sending funds across the two views, do the conversion explicitly; don't assume a user's MetaMask address and Polkadot.js address are the same key. See the Polkadot dev docs' [ETH↔SS58 mapping reference](https://docs.polkadot.com/develop/smart-contracts/for-eth-devs/accounts) for the canonical algorithm.
:::

## Endpoints

| Environment | EVM RPC URL |
| --- | --- |
| **Asset Hub Polkadot** | `https://eth-asset-hub-polkadot.dotters.network` |
| **Asset Hub Kusama**   | `https://eth-asset-hub-kusama.dotters.network`   |
| **Asset Hub Paseo** (testnet) | `https://eth-asset-hub-paseo.dotters.network` |

Read the actual chain ID from `eth_chainId` at runtime rather than hardcoding; wallets and tooling do this automatically when you add the network.

The IBP serves these over standard HTTPS JSON-RPC, same GeoDNS routing as the WSS endpoints, no signup, no keys.

:::info You can also do WSS for the EVM RPC
For event subscriptions (`eth_subscribe`), use `wss://eth-asset-hub-paseo.dotters.network`: same hostname, WSS scheme. Most contract apps only need HTTPS.
:::

## viem (recommended for new projects)

[viem](https://viem.sh) is a TypeScript-first Ethereum client. Smaller bundle than ethers, better types, and the de-facto standard for new wagmi/RainbowKit-based dApps.

### Install

```bash
npm i viem
```

### Read state: block, balance, contract

```ts
import { createPublicClient, http, defineChain } from 'viem';

const ahPaseoEvm = defineChain({
  id: 420420417,
  name: 'Asset Hub Paseo (EVM)',
  nativeCurrency: { name: 'PAS', symbol: 'PAS', decimals: 18 },
  rpcUrls: { default: { http: ['https://eth-asset-hub-paseo.dotters.network'] } },
});

const client = createPublicClient({
  chain: ahPaseoEvm,
  transport: http(),
});

// Block number
const block = await client.getBlockNumber();
console.log('Block:', block);

// Native balance of an EVM-style address
const balance = await client.getBalance({
  address: '0xCa1e02e2a3df56b53C7b73AF94De95edA01D8a9C',
});
console.log('Balance (wei):', balance);
```

Note: native currency on EVM-on-Asset-Hub presents as 18 decimals on the EVM interface even though native DOT is 10 decimals on the Substrate side. The EVM RPC layer normalises to standard ETH conventions so existing tooling works unchanged.

### Read a contract

```ts
import { erc20Abi } from 'viem';

const usdcLike = '0x0000000000000000000000000000000000000abc'; // your deployed contract

const symbol = await client.readContract({
  address: usdcLike,
  abi: erc20Abi,
  functionName: 'symbol',
});
console.log('Symbol:', symbol);
```

### Write: deploy and call

```ts
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// TESTNET ONLY. Use a wallet (window.ethereum) in production.
const account = privateKeyToAccount('0x...your-paseo-test-key...');

const wallet = createWalletClient({
  account,
  chain: ahPaseoEvm,
  transport: http(),
});

const hash = await wallet.writeContract({
  address: usdcLike,
  abi: erc20Abi,
  functionName: 'transfer',
  args: ['0xCa1e02e2a3df56b53C7b73AF94De95edA01D8a9C', 1_000_000n],
});

console.log('Tx hash:', hash);

const receipt = await client.waitForTransactionReceipt({ hash });
console.log('Status:', receipt.status); // 'success' | 'reverted'
```

For browser-side signing, replace `privateKeyToAccount(...)` with `custom(window.ethereum)` and let MetaMask handle it.

## ethers v6 (if you're porting from existing Solidity tooling)

[ethers](https://docs.ethers.org) v6 is the established choice and what most Hardhat/Foundry tutorials still use.

### Install

```bash
npm i ethers
```

### Read state

```ts
import { JsonRpcProvider, formatEther } from 'ethers';

const provider = new JsonRpcProvider('https://eth-asset-hub-paseo.dotters.network');

const network = await provider.getNetwork();
console.log('Chain ID:', network.chainId);

const block = await provider.getBlockNumber();
console.log('Block:', block);

const balance = await provider.getBalance('0xCa1e02e2a3df56b53C7b73AF94De95edA01D8a9C');
console.log('Balance:', formatEther(balance));
```

### Read a contract

```ts
import { Contract } from 'ethers';

const erc20Abi = [
  'function symbol() view returns (string)',
  'function balanceOf(address) view returns (uint256)',
];

const usdcLike = new Contract(
  '0x0000000000000000000000000000000000000abc',
  erc20Abi,
  provider,
);

console.log('Symbol:', await usdcLike.symbol());
console.log('Balance:', await usdcLike.balanceOf('0xCa1e02e2a3df56b53C7b73AF94De95edA01D8a9C'));
```

### Write

```ts
import { Wallet, Contract } from 'ethers';

const wallet = new Wallet('0x...your-paseo-test-key...', provider);

const erc20WriteAbi = [
  'function transfer(address to, uint256 amount) returns (bool)',
];

const token = new Contract(
  '0x0000000000000000000000000000000000000abc',
  erc20WriteAbi,
  wallet,
);

const tx = await token.transfer(
  '0xCa1e02e2a3df56b53C7b73AF94De95edA01D8a9C',
  1_000_000n,
);
console.log('Tx hash:', tx.hash);

const receipt = await tx.wait();
console.log('Status:', receipt?.status); // 1 = success, 0 = revert
```

## Deploying contracts: Hardhat / Foundry

Both work. Hardhat config snippet:

```js
// hardhat.config.js
module.exports = {
  solidity: '0.8.24',
  networks: {
    paseoAssetHub: {
      url: 'https://eth-asset-hub-paseo.dotters.network',
      chainId: 420420417,
      accounts: [process.env.PAS_TEST_KEY],
    },
  },
};
```

```bash
npx hardhat run scripts/deploy.ts --network paseoAssetHub
```

Foundry, same idea, different config:

```bash
forge create src/MyContract.sol:MyContract \
  --rpc-url https://eth-asset-hub-paseo.dotters.network \
  --private-key $PAS_TEST_KEY \
  --legacy
```

The `--legacy` flag forces pre-EIP-1559 transactions if you hit fee-market issues during deployment. Try without it first.

## Interop with Substrate state

A live contract on Asset Hub-EVM can:

- Hold and transfer the chain's native token (DOT/KSM/PAS) by virtue of being an account.
- **Future / in progress:** call into Substrate pallets via precompiles. The pattern (mature on Moonbeam, in development for `pallet-revive`) is `precompile(0x0…)` calling, for example, `pallet-assets` to move USDT. The exact precompile addresses are still being finalised; check the Polkadot Wiki when you need this.

For today, the safe assumption: **EVM contracts on Asset Hub are isolated from the Substrate side** beyond native token transfers. To coordinate with `pallet-assets`, `pallet-nfts`, or XCM, do it from the Substrate side using [PAPI](/build/connect/papi).

## Indexing events

Standard `eth_getLogs` / `eth_subscribe('logs')` work. Every indexer that supports EVM (Subgraph, Ponder, Subsquid) can target Asset Hub-EVM.

```ts
const logs = await client.getLogs({
  address: usdcLike,
  event: {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { type: 'address', indexed: true, name: 'from' },
      { type: 'address', indexed: true, name: 'to' },
      { type: 'uint256', indexed: false, name: 'value' },
    ],
  },
  fromBlock: 'earliest',
  toBlock: 'latest',
});
```

For deep historical scans, query a hosted indexer (Subsquid is widely used in the Polkadot ecosystem) rather than spamming `eth_getLogs` directly.

## Wallets

MetaMask, Rabby, Frame, and any standard EIP-1193 wallet can connect to the EVM RPC. Have users add the chain manually (or call `wallet_addEthereumChain` programmatically):

```ts
await window.ethereum.request({
  method: 'wallet_addEthereumChain',
  params: [{
    chainId: '0x190f1b41', // 420420417
    chainName: 'Asset Hub Paseo (EVM)',
    nativeCurrency: { name: 'PAS', symbol: 'PAS', decimals: 18 },
    rpcUrls: ['https://eth-asset-hub-paseo.dotters.network'],
    blockExplorerUrls: [], // explorer URL once live
  }],
});
```

For a Polkadot-native UX, see [Wallet connection](/build/recipes/wallet-connect). Wallets like Talisman cover both Substrate accounts and EVM accounts in one extension.

## Common errors

:::warning
**`execution reverted`** without a reason string
Standard Solidity revert. Use `cast call --trace` (Foundry) or Tenderly-style tracing if your indexer supports it. The Asset Hub-EVM RPC supports `debug_traceTransaction` on the testnet endpoint.

**`gas required exceeds allowance`**
Your transaction is hitting the block weight limit. Reduce loop iterations, or break the call into multiple transactions.

**`chain ID mismatch`**
You're sending a transaction signed for a different chain ID. viem / ethers should pick this up automatically from the connected provider; check you didn't hardcode `chainId: 1` somewhere.

**`unsupported transaction type`**
PolkaVM-EVM may not yet support every EIP-2930 / EIP-1559 access list feature. Use `--legacy` on Foundry; with viem set `transaction.type = 'legacy'`.
:::

## Common questions

### Does MetaMask work with Asset Hub?

Yes. Add a custom network with the chain ID, RPC URL, and native currency from the [Chain identifiers](#chain-identifiers) section above. The `wallet_addEthereumChain` snippet in [Wallets](#wallets) prompts MetaMask to register the network in one click. For a smoother UX that handles both Substrate and EVM accounts in one extension, **Talisman** is the recommended wallet.

### Are gas fees paid in DOT or ETH?

In the chain's **native token**: DOT on Polkadot Asset Hub, KSM on Kusama Asset Hub, PAS on Paseo Asset Hub. There's no ETH on these networks. The token uses 18 decimals (matching ETH's precision) so EVM tooling that hardcodes `decimals: 18` works without modification.

### Is it really Solidity-compatible?

Yes. You write standard Solidity and use Hardhat / Foundry / Remix normally. Under the hood the runtime is **PolkaVM** (a RISC-V-based VM, Polkadot's successor to Wasm). Asset Hub's `pallet-revive` compiles your Solidity bytecode into PolkaVM at deploy time. Almost all contracts port directly; the edge cases are noted in [Common errors](#common-errors) (some newer EIPs aren't yet supported, so use `--legacy` transactions if you hit them).

### How is this different from Moonbeam or Astar?

Moonbeam and Astar are **independent parachains** with EVM as their primary runtime. Asset Hub EVM lives on the **Polkadot/Kusama system chain itself**, with no parachain auction, no separate token economy, and your EVM accounts share the same chain state as Polkadot's native assets, NFTs, and pallets. For a new dApp targeting "Polkadot, broadly", Asset Hub EVM is the canonical choice. For projects already deployed on Moonbeam/Astar, those chains continue running and have their own established tooling.

### Where do I get testnet tokens?

[faucet.polkadot.io](https://faucet.polkadot.io/) issues PAS for the Paseo Asset Hub EVM testnet. Same EVM accounts work; paste your `0x…` address.

## Next

- **[Asset Hub overview](/build/asset-hub/overview)**: the Substrate side of the same chain.
- **[Smoldot light client](/build/light-client/smoldot)**: for the non-EVM half of your app.
- **[Wallet connection](/build/recipes/wallet-connect)**: wallets that span Substrate + EVM.
- **Polkadot Wiki, Smart Contracts:** https://wiki.polkadot.network/learn/learn-smart-contracts/
- **pallet-revive source:** https://github.com/paritytech/polkadot-sdk
