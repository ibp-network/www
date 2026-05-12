---
sidebar_position: 2
title: Pick a library
description: A comparison of PAPI, reactive-dot, Dedot, subxt and ethers/viem, and what to reach for when.
---

# Pick a library

There are five mainstream, **actively-maintained** ways to talk to Polkadot from application code. By the end of this page you'll know which to use for your dApp.

The short version: **use [PAPI](/build/connect/papi) unless you're building a React app. In that case, use [reactive-dot](/build/connect/reactive-dot), which is just React hooks over PAPI.**

:::note Why no `@polkadot/api`?
We don't recommend `@polkadot/api` (Polkadot.js classic) for new dApps. It's in maintenance mode while [PAPI](https://github.com/polkadot-api/polkadot-api) takes over the same surface with proper typing and a lighter bundle.
:::

## The five libraries at a glance

| Library | Language | Best for | Bundle (gzip) | Maturity |
| --- | --- | --- | --- | --- |
| **PAPI** (polkadot-api) | TS / JS | New dApps. Type-safe, light-client-native, framework-agnostic. | ~80 KB + descriptors | Stable (2.x) |
| **reactive-dot** | TS / JS (React) | React dApps. PAPI under the hood, hooks on top. | PAPI + small React layer | Stable |
| **Dedot** | TS / JS | Polkadot.js-shaped API (familiar migration target), smaller default bundle. | ~40 KB + descriptors | Stable |
| **subxt** | Rust | Native CLIs, indexers, bots (anything not in a browser). | n/a | Stable |
| **ethers / viem** | TS / JS | Solidity contracts on Asset Hub's [EVM](/build/evm/overview). | ~30–90 KB | Mature |

All five connect to the same chains over the same RPC. Your choice is about *ergonomics*, not capability.

## Decision tree

```
Are you building a React dApp?
├── Yes → reactive-dot
└── No
    ├── Browser / Node.js, framework-agnostic?
    │   ├── Bundle size critical? → Dedot
    │   └── Otherwise → PAPI
    ├── Deploying Solidity? → viem (or ethers if porting)
    └── Rust CLI / indexer? → subxt
```

If you're stuck, **start with PAPI**. The rest of the docs assume PAPI as the default; the [reactive-dot](/build/connect/reactive-dot) and [Dedot](/build/connect/dedot) pages cover the alternatives when they fit better.

## Special cases

**EVM contracts.** Use **viem** (fresh) or **ethers v6** (porting). Asset Hub exposes a standard Ethereum JSON-RPC at a separate hostname: `https://eth-asset-hub-polkadot.dotters.network` for mainnet, `https://eth-asset-hub-paseo.dotters.network` for testnet. These libraries talk to it directly; you **do not** use PAPI for EVM contracts.

**Light client (in-browser, trustless).** PAPI and reactive-dot ship smoldot integration. Dedot has experimental support. See [Smoldot](/build/light-client/smoldot).

**Backend / indexer.** subxt for compile-time metadata checks and a static binary; PAPI in Node.js for fast iteration. We use both at IBP.

:::tip You can use more than one
A typical dApp imports **PAPI/reactive-dot** for native pallets and **viem** for contracts. Different runtimes; nothing against carrying both.
:::

## Where each library lives

- **PAPI**: [polkadot-api/polkadot-api](https://github.com/polkadot-api/polkadot-api) · [papi.how](https://papi.how)
- **reactive-dot**: [buffed-labs/reactive-dot](https://github.com/buffed-labs/reactive-dot)
- **Dedot**: [dedotdev/dedot](https://github.com/dedotdev/dedot) · [docs.dedot.dev](https://docs.dedot.dev)
- **subxt**: [paritytech/subxt](https://github.com/paritytech/subxt) · [docs.rs/subxt](https://docs.rs/subxt)
- **viem**: [wevm/viem](https://github.com/wevm/viem)
- **ethers**: [ethers-io/ethers.js](https://github.com/ethers-io/ethers.js)

## Next

- **[Quickstart](/build/start/quickstart)**: the five-minute PAPI walkthrough.
- **[Connect with PAPI](/build/connect/papi)**: the default modern path.
- **[reactive-dot](/build/connect/reactive-dot)**: React hooks over PAPI.
- **[Dedot](/build/connect/dedot)**: the lighter-bundle alternative.
- **[subxt](/build/connect/subxt)**: Rust client for CLIs and indexers.
- **[EVM overview](/build/evm/overview)**: ethers and viem against Asset Hub.
