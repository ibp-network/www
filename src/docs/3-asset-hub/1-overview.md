---
sidebar_position: 1
title: Asset Hub overview
description: The consumer chain for the Polkadot ecosystem. What lives here, why, and how to interact with it.
---

# Asset Hub overview

If you're building a Polkadot dApp in 2026, **Asset Hub** is your chain. Not the relay. Not a specialised parachain (unless you have a specialised need). Asset Hub.

:::info "Polkadot Hub" = Asset Hub
Polkadot's developer marketing recently rebranded Asset Hub as **"Polkadot Hub"**. Same chain, same chain ID, same WSS endpoint; only the user-facing name changed. We keep saying "Asset Hub" because that's still the technical chain identifier (`polkadot_asset_hub`, `asset-hub-polkadot.dotters.network`). If you arrived here searching for "Polkadot Hub", you're in the right place.
:::

This page explains why, and gives canonical patterns for the things you'll do: read balances, look up assets, mint NFTs, work with the EVM bridge.

## What is Asset Hub?

Asset Hub is a **system parachain**: a chain that ships with Polkadot itself, secured by the relay-chain validators, and reserved for ecosystem-critical state. It's where user-facing economic activity happens.

- **Native balances** (DOT, KSM): yes, even DOT itself. The relay-chain DOT account is being deprecated as the user-facing balance store; the canonical balance lives on Asset Hub.
- **Native assets**: USDT, USDC, and every other fungible asset on Polkadot, all under one pallet (`pallet-assets`).
- **NFTs**: under `pallet-nfts` (the v2 NFTs pallet, not the legacy `pallet-uniques`).
- **EVM contracts**: via Polkadot's EVM compatibility layer (PolkaVM / "PVM"). Solidity, Hardhat, Foundry all work. See [EVM](/build/evm/overview).
- **Multisigs, proxies, identity stubs**: the standard FRAME utility pallets.

:::info Why not the relay chain?
The relay chain's job is consensus and validator coordination. Putting user state there means every validator validates every user transaction, which is expensive and doesn't scale. Asset Hub runs on a dedicated set of collators and inherits security from the relay, which is how Polkadot's design always intended.

In practice: **if you connect a dApp to `wss://polkadot.dotters.network`, you've made a mistake.** Use `wss://asset-hub-polkadot.dotters.network` instead.
:::

## Chain identifiers

**Substrate WSS** for PAPI, Dedot, reactive-dot, subxt and Polkadot wallets:

| Environment | WSS endpoint | Chain ID (PAPI descriptor) |
| --- | --- | --- |
| **Polkadot** (mainnet) | `wss://asset-hub-polkadot.dotters.network` | `polkadot_asset_hub` |
| **Kusama** (canary) | `wss://asset-hub-kusama.dotters.network` | `kusama_asset_hub` |
| **Paseo** (testnet) | `wss://asset-hub-paseo.dotters.network` | `paseo_asset_hub` |

**EVM JSON-RPC** for ethers, viem, Hardhat, Foundry, MetaMask:

| Environment | EVM endpoint |
| --- | --- |
| **Polkadot** (mainnet) | `https://eth-asset-hub-polkadot.dotters.network` |
| **Kusama** (canary)   | `https://eth-asset-hub-kusama.dotters.network` |
| **Paseo** (testnet)   | `https://eth-asset-hub-paseo.dotters.network` |

EVM endpoints accept WSS too (`wss://eth-asset-hub-*.dotters.network`) when you need `eth_subscribe`. See [EVM on Asset Hub](/build/evm/overview).

You also have the routed pool variant: same operators, different DNS strategy.

```
wss://sys.ibp.network/asset-hub-polkadot
```

Both routes are public, both are GeoDNS-routed across the seven IBP operators. We recommend the subdomain form: shorter, and standard for WSS.

## Account balances

The bedrock query. Every dApp does this within the first 60 seconds.

