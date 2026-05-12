---
sidebar_position: 4
title: subxt (Rust)
description: Connect a Rust app, CLI, indexer, or bot to an IBP endpoint via subxt.
---

# subxt (Rust)

By the end of this page you'll have subxt connected to an IBP Asset Hub endpoint, metadata cached locally, and a Rust binary reading block height and an account balance.

[`subxt`](https://github.com/paritytech/subxt) is the canonical Rust client for Substrate chains. It generates a statically-typed runtime interface from SCALE metadata via a procedural macro, so reads, extrinsics and runtime-API calls type-check at `cargo build` time.

## 1. Install

```bash
cargo add subxt subxt-signer tokio --features=tokio/full
```

For the in-process light client (smoldot), also enable `subxt = { features = ["unstable-light-client"] }`.

## 2. Fetch metadata

```bash
cargo install subxt-cli
subxt metadata \
  --url wss://asset-hub-polkadot.dotters.network \
  -o ./artifacts/asset_hub_polkadot.scale
```

Re-run after every runtime upgrade and gate updates on a test pass. The [`artifacts/`](https://github.com/paritytech/subxt/tree/master/artifacts) folder in the subxt repo is a useful layout pattern.

## 3. Connect and read a balance

```rust
use subxt::{OnlineClient, PolkadotConfig};
use subxt::utils::AccountId32;
use std::str::FromStr;

#[subxt::subxt(runtime_metadata_path = "artifacts/asset_hub_polkadot.scale")]
pub mod ahp {}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let api = OnlineClient::<PolkadotConfig>::from_url(
        "wss://asset-hub-polkadot.dotters.network",
    ).await?;

    let who = AccountId32::from_str(
        "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    )?;
    let address = ahp::storage().system().account(&who);

    let info = api.storage().at_latest().await?.fetch(&address).await?;
    if let Some(info) = info {
        println!("Free: {}, reserved: {}", info.data.free, info.data.reserved);
    }
    Ok(())
}
```

## 4. Subscribe to finalized blocks

```rust
let mut blocks = api.blocks().subscribe_finalized().await?;
while let Some(block) = blocks.next().await {
    let block = block?;
    println!("Finalized #{} ({})", block.header().number, block.hash());
}
```

:::info When to use subxt
- A single statically-linked binary (CLI, daemon, indexer, monitoring bot).
- Predictable memory + CPU profile, no V8/Node runtime.
- Compile-time metadata checks via the `#[subxt::subxt]` macro.
- Rust to WASM browser dApps that skip the JS bridge entirely.
- In TypeScript-land? Use [PAPI](./papi.md) or [reactive-dot](./reactive-dot.md).
:::

:::warning Mutating snippets on testnet only
`subxt_signer::sr25519::dev::alice()` is the well-known Alice key: public and unfunded on mainnet. Sign with a Ledger or external signer for production; use `wss://asset-hub-paseo.dotters.network` for test runs.
:::

## Common errors

:::note
**`metadata version unsupported`.** Re-run `subxt metadata` against the same endpoint and update `subxt` to the latest minor version.

**`Transport error: ConnectionRefused`.** IBP endpoints require WSS (not WS). Use `wss://asset-hub-polkadot.dotters.network`.
:::

## Deeper reference

API docs: [docs.rs/subxt](https://docs.rs/subxt/latest/subxt/). Source, single-file examples (`blocks.rs`, `submit_transaction.rs`, `storage_entries.rs`, `runtime_apis.rs`, `light_client.rs`, `dynamic.rs`), and project-scale examples (`parachain-example`, `wasm-example`) live at [github.com/paritytech/subxt](https://github.com/paritytech/subxt).

## Next

- **[PAPI](/build/connect/papi)**: if your project is JS/TS too.
- **[Asset Hub overview](/build/asset-hub/overview)**: what to query.
- **[Endpoints](/endpoints)**: every chain we serve.
- **[Smoldot](/build/light-client/smoldot)**: same trustless angle, browser side.
