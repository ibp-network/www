---
sidebar_position: 1
title: Quickstart
description: A typed Polkadot client in five minutes.
---

# Quickstart

A working Polkadot client in five minutes. You'll read an account balance from **Asset Hub Polkadot** (where user-facing state lives) and stream new blocks. No accounts, no API keys, no relay-chain detour.

:::tip Which chain do I connect to?
You almost certainly want **Asset Hub Polkadot**, not the relay. Balances, native assets, NFTs, USDT, USDC, and EVM contracts all live on Asset Hub. The relay chain is for validators and cross-chain consensus.

```
wss://asset-hub-polkadot.dotters.network
```

Full chain list with WSS / HTTPS / EVM endpoints + bootnodes for every supported network is on the [endpoints page](/endpoints).
:::

## What you get for free

You're connecting through the **Infrastructure Builders' Programme**: a federation of independent operators serving public RPC endpoints with GeoDNS routing.

- **No keys.** No signup. No quota dashboards.
- **No rate limits** at the protocol layer. Don't be reckless, but you don't have to think about credits.
- **GeoDNS-routed.** Your request lands at the nearest operator. From Bangkok you hit Rotko; from Zurich, Amforc; from Ashburn, Stake Plus. No `network: 'global'` config to think about.
- **Trustless option.** If you don't want to trust *us*, run a smoldot light client and verify state yourself. See [Light clients](/build/light-client/smoldot).

## Pick a library

If you've never touched Polkadot tooling before, the short answer is:

| You want… | Use |
| --- | --- |
| Type-safe TS, light-client-friendly | **PAPI** (polkadot-api) |
| React hooks over PAPI | **reactive-dot** |
| Smallest bundle, tree-shakable types | **Dedot** |
| Native Rust | **subxt** |
| Solidity / Hardhat / Foundry workflow | **ethers.js** or **viem** (see [EVM](/build/evm/overview)) |

All five work on Asset Hub. The rest of this page uses **PAPI**; that's where new dApps should start in 2026.

## 1. Install

```bash
npm i polkadot-api
```

PAPI needs descriptors for every chain you talk to: typed pallet definitions, generated from the on-chain metadata.

```bash
npx papi add ahp -n polkadot_asset_hub
npx papi
```

The first command registers Asset Hub Polkadot under the name `ahp`. The second generates types from the live chain metadata. Re-run `npx papi` after a runtime upgrade, or pin it in CI.

:::info Why descriptors?
PAPI is typed end-to-end. `api.query.Balances.Account.getValue(addr)` knows the return shape because it was generated from the runtime metadata. No `any`, no runtime type registry lookups.
:::

## 2. Read a balance

```ts
import { createWsClient } from 'polkadot-api/ws';
import { ahp } from '@polkadot-api/descriptors';

const client = createWsClient('wss://asset-hub-polkadot.dotters.network');

const api = client.getTypedApi(ahp);

const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const account = await api.query.System.Account.getValue(address);

console.log('Free balance:', account.data.free);
console.log('Reserved:    ', account.data.reserved);
console.log('Nonce:       ', account.nonce);

client.destroy();
```

Run it with `node --experimental-strip-types script.ts`, or with `tsx`, `bun`, or `deno`.

:::tip Use the same address everywhere
SS58 addresses are just `(network-prefix, public-key, checksum)` re-encoded. Same key, different prefix means a different-looking string.

| Network | SS58 prefix | Address starts with |
| --- | --- | --- |
| Polkadot (and Asset Hub Polkadot) | `0` | `1…` |
| Kusama (and Asset Hub Kusama) | `2` | `C…`, `D…`, `E…`, `F…`, `G…`, `H…`, `J…` |
| Paseo (testnet, mirrors Polkadot) | `0` | `1…` |
| Generic Substrate / dev | `42` | `5…` (e.g. `5Grwv…`) |

All four resolve to the same on-chain account; the chain stores only the raw 32-byte public key. If your inputs are mixed, re-encode with `ss58Encode(publicKey, 0)` for Polkadot/Paseo, or keep the raw `publicKey` (`Uint8Array`) internally and render an SS58 string at display time.
:::

## 3. Stream new blocks

