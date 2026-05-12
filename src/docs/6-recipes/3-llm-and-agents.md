---
sidebar_position: 3
title: LLMs and AI agents
description: Use IBP endpoints from Claude, Cursor, AI agents and MCP servers. Public HTTPS / WSS, no keys, no auth, paste and go.
---

# LLMs and AI agents

The IBP's endpoints are public HTTPS / WSS with no auth, no API key, no rate-limit account. That suits the "LLM reads / writes chain data" space: Claude / GPT generating scripts, code-mode tools verifying their output, agents running long-lived queries, MCP servers wrapping chain access.

This page covers the patterns we've seen work, the failure modes you'll hit, and the prompt scaffolding that gets correct PAPI code on the first try.

## Why public RPC matters here

Every other approach to "let an AI talk to Polkadot" needs:
- An API key (auth flow, secret rotation, leaks).
- A rate-limit budget (the agent eats it in a loop the first time you give it `while not done`).
- A proxy or relay so the LLM doesn't see your key (now you're running infra).

IBP endpoints have none of that. The model gets a URL string. If it produces broken code, it retries until it works. If you run a fleet of agents, they each connect independently. Cost stays at zero.

## Pattern 1: ask Claude / GPT to write a script

The most common path: LLM generates a [PAPI](/build/connect/papi) snippet, you run it locally.

A working prompt template:

> Write a TypeScript script using `polkadot-api` v2 that:
> - Connects to `wss://asset-hub-polkadot.dotters.network` (the IBP Asset Hub Polkadot endpoint)
> - Uses the PAPI descriptor `ahp` from `@polkadot-api/descriptors` (assume `npx papi add ahp -n polkadot_asset_hub` has been run)
> - Reads the free balance of `5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY`
> - Streams new finalized blocks and prints number + hash for each
>
> Use `createWsClient` from `polkadot-api/ws` (not the deprecated `polkadot-api/ws-provider/web`). Use `await typedApi.query.System.Account.getValue(addr)` with no Codec wrappers. Print using `console.log`.

Why this prompt works: it pins the chain, the version (v2), the descriptor name, and explicitly excludes the deprecated import path. Without those hints, models trained pre-v2 will generate code with the old `getWsProvider` + `withPolkadotSdkCompat` shape.

:::tip Include a link to docs.polkadot.com when prompting
If the model is allowed to fetch URLs (Claude with `WebFetch`, Cursor with `@docs`), point it at <https://docs.polkadot.com> and our [/build](/build) at the top of the prompt. Output quality improves sharply when current docs are in context.
:::

## Pattern 2: MCP servers wrapping chain access

[Model Context Protocol](https://modelcontextprotocol.io) lets you expose chain queries as tools an LLM client (Claude Desktop, Claude Code, Cursor) can invoke directly. The agent doesn't write code; it calls `chain.getBalance({ address })` and gets back a number.

There's no single canonical Polkadot MCP server yet, but the shape is small. A 60-line MCP server using PAPI exposes:

```ts
// substrate-mcp.ts (sketch)
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createWsClient } from 'polkadot-api/ws';
import { ahp } from '@polkadot-api/descriptors';
import { z } from 'zod';

const client = createWsClient('wss://asset-hub-polkadot.dotters.network');
const api = client.getTypedApi(ahp);

const server = new McpServer({ name: 'asset-hub', version: '1.0.0' });

// McpServer.tool signature: (name, description, inputSchema, handler).
// `inputSchema` is a Zod shape; the SDK serialises it to JSON Schema for
// the LLM's tool-discovery surface.
server.tool(
  'get_balance',
  'Read the free balance of a Polkadot Asset Hub account.',
  { address: z.string() },
  async ({ address }) => {
    const acct = await api.query.System.Account.getValue(address);
    return { content: [{ type: 'text', text: String(acct.data.free) }] };
  },
);

server.tool(
  'get_block_number',
  'Current finalized block number on Asset Hub Polkadot.',
  {},
  async () => {
    const b = await client.getFinalizedBlock();
    return { content: [{ type: 'text', text: String(b.number) }] };
  },
);

await server.connect(new StdioServerTransport());
```

Wire it into Claude Desktop's `~/.config/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "asset-hub": {
      "command": "tsx",
      "args": ["/abs/path/to/substrate-mcp.ts"]
    }
  }
}
```

Now Claude can ask itself "what's the balance of 5Grwv… on Asset Hub Polkadot?" and get a real number, without you copy-pasting anything.

The same shape works for `signAndSubmit` if you're brave, but **do not** put a live signing key in an MCP tool. See the next section.

## Pattern 3: agents that read but never write blindly

If your agent loop ends with a signed extrinsic, **separate sign from broadcast**.

Safe shape:
1. Agent uses public IBP endpoint to read state and reason.
2. Agent produces an *unsigned call data hex* (PAPI: `tx.getEncodedData()`).
3. Human (or a separate non-LLM service) signs the hex with the actual key.
4. Broadcast happens through a known-good path: the same IBP endpoint, or your own node.

This way the LLM never touches private key material. A leaked agent prompt or prompt-injection can't drain wallets, only produce weird unsigned calls.

For Asset Hub specifically, `dev.papi.how` is good for the "human signs" step, since it shows the decoded call before the wallet prompt. Paste the call data hex, click sign, done.

## Pattern 4: code-mode tools (Claude Code, Cursor, Aider)

For LLMs that can *run* code in a sandbox (Claude Code, Cursor's agent mode, Aider, Continue.dev):

1. **Hand them the endpoint up front** in the system prompt or repo `AGENTS.md`:
   > `Default chain endpoint: wss://asset-hub-polkadot.dotters.network`
   > `PAPI v2 with the ahp descriptor.`

