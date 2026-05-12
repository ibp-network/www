---
sidebar_position: 2
title: reactive-dot
description: React hooks over PAPI. Connect to an IBP endpoint and read state from a component.
---

# reactive-dot

By the end of this page you'll have reactive-dot wired against an IBP Asset Hub endpoint and a React component reading account state via hooks. reactive-dot is a React wrapper around [PAPI](./papi.md), maintained by [buffed-labs](https://github.com/buffed-labs).

## 1. Install

```bash
npm i @reactive-dot/core @reactive-dot/react polkadot-api
npx papi add ahp -n polkadot_asset_hub
npx papi
```

For a fresh project, `npx create-polkadot-dapp@latest` scaffolds a Vite + React + reactive-dot + PAPI app with the `papi` postinstall hook pre-wired.

## 2. Config + provider tree

```ts
// src/config.ts
import { ahp } from '@polkadot-api/descriptors';
import { defineConfig } from '@reactive-dot/core';
import { InjectedWalletProvider } from '@reactive-dot/core/wallets.js';
import { getWsProvider } from 'polkadot-api/ws-provider/web';

export const config = defineConfig({
  chains: {
    asset_hub: {
      descriptor: ahp,
      provider: getWsProvider('wss://asset-hub-polkadot.dotters.network'),
    },
  },
  wallets: [new InjectedWalletProvider()],
});

declare module '@reactive-dot/core' {
  export interface Register { config: typeof config; }
}
```

```tsx
// src/App.tsx
import { Suspense } from 'react';
import { ChainProvider, ReactiveDotProvider } from '@reactive-dot/react';
import { config } from './config';
import { Dashboard } from './Dashboard';

export function App() {
  return (
    <ReactiveDotProvider config={config}>
      <ChainProvider chainId="asset_hub">
        <Suspense fallback={<p>Connecting…</p>}>
          <Dashboard />
        </Suspense>
      </ChainProvider>
    </ReactiveDotProvider>
  );
}
```

## 3. Read state in a component

```tsx
import { useLazyLoadQuery } from '@reactive-dot/react';

export function Dashboard() {
  const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
  const [account] = useLazyLoadQuery((b) =>
    b.storage('System', 'Account', [address]),
  );

  return <p>Free: {account.data.free.toString()}</p>;
}
```

`useLazyLoadQuery` suspends on the initial fetch and re-renders on every finalised change. It de-dupes identical values; no manual subscribe/unsubscribe.

:::info When to use reactive-dot
- You're building a React dApp and want hooks, not imperative client code.
- You want PAPI's type-safety without wiring `getTypedApi` by hand.
- You're happy declaring every chain in one config file.
- Not React? Use [PAPI](./papi.md) directly.
:::

:::warning Testnet for mutating flows
Point at `wss://asset-hub-paseo.dotters.network` and use the [Paseo faucet](https://faucet.polkadot.io) when calling `useMutation` so you're not burning real DOT.
:::

## Common errors

:::note
**`useLazyLoadQuery is not defined`**. The calling tree isn't wrapped in both `ReactiveDotProvider` and `ChainProvider`.

**Type errors after adding a chain**. Re-run `npx papi` to regenerate descriptors.
:::

## Deeper reference

Full hook catalogue, wallet flows, light-client provider, and multi-chain patterns live in the upstream repo: [github.com/buffed-labs/reactive-dot](https://github.com/buffed-labs/reactive-dot). For surfaces reactive-dot doesn't yet wrap, drop down to raw [PAPI](./papi.md) via its `useClient()` hook.

## Next

- **[PAPI](/build/connect/papi)**: what reactive-dot wraps.
- **[Asset Hub overview](/build/asset-hub/overview)**: what to query.
- **[Endpoints](/endpoints)**: every chain we serve.
- **[Wallet connection](/build/recipes/wallet-connect)**: pair with `useMutation`.