```ts
import { createWsClient } from 'polkadot-api/ws';

const client = createWsClient('wss://asset-hub-polkadot.dotters.network');

// Finalized blocks: the truth.
const sub = client.finalizedBlock$.subscribe((block) => {
  console.log('Finalized', block.number, block.hash.slice(0, 10));
});

// Stop after 30s.
setTimeout(() => {
  sub.unsubscribe();
  client.destroy();
}, 30_000);
```

`finalizedBlock$` is a [SolidJS-flavoured Observable](https://github.com/polkadot-api/polkadot-api/blob/main/docs/pages/client.md). For the latest *best* (unfinalized) block, use `client.bestBlock$`. For dApps you almost always want finalized; unfinalized blocks can be re-orged away.

## 4. Submit a transfer (testnet)

The snippet below uses **Asset Hub Paseo** (testnet) and the well-known dev key Alice. Get free PAS from the [Paseo faucet](https://faucet.polkadot.io/). For mainnet, swap the signer for a real wallet. See [Wallet connection](/build/recipes/wallet-connect).

```ts
import { createWsClient } from 'polkadot-api/ws';
import { getPolkadotSigner } from 'polkadot-api/signer';
import { sr25519CreateDerive } from '@polkadot-labs/hdkd';
import { DEV_PHRASE, entropyToMiniSecret, mnemonicToEntropy } from '@polkadot-labs/hdkd-helpers';
import { ahPaseo, MultiAddress } from '@polkadot-api/descriptors';

const miniSecret = entropyToMiniSecret(mnemonicToEntropy(DEV_PHRASE));
const alice = sr25519CreateDerive(miniSecret)('//Alice');
const signer = getPolkadotSigner(alice.publicKey, 'Sr25519', alice.sign);

const client = createWsClient('wss://asset-hub-paseo.dotters.network');
const api = client.getTypedApi(ahPaseo);

const tx = api.tx.Balances.transfer_keep_alive({
  dest: MultiAddress.Id('5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty'),
  value: 1_000_000_000n, // 0.1 PAS
});

const result = await tx.signAndSubmit(signer);
console.log('Tx hash:', result.txHash);
```

## 5. Where to go next

You have a typed client, you can read state, you can submit transactions. The rest is dApp logic.

- **[Connecting to chains](/build/connect/papi)**: same flow for reactive-dot, Dedot and subxt.
- **[Building on Asset Hub](/build/asset-hub/overview)**: assets, NFTs, multisigs, proxies.
- **[Light clients](/build/light-client/smoldot)**: drop the WSS dependency, embed the chain.
- **[EVM on Asset Hub](/build/evm/overview)**: Solidity instead of pallets.
- **[Recipes](/build/recipes/wallet-connect)**: wallets, fees, indexers, copy-paste.

## Common questions

### Do I need an API key?

No. IBP endpoints are unauthenticated public RPC. There's no signup, no account dashboard, no quota credits to top up. Paste the URL into your wallet, dApp, or indexer and it works.

### Are there rate limits?

Not at the protocol layer. We don't enforce per-key quotas because there are no keys. Individual operators may apply abuse-prevention limits at the edge for traffic that looks like flooding, but normal dApp workloads (interactive UIs, indexers, agents) don't run into them. If you're planning sustained high-throughput traffic, get in touch on Matrix and we'll route you appropriately.

### Asset Hub or the relay chain: which do I connect to?

**Asset Hub** for anything user-facing: balances, transfers, native assets, NFTs, stablecoins (USDT, USDC), EVM contracts. The **relay chain** is for validators and cross-chain consensus only. User state doesn't live there.

| Use case | Endpoint |
| --- | --- |
| dApp, wallet, indexer | `wss://asset-hub-polkadot.dotters.network` |
| Validator | `wss://polkadot.dotters.network` |

If a guide tells a new builder to connect to `wss://polkadot.dotters.network`, it's likely an older guide written before Asset Hub became the consumer chain.

### Is smoldot a replacement for IBP?

No, they're complementary. A typical production dApp uses **both**: IBP's public RPC for a fast cold-start (one round-trip and the page renders), then hands off to an in-browser smoldot light client for verified reads (no operator in the trust path). IBP hosts the bootnodes that smoldot uses to find peers, so we run the infrastructure for both halves of that hybrid. See [Light clients](/build/light-client/smoldot).
