---
sidebar_position: 1
title: Smoldot light client
description: Trustless, in-browser Polkadot. No hosted RPC dependency, no operator to trust; your dApp verifies state itself.
---

# Smoldot light client

A dApp can run a **light client in the browser** and verify chain state cryptographically, without trusting any RPC operator. Including us.

This is what "decentralised application" means. If you care, this page is for you.

## What's a light client?

A full node downloads every block, executes every extrinsic, and stores the full state trie. Hundreds of gigabytes. Hours of sync. Not feasible in a browser tab.

A **light client** downloads only **block headers** and verifies them against the GRANDPA finality proofs. It then fetches specific state entries on demand via **state proofs**: small Merkle proofs that let the client confirm "yes, this storage value is in the finalized chain state."

The result: a few megabytes of sync, runs in a Web Worker, gives you the same `client.query.System.Account.getValue(addr)` interface as a full WSS connection, and you don't have to trust any single operator.

:::info This is not a fallback
A smoldot client is not a slower fallback version of a full RPC. For *reading* finalized state it's strictly more secure: the dApp itself verifies the proof. The trust model goes from "trust the RPC provider" to "trust the validator set you bootstrap to", the same trust assumption as running your own full node.
:::

## When to use it

**Use a light client when:**
- You're building a dApp where users care about decentralisation (DAOs, governance UIs, identity, prediction markets).
- You're worried about a single RPC operator being compelled to lie or filter requests.
- You want to ship a static site with no backend: no proxy, no API gateway.

**Stick with WSS when:**
- You need sub-second response times on first page load (smoldot needs ~5–15s to warp-sync before queries work).
- You're doing high-frequency reads (smoldot is optimised for correctness, not throughput).
- You're in Node.js / server-side; a real full node makes more sense.

A common pattern: **WSS for first paint, smoldot for actual state.** Show approximate balances from a hosted RPC immediately, then re-validate from smoldot once it's warped.

## Install

```bash
npm i polkadot-api smoldot
```

You'll also want the descriptors for Asset Hub Polkadot (and the relay, since system parachains piggy-back on relay-chain finality):

```bash
npx papi add dot -n polkadot
npx papi add ahp -n polkadot_asset_hub
npx papi
```

## Connect via smoldot: relay chain

The simplest case: light-client Polkadot relay.

```ts
import { start } from 'smoldot';
import { createClient } from 'polkadot-api';
import { getSmProvider } from 'polkadot-api/sm-provider';
import { chainSpec as polkadotSpec } from 'polkadot-api/chains/polkadot';
import { dot } from '@polkadot-api/descriptors';

// 1. Start the smoldot worker (one per tab, ideally).
const smoldot = start();

// 2. Wrap a chain factory as a PAPI provider. The chainSpec includes the
//    genesis hash, the bootnodes, and the current validator set checkpoint.
//    PAPI v2 takes a factory so it can re-add the chain on reconnect.
const client = createClient(
  getSmProvider(() => smoldot.addChain({ chainSpec: polkadotSpec })),
);
const api = client.getTypedApi(dot);

// 3. Use it like any other client. Reads are verified by smoldot.
const finalized = await client.getFinalizedBlock();
console.log('Verified finalized block:', finalized.number);
```

The first call to `addChain` triggers **warp sync**: smoldot fetches a series of GRANDPA justifications stepping through validator-set changes, ending at recent finality. This is what takes 5–15 seconds on a fresh load. On subsequent loads, smoldot caches the warp-sync result in IndexedDB and resumes from there.

## Connect via smoldot: Asset Hub (parachain)

Parachains require **two** chains: the relay (for finality) and the para itself (for state). You add them in order:

```ts
import { start } from 'smoldot';
import { createClient } from 'polkadot-api';
import { getSmProvider } from 'polkadot-api/sm-provider';
import { chainSpec as polkadotSpec } from 'polkadot-api/chains/polkadot';
import { chainSpec as ahpSpec } from 'polkadot-api/chains/polkadot_asset_hub';
import { ahp } from '@polkadot-api/descriptors';

const smoldot = start();

// Relay first (Asset Hub will validate against this)
const relay = await smoldot.addChain({ chainSpec: polkadotSpec });

// Parachain: bind to its relay via a chain factory
const client = createClient(
  getSmProvider(() =>
    smoldot.addChain({
      chainSpec: ahpSpec,
      potentialRelayChains: [relay],
    }),
  ),
);
const api = client.getTypedApi(ahp);

// Verified Asset Hub queries.
const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const { data } = await api.query.System.Account.getValue(address);
console.log('Trustlessly verified balance:', data.free);
```

