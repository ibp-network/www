---
sidebar_position: 1
title: Wallet connection
description: Connect Talisman, SubWallet, Nova, Polkadot.js extension and any injected wallet to your dApp via PAPI.
---

# Wallet connection

By the end of this page you'll have a "Connect wallet" flow that
supports every major Polkadot wallet (Talisman, SubWallet, Nova, Polkadot.js
extension) and produces a signer you can pass to [PAPI](/build/connect/papi)
(or its React wrapper [reactive-dot](/build/connect/reactive-dot)).

**All Polkadot wallets implement the same injection interface**
(`window.injectedWeb3`). Code once, work everywhere.

## How injection works

A Polkadot wallet extension injects `window.injectedWeb3` with one entry per
installed wallet:

```js
window.injectedWeb3
// {
//   'talisman':     { version: '1.x',    enable: async (origin) => {...} },
//   'subwallet-js': { version: '1.x',    enable: async (origin) => {...} },
//   'polkadot-js':  { version: '0.46.x', enable: async (origin) => {...} },
// }
```

When you call `enable(origin)`, the user sees a permission prompt; if they
accept, you get back an object with `accounts`, `signer`, and `metadata`. That
signer is what PAPI consumes to sign extrinsics.

You don't usually touch `window.injectedWeb3` directly. PAPI's
`polkadot-api/pjs-signer` wraps it for you.

## Install

```bash
npm i polkadot-api
```

The PJS-signer adapter lives inside `polkadot-api` itself; no extra package.

## Pattern 1: enumerate available wallets

Render a list of installed wallets so the user can pick:

```ts
import { getInjectedExtensions } from 'polkadot-api/pjs-signer';

const installed = getInjectedExtensions();
// ['talisman', 'subwallet-js', 'polkadot-js', ...]

if (installed.length === 0) {
  showInstallPrompt(); // link to Talisman / SubWallet / etc.
}
```

:::tip Wait for the extension to inject
Race condition: if you call `getInjectedExtensions` before the extension
content script has run, you'll see zero extensions. If you're getting an
empty list on hard reload, retry after a short delay or wait on
`window.injectedWeb3` to be populated.
:::

## Pattern 2: connect, list accounts, sign

PAPI returns a `PolkadotSigner` attached to each account object; no separate
"get the signer for this address" step.

```ts
import { createWsClient } from 'polkadot-api/ws';
import {
  connectInjectedExtension,
  getInjectedExtensions,
} from 'polkadot-api/pjs-signer';
import { ahp, MultiAddress } from '@polkadot-api/descriptors';

// 1. Find which wallets are installed.
const installed = getInjectedExtensions();
if (installed.length === 0) throw new Error('Install a Polkadot wallet first.');

// 2. Connect to a specific one (let the user pick; first one shown here).
const ext = await connectInjectedExtension(installed[0], 'my-dapp');

// 3. List accounts; let the user pick.
const accounts = ext.getAccounts();
const account = accounts[0];

// 4. The account already carries its `polkadotSigner`.
const signer = account.polkadotSigner;

// 5. Build + send a transfer.
const client = createWsClient('wss://asset-hub-polkadot.dotters.network');
const api = client.getTypedApi(ahp);

const tx = api.tx.Balances.transfer_keep_alive({
  dest: MultiAddress.Id('5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty'),
  value: 1_000_000_000n,
});

const result = await tx.signAndSubmit(signer);
console.log('Finalized:', result.block.hash);
```

That's the whole flow. No `web3Enable` / `web3FromAddress` two-step; the
signer is attached to the account object the extension hands back.

## Pattern 3: subscribe to account changes

Users add or rename accounts while your dApp is open. To keep the UI in sync:

```ts
const ext = await connectInjectedExtension('talisman', 'my-dapp');

const unsub = ext.subscribe((accounts) => {
  console.log('Accounts updated:', accounts.map((a) => a.address));
  updateUi(accounts);
});

// later
unsub();
```

The callback fires when the user adds an account, renames one, or revokes the
dApp's permission.

## Which wallets work?

All of these implement `window.injectedWeb3`, indistinguishable at the API
layer.