2. **Let them install `polkadot-api`** in a sandbox if they need it. The model can `npm i polkadot-api` and `npx papi add ahp -n polkadot_asset_hub` themselves.

3. **They can verify their own code** by running it. With a public endpoint and no rate limit, a single iteration costs nothing. The model can write, run, observe the output, iterate three times in seconds.

This is the pattern most likely to work without prompt engineering: a code-mode agent given an endpoint URL can write a snippet, run it, see the chain's response, and self-correct.

## Failure modes to expect

- **The model writes PAPI v1 by default.** Anything trained before mid-2025 thinks `getWsProvider` + `withPolkadotSdkCompat` is current. Pin v2 in the prompt. The PAPI migration guide at [papi.how](https://papi.how) is the canonical reference.
- **The model invents pallet calls that don't exist.** Asset Hub's `pallet-revive` (EVM) is recent; older models think `pallet-ethereum` or `pallet-evm`. Have it `--chain` against your actual metadata.
- **Hallucinated asset IDs.** USDT on Asset Hub Polkadot is `1984`. USDC is `1337`. Models guess. Tell them in the prompt.
- **Wrong SS58 prefix on addresses.** Polkadot is `0`, Kusama `2`, Paseo `0`, generic `42`. See [the SS58 prefix table](/build/start/quickstart#use-the-same-address-everywhere) and tell the model which network.
- **It tries to use the relay chain for end-user state.** Reading balances or assets from `wss://polkadot.dotters.network` returns relay-chain accounts, which are not what most apps want. Asset Hub is the consumer chain. State this in the prompt.

## A working system-prompt scaffold

Copy-paste into the system prompt of any chain-aware agent:

```
You are working with Polkadot. The user wants to interact with Asset Hub
Polkadot, which is the consumer chain for balances, native assets, and NFTs.
The relay chain (wss://polkadot.dotters.network) is validators-only; do not
read user balances from it.

Public RPC endpoints (no auth required):
  Asset Hub Polkadot:   wss://asset-hub-polkadot.dotters.network
  Asset Hub Kusama:     wss://asset-hub-kusama.dotters.network
  Asset Hub Paseo:      wss://asset-hub-paseo.dotters.network  (testnet)
  EVM, Asset Hub Polkadot:  https://eth-asset-hub-polkadot.dotters.network

Client libraries:
  - TypeScript / JS: polkadot-api v2 (PAPI). Use `createWsClient` from
    `polkadot-api/ws`, not the deprecated `getWsProvider` + `withPolkadotSdkCompat`.
    Descriptors are generated with `npx papi add <name> -n <network_id>`.
    Use `ahp` for Asset Hub Polkadot.
  - Rust: subxt. https://github.com/paritytech/subxt
  - EVM: viem or ethers v6. Asset Hub's EVM is PolkaVM-backed.

SS58 prefixes: Polkadot=0, Kusama=2, Paseo=0, Generic=42.

Common asset IDs on Asset Hub Polkadot: USDT=1984, USDC=1337.

For "sign + broadcast" flows, prefer producing the unsigned call data
hex (`tx.getEncodedData()`) and asking the user to sign it via
dev.papi.how. Do not handle private keys directly.

Docs: https://docs.polkadot.com (canonical Polkadot dev docs),
      https://papi.how (PAPI reference)
```

Verbose. It works.

## Next

- **[PAPI quickstart](/build/start/quickstart)**: the snippet the agent will be generating.
- **[Web explorers](/build/recipes/explorers)**: where to verify an agent's output before signing.
- **[Wallet connection](/build/recipes/wallet-connect)**: the human-signs side of the pattern-3 split.
- **[Endpoints](/endpoints)**: every URL the model might need, copyable.