:::tip Reuse the smoldot worker
Don't `start()` a new smoldot instance per component. It's a heavy WASM blob that loads once. Create it at app boot, pass the resulting `chain` handles down through context.
:::

## The finality-latency tradeoff

Most "go fully trustless" advice glosses this over.

Polkadot finalises blocks with **GRANDPA**. Finality is not the *latest* block; it's the block GRANDPA has voted on, typically **two to three blocks behind the head**:

```
head        →  block N    (produced ~just now, not yet finalised)
                block N-1  (one round of votes in flight)
                block N-2  (two rounds)
finalized   →  block N-3  (≈ 18 seconds old at a 6 s block time)
```

A *truly* trustless app (one that only ever shows values smoldot has verified against a GRANDPA proof) therefore reads state that is on average **≈ 18 seconds stale**. And it gets worse.

- **Every read** of finalised state pays this delay relative to "what just happened on chain."
- **Every write** signed by the user takes ~18 s before the dApp can show "your transfer landed."
- **Sequential reads compound.** A user clicking "Send" might wait 18 s for the tx to finalise, then another 18 s for the new balance to read back. Multiply by every step of a multi-step flow (claim → swap → stake) and you're at minute-plus interaction times.

This is not a smoldot bug. It's the cost of cryptographic trustlessness on a 6 s-block chain. Three pragmatic responses:

1. **Optimistic UI on best-effort head.** Smoldot exposes the head block too, not just finality. Apps render the unfinalised "best" value immediately (`watchValue(addr, { at: 'best' })`), then reconcile when finality lands. This is how nearly every production trustless dApp ships, including the staking dashboard.
2. **Use a hosted RPC like IBP for latency-critical paths.** GeoDNS-routed WSS sits at &lt; 50 ms RTT from the operator running your nearest pool. You're trusting that operator to relay honestly, but you can still verify *any* specific value against smoldot later, asynchronously.
3. **Both, side by side.** What the [hybrid pattern](#hybrid-light-client-for-state-rpc-for-everything-else) below is for: smoldot validates the small set of values you can't afford to be wrong about (your balance, your governance vote), the hosted RPC drives everything that needs to feel instant.

The honest summary: *pure* trustless light-client UX is a steep ask. Either accept 18 s per-action latency, or blend in a low-latency RPC and use smoldot as a verification layer rather than a primary read path. Almost every shipped trustless dApp does the second.

:::tip Why this is the IBP's value proposition
We're a public RPC service that exists specifically to make option 2 viable for everyone: no signups, no rate limits, GeoDNS to your nearest operator, < 50 ms RTT. Pair us with smoldot for the "best of both" pattern. We don't expect anyone to go all-in on one or the other; we expect them to layer.
:::

## Run smoldot in a Web Worker

In the browser, smoldot defaults to running on the main thread. For any real app, run it in a Worker so warp sync doesn't stall your UI:

```ts
// smoldot-worker.ts
import { startFromWorker } from 'polkadot-api/smoldot/from-worker';

// `new URL(..., import.meta.url)` is the bundler-agnostic form. Vite,
// webpack 5, esbuild, and Rollup all understand it; you don't need a
// build-tool-specific `?worker` suffix.
const worker = new Worker(
  new URL('polkadot-api/smoldot/worker', import.meta.url),
  { type: 'module' },
);

export const smoldot = startFromWorker(worker);
```

```ts
// main.ts
import { smoldot } from './smoldot-worker';
import { chainSpec } from 'polkadot-api/chains/polkadot_asset_hub';
import { chainSpec as relaySpec } from 'polkadot-api/chains/polkadot';

const relay = await smoldot.addChain({ chainSpec: relaySpec });
const ahp   = await smoldot.addChain({ chainSpec, potentialRelayChains: [relay] });
```

:::note Bundler quirks
The `new Worker(new URL(...), { type: 'module' })` pattern is the
specification-compliant form and works in Vite, webpack 5, Rspack, esbuild,
and Rollup. If your bundler refuses to resolve the npm subpath, drop the
`polkadot-api/smoldot/*` import surface and pull `start` from the upstream
`smoldot` package; same API.
:::

## Bootstrap bootnodes from IBP

:::info Bootnodes are entry points, not trust anchors
A bootnode is just an introducer. When smoldot connects to one, it asks "who else is on this network?" and gets a list of peer addresses; from then on it gossips with the wider peer set directly. The bootnode doesn't sign blocks, doesn't decide what's finalised, doesn't serve state. If a bootnode lies about which peers exist, smoldot finds out fast because finality proofs from the rest of the network don't match. Bootnodes can be operated by anyone (us, the chain team, a randomer) without affecting the trust model; the chain spec's genesis hash + GRANDPA validator set are what's load-bearing.
:::

Smoldot's embedded chainspec includes well-known bootnodes, but you can extend the list. The IBP runs **public bootnodes for every chain**. Listing more of them improves discovery time on cold start, especially in restrictive networks:

```ts
const ahp = await smoldot.addChain({
  chainSpec: ahpSpec,
  potentialRelayChains: [relay],
  // Optional: extra bootnodes (otherwise smoldot uses the spec defaults).
  bootNodes: [
    '/dns/asset-hub-polkadot.boot.rotko.net/tcp/30435/wss/p2p/12D3KooWKkzLjYF6M5eEs7nYiqEtRqY8SGVouoCwo3nCWsRnThDW',
    // … see /endpoints for the full geo-distributed list.
  ],
});
```

The full list of IBP bootnodes (TCP for native, WSS for in-browser) lives on the [/endpoints](/endpoints) page, refreshed live from the operator config repo.

:::info Why WSS bootnodes matter in the browser
Browsers can't open raw TCP sockets. Smoldot's only way to reach a peer from a webpage is **secure WebSocket (`/wss/`)**. The IBP operates a WSS-flavoured copy of every bootnode for this reason; without them, in-browser light clients have no peers to discover.
:::

## Hybrid: light client for state, RPC for everything else

Smoldot is verified but slow on cold start, and has no indexing. A common pattern: light client for trust-critical reads, hosted RPC for everything else.

```ts
import { createClient } from 'polkadot-api';
import { getSmProvider } from 'polkadot-api/sm-provider';
import { createWsClient } from 'polkadot-api/ws';

// Trustworthy reads (balance, vote, ownership)
const lightClient = createClient(
  getSmProvider(() => addAhpChain()), // returns the smoldot Chain
);

// Throwaway reads (recent transactions, indexed history)
const rpcClient = createWsClient('wss://asset-hub-polkadot.dotters.network');

const balance = await lightClient.getTypedApi(ahp)
  .query.System.Account.getValue(addr);

const recentBlocks = await rpcClient.getTypedApi(ahp)
  .query.System.BlockHash.getEntries();
```

A user-facing transfer flow might use the RPC client for "did my pending tx land yet" polling, but defer to the light client for "what's my balance now."

## Verifying it really works

You can prove to yourself that smoldot is verifying by **pointing it at a hostile RPC** in a controlled way. Swap `getSmProvider` for a malicious `WsProvider` that returns a forged storage value, and it'll display the lie. Swap back to `getSmProvider` and smoldot rejects the same value because the state-proof check fails.

This is the point. The dApp only trusts:
1. The chainspec it shipped with (genesis hash + initial validator set).
2. The browser's WASM execution.
3. The math.

Not the bootnode operator. Not the RPC provider. Not us.

## Limitations

- **No mempool.** Smoldot can submit transactions, but doesn't index them by hash for status polling. Use the result returned by `tx.signAndSubmit` directly.
- **No historical state.** Smoldot can read finalized state at the current head and a few recent blocks. Querying state at block N from a month ago requires an archive node; use a hosted RPC for that.
- **No subscriptions to past events.** If you need to scan back through historical event logs, use an indexer (Subsquid, SubQuery) or an archive RPC.
- **Bigger bundle.** Smoldot is ~2 MB of WASM. Acceptable for dApps, not for landing pages.

## Next

- **[Connecting with PAPI](/build/connect/papi)**: same client API, WSS provider instead.
- **[Asset Hub overview](/build/asset-hub/overview)**: what to query.
- **[/endpoints](/endpoints)**: list of IBP WSS bootnodes for your `bootNodes:` array.
