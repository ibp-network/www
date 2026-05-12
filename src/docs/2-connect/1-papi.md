---
sidebar_position: 1
title: PAPI (polkadot-api)
description: Connect to an IBP endpoint with PAPI. Install, generate descriptors, read a balance.
---

# PAPI (polkadot-api)

By the end of this page you'll have PAPI installed against an IBP endpoint, descriptors generated for Asset Hub, and a snippet that reads an account balance. Everything beyond the first call lives in the upstream docs.

## 1. Install

```bash
npm i polkadot-api
```

## 2. Generate descriptors

```bash
npx papi add ahp -n polkadot_asset_hub
npx papi
```

`ahp` is the import name; `-n` picks the well-known chain from PAPI's registry. Re-run `npx papi` after any runtime upgrade or when you add a new chain. Commit `.papi/polkadot-api.json` (the source of truth); the generated `node_modules/@polkadot-api/descriptors` package is regenerated on `npm install`.

## 3. Connect and read a balance

```ts
import { createWsClient } from 'polkadot-api/ws';
import { ahp } from '@polkadot-api/descriptors';

const client = createWsClient('wss://asset-hub-polkadot.dotters.network');
const api = client.getTypedApi(ahp);

const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const account = await api.query.System.Account.getValue(address);

console.log({
  free: account.data.free,         // bigint, 10 decimals on DOT
  reserved: account.data.reserved, // bigint
  nonce: account.nonce,            // number
});
```

`createWsClient` works the same in browsers, Node 22+, Deno and Bun. `getValue` reads at the latest finalized block; pass `{ at: 'best' }` for an unfinalized read.

## 4. Stream finalized blocks

```ts
const sub = client.finalizedBlock$.subscribe((block) => {
  console.log('Finalized', block.number, block.hash.slice(0, 10));
});

// Clean up when done
setTimeout(() => sub.unsubscribe(), 30_000);
```

`finalizedBlock$` is an Observable. For a specific storage entry, prefer `api.query.X.Y.watchValue(...)`; it re-queries on every finalized block and de-duplicates.

:::info When to use PAPI
- Framework-agnostic TS/JS code (Node, browsers, Deno, Bun).
- You want end-to-end types generated from on-chain metadata.
- You may need an in-browser light client (smoldot) later.
- Building in React? Use [reactive-dot](/build/connect/reactive-dot) instead. It's PAPI under the hood.
:::

:::warning Use Paseo for any testing
The dev key (Alice) is public. Run mutating snippets against `wss://asset-hub-paseo.dotters.network` with funds from the [Paseo faucet](https://faucet.polkadot.io/).
:::

## Common errors

:::warning
**`MetadataMismatch`.** The chain upgraded since you generated descriptors. Run `npx papi` to refresh.

**`Error: WebSocket is not defined`** (Node). Node 21 and below don't ship a global `WebSocket`. Upgrade to Node 22+, or polyfill before importing `polkadot-api/ws`.
:::

## Deeper reference

Full PAPI documentation, signer extensions, custom JSON-RPC providers, the v1 → v2 migration guide, and chain-spec catalogue all live at [papi.how](https://papi.how).

## Next

- **[reactive-dot](/build/connect/reactive-dot)**: React hooks over PAPI.
- **[Asset Hub overview](/build/asset-hub/overview)**: what to query.
- **[Endpoints](/endpoints)**: every chain we serve, copyable URLs.
- **[Wallet connection](/build/recipes/wallet-connect)**: replace the dev key with a real signer.
- **[Web explorers](/build/recipes/explorers)**: verify extrinsics from a browser.