```ts
import { createWsClient } from 'polkadot-api/ws';
import { ahp } from '@polkadot-api/descriptors';

const client = createWsClient('wss://asset-hub-polkadot.dotters.network');
const api = client.getTypedApi(ahp);

const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const { data, nonce } = await api.query.System.Account.getValue(address);

console.log({
  free:     data.free,      // bigint, in Planck (10 decimals on Polkadot)
  reserved: data.reserved,  // locked for deposits etc.
  frozen:   data.frozen,    // locked by staking, vesting, etc.
  nonce,                    // increment on every signed extrinsic
});
```

:::tip "Free" doesn't mean spendable
A user with `free = 10 DOT` and `frozen = 9 DOT` has only 1 DOT of *spendable* balance. The spendable amount is `free - max(frozen - reserved, ED)` where ED is the existential deposit (≈ 0.01 DOT on Asset Hub Polkadot; read `constants.Balances.ExistentialDeposit` at runtime to be exact, since it can shift via runtime upgrade).

For "what can the user send right now," compute this yourself. Don't show `free` as the spendable balance; users will hit a `InsufficientBalance` error.
:::

### Subscribing to balance changes

```ts
client.finalizedBlock$.subscribe(async () => {
  const { data } = await api.query.System.Account.getValue(address);
  updateUi(data.free);
});
```

For React/Vue/Solid components, prefer `api.query.System.Account.watchValue(address)`:

```ts
const sub = api.query.System.Account
  .watchValue(address)
  .subscribe((info) => updateUi(info.data.free));

// Cleanup
sub.unsubscribe();
```

## Native assets (USDT, USDC, etc.)

USDT and USDC on Polkadot live as **assets** under `pallet-assets`, not as separate currencies. Each asset has a numeric `AssetId`.

| Asset | AssetId on Asset Hub Polkadot |
| --- | --- |
| USDT | `1984` |
| USDC | `1337` |
| DED  | `30` |
| (others) | check on-chain via `api.query.Assets.Metadata` |

### Reading an asset balance

```ts
const usdt = 1984;
const account = await api.query.Assets.Account.getValue(usdt, address);

if (account === undefined) {
  console.log('No USDT on this account.');
} else {
  console.log('USDT balance:', account.balance); // bigint, 6 decimals
}
```

### Listing all assets a user holds

```ts
// Returns an iterator over [assetId, account] entries.
const entries = await api.query.Assets.Account.getEntries(address);

for (const { keyArgs: [assetId, _addr], value: account } of entries) {
  const meta = await api.query.Assets.Metadata.getValue(assetId);
  console.log(
    new TextDecoder().decode(meta.symbol),
    '=',
    account.balance,
  );
}
```

:::info Decimals are per-asset
USDT is 6 decimals. DOT is 10 decimals. Some custom assets are 0 decimals (NFT-style fungibles). Always read `api.query.Assets.Metadata.getValue(assetId).decimals` before formatting.
:::

### Transferring an asset

```ts
const tx = api.tx.Assets.transfer_keep_alive({
  id: 1984n,                                  // USDT
  target: MultiAddress.Id(recipient),
  amount: 1_000_000n,                         // 1 USDT (6 decimals)
});

const result = await tx.signAndSubmit(signer);
```

`transfer_keep_alive` errors if it would reduce the sender below the existential deposit. Use plain `transfer` only if you're intentionally closing the account.

## NFTs

Asset Hub uses `pallet-nfts` (also called "NFTs v2"). The legacy `pallet-uniques` is deprecated.

### Reading an NFT collection

```ts
const collectionId = 42;

const collection = await api.query.Nfts.Collection.getValue(collectionId);
console.log({
  owner: collection?.owner,
  items: collection?.items,           // count
  itemMetadatas: collection?.item_metadatas,
});

// All items in the collection
const items = await api.query.Nfts.Item.getEntries(collectionId);
for (const { keyArgs: [_col, itemId], value: item } of items) {
  console.log('Item', itemId, 'owned by', item.owner);
}
```

### Minting an NFT

