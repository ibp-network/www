---
sidebar_position: 4
title: Runtime view functions
description: Read-only runtime queries via pallet view functions. What they are, when they beat a storage read, and how to call them through PAPI.
---

# Runtime view functions

Asset Hub (and any reasonably modern Substrate chain) ships a feature that's still under-publicised: **runtime view functions**. They're a pallet-level read API that the runtime exposes for free: strongly typed, metadata-discoverable, no off-chain computation. Calling one is just an RPC call, which is exactly where public hosted RPC shines: stateless, cacheable, no signing.

This page is the short version. If you're a pallet author wanting to write your own, the [Polkadot SDK reference](https://docs.rs/frame-support/latest/frame_support/attr.pallet.html#view-functions) is the long version.

## What's the problem they solve

For years the only ways a Substrate chain could answer a read query to the outside world were:

1. Expose the underlying storage and let the caller decode it. Cheap, but the caller has to know the storage layout and rebuild any derived state themselves.
2. Write a **Runtime API**: define a trait, implement it in the runtime, wire it through `sp_api::impl_runtime_apis!`, regenerate the metadata. Powerful but heavyweight, a lot of ceremony for "return whether this account has a proxy."

View functions sit between them. You write a function on the pallet, mark it with `#[pallet::view_functions]`, and the SDK generates a dispatch ID, registers it in the metadata, and routes RPC calls to it. No runtime-API trait, no extra wiring.

```rust
#[pallet::view_functions]
impl<T: Config> Pallet<T> {
    /// Is the call permitted under this proxy type?
    pub fn check_permissions(
        call: <T as Config>::RuntimeCall,
        proxy_type: T::ProxyType,
    ) -> bool {
        proxy_type.filter(&call)
    }
}
```

The Proxy pallet uses this in production today; `Proxy::check_permissions` is the canonical example.

## Why this is interesting for hosted RPC

A view-function call is deterministic, read-only, has bounded execution cost, and produces a return value the SDK marshals into structured types. Concretely that means:

- **Cacheable.** The same input + the same finalized state produces the same output. A reverse proxy in front of an RPC node can cache `state_call` results without having to understand the pallet.
- **SSR-friendly.** Your Next.js / SolidStart / Astro server can call a view function during page rendering and ship the result inline, without holding a signer or a websocket.
- **Cheap for the user.** No transaction, no fee, no wallet popup. The query goes over plain HTTPS or WSS.

The IBP serves the standard `state_call` RPC method on every endpoint, so any view function the runtime exposes is reachable from `wss://asset-hub-polkadot.dotters.network` (or any of the IBP hosts). No special configuration on our side; this is how the chain is intended to be queried.

## Calling one with PAPI

PAPI surfaces view functions under `api.view.[Pallet].[function](...)`, the same shape as `api.query` and `api.tx`. The argument types come from the descriptor package.

```ts
import { createWsClient } from 'polkadot-api/ws';
import { Binary } from 'polkadot-api';
import { ahp } from '@polkadot-api/descriptors';

const client = createWsClient('wss://asset-hub-polkadot.dotters.network');
const api = client.getTypedApi(ahp);

// Build a call the way you'd build a transaction…
const remark = api.tx.System.remark({ remark: Binary.fromText('hello') });

// …and ask the runtime whether `proxy_type: Any` is allowed to execute it.
const allowed = await api.view.Proxy.check_permissions(
  remark.decodedCall,
  { type: 'Any', value: undefined },
);

console.log(allowed); // true
```

A few things worth noting:

The result type is whatever the pallet returned: `bool` here, but it could be a `Vec<u8>`, a struct, an `Option<_>`, whatever. PAPI generates the TypeScript shape from the metadata.

You don't sign anything. The chain doesn't bill you. There's no on-chain side effect, only the computed answer.

`decodedCall` is the PAPI-internal call representation, the same one you'd pass to `tx.X.submit`. Don't try to hand-build the SCALE bytes; let PAPI handle it.

## When a view function is the right tool

View functions are for **deterministic, read-only, single-pallet logic**. They're an excellent fit when:

- You want to check a permission or invariant before letting the user submit a transaction. The frontend dry-runs the question against current state, the wallet popup only appears if the answer is "yes."
- You're rendering a UI that depends on derived state the pallet already knows how to compute. Asking the runtime is one round trip; reading storage and re-deriving in JS is several plus a re-implementation of the pallet's logic.
- You're writing an LLM tool or an MCP server (see [LLMs and agents](/build/recipes/llm-and-agents)) and want to expose a typed, cheap read surface to the agent without inventing your own.

When they're **not** the right tool:

- You need data that spans multiple pallets. View functions are scoped to one pallet at a time. Combine the calls client-side.
- The answer depends on something off-chain (an external API, a clock you don't trust, signature material). View functions are pure functions of on-chain state.
- You're writing complex business logic that wants to mutate state. That's a normal extrinsic.

## Manual testing

You can invoke any view function from Polkadot.js Apps under **Developer → View Call**. Useful when you want to verify the function exists in the runtime you're connected to before wiring frontend code against it.

## Further reading

- [Polkadot SDK `#[pallet::view_functions]` reference](https://docs.rs/frame-support/latest/frame_support/attr.pallet.html#view-functions): how pallet authors define them.
- [`api.view` surface in PAPI](https://papi.how/): client-side reference for the calls.
- [Asset Hub overview](/build/asset-hub/overview): where you'll most commonly run them in practice.

## Next

- **[Endpoints](/endpoints)**: every IBP host that serves `state_call`.
- **[LLMs and agents](/build/recipes/llm-and-agents)**: wire view functions as MCP tools.
- **[PAPI](/build/connect/papi)**: the client surface used above.