| Wallet | Focus | Notes |
| --- | --- | --- |
| **Talisman** | Polished UI, hardware wallet support, EVM + Substrate in one. | The recommended consumer wallet for 2026. |
| **SubWallet** | Mobile-first, big chain catalogue. | Strong in Asian markets. |
| **Nova Wallet** (mobile) | Mobile-native, WalletConnect integration. | Connect via WalletConnect rather than injection on desktop. |
| **Polkadot.js extension** | Reference implementation. | Headless, no UI to speak of. Useful for low-level debugging. |
| **Enkrypt** | Multi-chain (EVM + Substrate). | Niche but works. |

Test against **Talisman** and **SubWallet** first; that's what most users
have. Polkadot.js extension is what you use as a developer for the
lowest-level debugging.

:::info Wallets sign; they don't talk to chains
The wallet doesn't connect to an RPC. *You* connect to an RPC (an IBP
endpoint, smoldot, your own node) and ask the wallet only to sign a payload.
That separation is why you can swap RPC providers without touching the wallet
code.
:::

## Hardware wallets

Ledger devices use the same flow as the software extensions, *as long as* you
go through a wallet that talks to the device (Talisman and the Polkadot.js
extension both do). The signer object you get back signs by prompting the
user on the Ledger screen; your code doesn't change.

To talk to a Ledger directly without an extension, see
`@polkadot-api/signer-ledger`. Avoid unless you have a specific reason.

## WalletConnect

For mobile signers (Nova Wallet, future Talisman mobile), WalletConnect is
the bridge. Polkadot has a working WalletConnect v2 namespace (`polkadot:*`):

```ts
import SignClient from '@walletconnect/sign-client';

const client = await SignClient.init({
  projectId: 'your-wc-project-id',
  metadata: { name: 'my-dapp', description: '...', url: '...', icons: [] },
});

const { uri, approval } = await client.connect({
  requiredNamespaces: {
    polkadot: {
      // CAIP-13 chain ID: `polkadot:` + first 16 bytes of the chain's genesis hash.
      // `91b171bb158e2d3848fa23a9f1c25182` is the Polkadot relay chain.
      // For Asset Hub Polkadot use `68d56f15f85d3136970ec16946040bc1`,
      // for Kusama relay `b0a8d493285c2df73290dfb7e61f870f`, etc.
      chains: ['polkadot:91b171bb158e2d3848fa23a9f1c25182'],
      methods: ['polkadot_signTransaction', 'polkadot_signMessage'],
      events: [],
    },
  },
});

// Show the URI as a QR code; await approval.
const session = await approval();
```

The signed payload comes back as a hex string you wrap into a PAPI
`CustomSigner`. Reference implementation:
[walletconnect-monorepo](https://github.com/WalletConnect/walletconnect-monorepo).

## UI library pointers

You'll likely want a "Connect wallet" button rather than rolling the
discovery flow yourself. Pointers:

- **[`@reactive-dot/react`](https://github.com/buffed-labs/reactive-dot)**:
  React hooks with wallet integration baked in. The recommended path for
  React dApps.
- **[Polkadot Cloud / `@polkadot-cloud/react`](https://github.com/polkadot-cloud/polkadot-cloud)**:
  the most opinionated, ships theming and account selection UI. Used by
  Polkadot Staking Dashboard.
- **[Dotconnect](https://github.com/buildwithtango/dotconnect)**:
  RainbowKit-style modal for Polkadot wallets.
- **`@talismn/connect-wallets`**: minimal, wallet-discovery only.

For Solid / Vue / Svelte the React libraries above don't help; wrap the
PAPI calls on this page in your own components in 40 lines.

## Common errors

:::warning
**`No accounts available`**
The user dismissed the permission prompt, or they have the extension installed
but no accounts in it. Either way, treat it as "not connected"; don't
error-toast.

**`Extension not found`**
The user disabled the wallet extension after `connectInjectedExtension`.
Re-run `getInjectedExtensions()` and prompt them to re-authorise.

**`User rejected the request`**
The user clicked "Reject" in the wallet popup. Treat as a normal flow exit,
not an error; toast nothing.

**Signer signs but the chain rejects with `BadProof`**
You're signing for the wrong chain. Check that the genesis hash in your
signed payload matches the chain your client is connected to. Easy to get
wrong when switching between Polkadot and Paseo.
:::

## Next

- **[PAPI](/build/connect/papi)**: full signer documentation.
- **[reactive-dot](/build/connect/reactive-dot)**: the React-hook wrapping of
  these flows.
- **[Endpoints](/endpoints)**: chain URLs to point the signer at.
- **[EVM on Asset Hub](/build/evm/overview)**: for the EVM-side wallet flow
  (MetaMask, Rabby).