```ts
// 1. Create a collection (one-time)
const createTx = api.tx.Nfts.create({
  admin: MultiAddress.Id(myAddress),
  config: {
    settings: 0n,                     // bitflags: 0 = all features enabled
    max_supply: undefined,
    mint_settings: {
      mint_type: { type: 'Issuer', value: undefined },
      price: undefined,
      start_block: undefined,
      end_block: undefined,
      default_item_settings: 0n,
    },
  },
});

// 2. Mint an item
const mintTx = api.tx.Nfts.mint({
  collection: collectionId,
  item: 1,
  mint_to: MultiAddress.Id(recipient),
  witness_data: undefined,
});
```

For setting metadata (the off-chain IPFS pointer), use `api.tx.Nfts.set_metadata`.

## EVM (PolkaVM)

Asset Hub on Paseo (and soon Polkadot) ships an EVM compatibility layer using **PolkaVM** (a RISC-V based VM, branded "PVM"). Solidity bytecode is recompiled to PolkaVM; for the developer it's transparent. Hardhat and Foundry work.

```ts
import { JsonRpcProvider } from 'ethers';

const provider = new JsonRpcProvider(
  'https://eth-asset-hub-paseo.dotters.network',
);

console.log('Chain ID:', await provider.getNetwork().then((n) => n.chainId));
console.log('Block:   ', await provider.getBlockNumber());
```

Full Solidity workflow (deployment, ABIs, event indexing) is documented in [EVM on Asset Hub](/build/evm/overview).

:::warning EVM on Polkadot Asset Hub is still rolling out
At the time of writing, EVM/PVM is stable on **Paseo Asset Hub** and rolling out on **Kusama Asset Hub**. Polkadot mainnet enablement follows. Develop on Paseo today; ship to Polkadot once it's enabled. The contract code is the same.
:::

## XCM: talking to other chains

Asset Hub is the hub for cross-chain transfers. To send USDT to another parachain (Hydration, Bifrost, Moonbeam…) you build an XCM message. PAPI emits XCM types as tagged-union enums per version, so you reach for them via the `{ type: 'Vn', value: … }` shape, with no separate `XcmV3MultiLocation` constructor symbol:

```ts
import { Binary } from 'polkadot-api';

const dest = {
  type: 'V3' as const,
  value: {
    parents: 1,
    interior: {
      type: 'X1' as const,
      value: { type: 'Parachain' as const, value: 2034 }, // Hydration
    },
  },
};

const beneficiary = {
  type: 'V3' as const,
  value: {
    parents: 0,
    interior: {
      type: 'X1' as const,
      value: {
        type: 'AccountId32' as const,
        value: {
          network: undefined,
          id: Binary.fromHex('0x…recipient public key…'),
        },
      },
    },
  },
};

const tx = api.tx.PolkadotXcm.limited_reserve_transfer_assets({
  dest,
  beneficiary,
  assets: { type: 'V3', value: [/* asset multilocation + amount */] },
  fee_asset_item: 0,
  weight_limit: { type: 'Unlimited', value: undefined },
});
```

XCM has a deserved reputation for being awkward. For most apps you'll want a higher-level helper. Search the Polkadot ecosystem for an XCM SDK that matches your chain pair rather than hand-rolling `PolkadotXcm` calls.

## What's NOT on Asset Hub

These live elsewhere.

- **Staking** (nominating, validating): relay chain (`wss://polkadot.dotters.network`).
- **Governance** (OpenGov referenda): relay chain.
- **Bridges to Ethereum / Kusama**: Bridge Hub (`wss://bridge-hub-polkadot.dotters.network`).
- **Identity**: People Chain (Kusama / Paseo today, Polkadot soon).
- **Coretime sales**: Coretime Chain.

For a dApp targeting "regular users sending tokens and using contracts," none of this matters. Connect to Asset Hub and you're done.

## Next

- **[Connecting with PAPI](/build/connect/papi)**: reference for the queries above.
- **[Endpoints](/endpoints)**: every chain we serve, copyable URLs + bootnodes.
- **[Light clients](/build/light-client/smoldot)**: drop the WSS dependency.
- **[EVM on Asset Hub](/build/evm/overview)**: Solidity workflow.
- **[Recipes → Wallets](/build/recipes/wallet-connect)**: connect Talisman, SubWallet, Nova.
