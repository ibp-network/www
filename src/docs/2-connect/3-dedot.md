---
sidebar_position: 3
title: Dedot
description: Connect to an IBP endpoint with Dedot. Polkadot.js-shaped API with type-safe extrinsics.
---

# Dedot

By the end of this page you'll have Dedot installed against an IBP Asset Hub endpoint, types generated, and a snippet reading an account balance.

## 1. Install

```bash
npm i dedot
npm i -D @dedot/chaintypes
```

`@dedot/chaintypes` ships pre-generated metadata bindings for every active Polkadot/Kusama chain, so there's no codegen step in your project.

## 2. Connect and read a balance

```ts
import { DedotClient, WsProvider } from 'dedot';
import type { PolkadotAssetHubApi } from '@dedot/chaintypes';

const client = await DedotClient.new<PolkadotAssetHubApi>(
  new WsProvider('wss://asset-hub-polkadot.dotters.network'),
);

const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const account = await client.query.system.account(address);

console.log({
  free: account.data.free,         // bigint
  reserved: account.data.reserved,
  nonce: account.nonce,            // number
});
```

If you're targeting a different chain, swap the type: `PolkadotApi` for the relay, `KusamaAssetHubApi`, `PaseoApi`, etc. The chaintypes package re-publishes on every metadata update upstream, so a fresh `npm i @dedot/chaintypes` is the equivalent of regenerating types.

Note the lowercase `client.query.system.account`: Dedot follows JS naming conventions (lowercase pallets, camelCase storage), unlike PAPI which preserves Rust capitalisation.

## 3. Subscribe to balance changes

```ts
const unsub = await client.query.system.account(address, (account) => {
  console.log('Balance now:', account.data.free);
});

// later
await unsub();
await client.disconnect();
```

Pass a callback as the last argument; the returned `unsub` ends the subscription.

:::info When to use Dedot
- You're porting from `@polkadot/api` and want a mechanical, rename-pass migration.
- Bundle size matters out-of-the-box (Dedot's base client is leaner than PAPI's by default).
- You don't need smoldot today.
- Greenfield projects without Polkadot.js muscle memory should default to [PAPI](/build/connect/papi): more momentum, more tutorials, mature smoldot path.
:::

:::warning Mutating snippets on testnet only
Dev keys are public. For signed extrinsics, point at `wss://asset-hub-paseo.dotters.network` with funds from the [Paseo faucet](https://faucet.polkadot.io/). For real wallet flows Dedot accepts the same `InjectedSigner` shape PAPI does. See [Wallet connection](/build/recipes/wallet-connect).
:::

## Common errors

:::note
**Stale types after a chain upgrade.** Run `npm update @dedot/chaintypes` to pull the latest bindings.

**`WebSocket disconnected before subscription completed`.** Call `await unsub()` and `await client.disconnect()` before process exit.
:::

## Deeper reference

Full reference (extrinsics, events, runtime APIs, smoldot integration) lives at [docs.dedot.dev](https://docs.dedot.dev). Source at [github.com/dedotdev/dedot](https://github.com/dedotdev/dedot).

## Next

- **[PAPI](/build/connect/papi)**: the default path.
- **[subxt](/build/connect/subxt)**: the Rust path.
- **[Pick a library](/build/start/pick-a-library)**: head-to-head comparison.
- **[Asset Hub overview](/build/asset-hub/overview)**: what to query.
- **[Endpoints](/endpoints)**: every chain we serve.
