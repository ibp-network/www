---
sidebar_position: 2
title: Inspect chains with web explorers
description: Open any IBP endpoint inside dev.papi.how or polkadot.js.org/apps with one deep link.
---

# Inspect chains with web explorers

You don't need to write code to poke at a chain. Two web tools cover 90% of the day-to-day "what's on chain right now?" flow, and both accept a WSS endpoint as a URL parameter. Drop an IBP endpoint in; you're connected.

This page is the deep-link cheat sheet.

## dev.papi.how: the PAPI explorer

[dev.papi.how](https://dev.papi.how) is Polkadot-API's hosted explorer. Browse pallets, read storage, build extrinsics, sign with an injected wallet, decode raw call data; all without leaving the browser. It's what most PAPI-using developers reach for when they want to verify a snippet against a live chain.

Deep-link pattern:

```
https://dev.papi.how/explorer#networkId={NETWORK_ID}&endpoint={URL_ENCODED_WSS}
```

| Chain | One-click link |
| --- | --- |
| **Asset Hub Polkadot** | [`dev.papi.how/explorer#networkId=polkadot_asset_hub&endpoint=…`](https://dev.papi.how/explorer#networkId=polkadot_asset_hub&endpoint=wss%3A%2F%2Fasset-hub-polkadot.dotters.network) |
| **Asset Hub Kusama** | [`dev.papi.how/explorer#networkId=kusama_asset_hub&endpoint=…`](https://dev.papi.how/explorer#networkId=kusama_asset_hub&endpoint=wss%3A%2F%2Fasset-hub-kusama.dotters.network) |
| **Asset Hub Paseo** (testnet) | [`dev.papi.how/explorer#networkId=paseo_asset_hub&endpoint=…`](https://dev.papi.how/explorer#networkId=paseo_asset_hub&endpoint=wss%3A%2F%2Fasset-hub-paseo.dotters.network) |

The `networkId` tells the explorer which PAPI descriptors to load (so storage and tx forms come out typed). The `endpoint` is the IBP WSS URL: `dotters.network` here, but the `ibp.network` pool path works identically:

```
endpoint=wss%3A%2F%2Fsys.ibp.network%2Fasset-hub-polkadot
```

:::tip For *your* code under test
When you're debugging a PAPI snippet, paste the chain into `dev.papi.how` with the same endpoint your code uses. Anything you see in the explorer's storage tab is what `api.query.X.Y.getValue()` will return: same metadata, same finalised state, same chain.
:::

## polkadot.js.org/apps: the classic explorer + wallet UI

[polkadot.js.org/apps](https://polkadot.js.org/apps) is the long-running Polkadot front-end. Less typed than `dev.papi.how`, more featureful for end-user operations: extrinsics, governance voting, staking, identity, recovery, parachain auctions. If a chain has a UI for it at all, Apps has the UI.

Deep-link pattern:

```
https://polkadot.js.org/apps/?rpc={URL_ENCODED_WSS}#/{ROUTE}
```

Common routes: `#/accounts`, `#/extrinsics`, `#/chainstate`, `#/explorer`, `#/staking`, `#/democracy`.

| Chain | One-click link |
| --- | --- |
| **Asset Hub Polkadot** | [`apps/?rpc=…asset-hub-polkadot#/accounts`](https://polkadot.js.org/apps/?rpc=wss%3A%2F%2Fasset-hub-polkadot.dotters.network#/accounts) |
| **Asset Hub Kusama** | [`apps/?rpc=…asset-hub-kusama#/accounts`](https://polkadot.js.org/apps/?rpc=wss%3A%2F%2Fasset-hub-kusama.dotters.network#/accounts) |
| **Asset Hub Paseo** (testnet) | [`apps/?rpc=…asset-hub-paseo#/accounts`](https://polkadot.js.org/apps/?rpc=wss%3A%2F%2Fasset-hub-paseo.dotters.network#/accounts) |

The `?rpc=` parameter is read on first load. Change it and refresh, or use the network switcher in the top-left to swap endpoints without reloading.

:::info Apps' RPC adapter is forgiving
Polkadot.js Apps works against any chain that exposes Substrate JSON-RPC, regardless of which PAPI descriptors exist. That makes it handy for poking new parachains or testnets before generating descriptors.
:::

## Build and sign a transaction from a web explorer

You don't need to write code to send an extrinsic. Both explorers can build, sign and broadcast against an IBP endpoint using your installed wallet.

### From `polkadot.js.org/apps`

1. **Open the chain.** Use one of the deep links above (or pick the chain in the top-left network switcher). Wait for the "metadata loaded" toast.
2. **Connect a wallet.** Top-right account icon → "Accounts" → confirm the Polkadot.js / Talisman / SubWallet permission prompt. The wallet's accounts show up under "My accounts."
3. **Navigate to** `Developer → Extrinsics` (or the URL hash `#/extrinsics`).
4. **Pick the call.** Three dropdowns in order:
   - **using the selected account**: pick the signer.
   - **submit the following extrinsic**: pick a pallet (e.g. `balances`).
   - **\<call>**: pick the call (e.g. `transferKeepAlive`).
5. **Fill the parameters** the form generates. For `transferKeepAlive` that's `dest:` (paste the recipient SS58) and `value:` (Plancks; `1000000000` is 0.1 DOT).
6. **Click "Submit Transaction"**. Apps assembles the call, hands it to your wallet for signing, then broadcasts. A toast confirms "in block" then "finalized" (≈ 12–18 s on Polkadot).
7. **Result**: the toast carries a link to the extrinsic on a block explorer. Click it to see the events that fired.

:::tip Testnet first
Don't first-test transfer flows against the mainnet wallet you keep value on. Switch the URL to `wss://asset-hub-paseo.dotters.network`, click "Faucet" in Apps' top bar to get test PAS, try the flow there.
:::

### From `dev.papi.how`

1. **Open the chain** via the `dev.papi.how` table above.
2. **Click the "Transactions" tab** in the left rail.
3. **Pick the call**: typed dropdown of pallets, then calls. The form below is type-generated: it knows `dest` is a `MultiAddress` enum, `value` is a `bigint`.
4. **Connect a wallet**: top-right account selector. Same injected-wallet flow as Apps.
5. **Click "Sign and Submit"**. PAPI returns a signed bytes payload to the wallet, the wallet returns a signature, PAPI broadcasts.
6. **Result panel** at the bottom shows the call data hex, the tx hash, the block hash on inclusion, and the decoded events. Copy any of them for reproduction in code.

The mental model: **dev.papi.how is the typed cousin of Apps' extrinsics tab**. Same flow, but every field has a type behind it, so a wrong `MultiAddress` variant won't compile in the form.

:::info Verifying call data before signing
Both tools display the encoded call data hex *before* the wallet prompt. If your wallet then shows a different hex to sign, something has gone wrong (extension malware, browser injection). The two strings should match byte-for-byte.
:::

## Bookmark these for daily work

A pattern most operators end up with: a tab group with five or six pre-loaded URLs against the chains they touch. Drop these into your bookmark bar and skip the "what's the endpoint again" step.

```
dev.papi.how — Asset Hub Polkadot
dev.papi.how — Asset Hub Paseo  (your test target)
apps — Asset Hub Polkadot       (when you need the staking / governance UI)
Subsquare — Polkadot             (governance + treasury proposals)
```

## What goes where

Different tool, different job:

| Task | Use |
| --- | --- |
| Read typed storage, decode extrinsics, build/sign txs from a wallet | **dev.papi.how** |
| Vote, stake, claim identity, manage proxies, recovery | **polkadot.js.org/apps** |
| Browse OpenGov referenda, leave comments, see treasury spend | **Subsquare** ([polkadot.subsquare.io](https://polkadot.subsquare.io)) |

All three accept the same chain hash and play nicely together: explorer in one tab, code in another, wallet popup over the top.

## Use IBP endpoints by default

The `dotters.network` and `ibp.network` hosts in every link above resolve via GeoDNS to the operator closest to you. No accounts, no rate limits, no telemetry beacons. You can pass any other WSS endpoint to these tools, but you'd be choosing a slower path. See [/endpoints](/endpoints) for the full list.

## Next

- **[Quickstart](/build/start/quickstart)**: write the snippet you'll then verify in dev.papi.how.
- **[Wallet connection](/build/recipes/wallet-connect)**: get the signer that lets you broadcast from either explorer.
- **[Asset Hub overview](/build/asset-hub/overview)**: what to look at once you're in the explorer.
