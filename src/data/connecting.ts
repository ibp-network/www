/**
 * "Connecting with …" snippets — actively-maintained Polkadot client
 * libraries only. We ship PAPI (TS, modern), Dedot (TS, light), reactive-dot
 * (React hooks over PAPI), subxt (Rust), and ethers.js (EVM). We don't
 * showcase polkadot-js/api anymore — it's effectively in maintenance mode;
 * new projects should use PAPI or Dedot.
 */

export type Library = {
  key: string;
  name: string;
  lang: 'ts' | 'js' | 'rust';
  /** Install command shown in a copyable box. */
  install: string;
  /** Source snippet. */
  code: string;
  /** Short note shown under the snippet. */
  note?: string;
  docsUrl?: string;
};

export const libraries: Library[] = [
  {
    key: 'papi',
    name: 'PAPI',
    lang: 'ts',
    install: 'npm i polkadot-api',
    code: `// First time? Generate descriptors for Asset Hub Polkadot:
//   npx papi add ahp -n polkadot_asset_hub && npx papi

import { createWsClient } from 'polkadot-api/ws';
import { ahp } from '@polkadot-api/descriptors';

// Asset Hub Polkadot — where balances, assets and NFTs live.
const client = createWsClient('wss://asset-hub-polkadot.dotters.network');

const api = client.getTypedApi(ahp);

// Read an account balance
const account = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const { data } = await api.query.System.Account.getValue(account);
console.log('Free balance:', data.free);

// Stream new finalized blocks
client.finalizedBlock$.subscribe((b) =>
  console.log('Finalized', b.number, b.hash.slice(0, 10)),
);`,
    note: 'Type-safe, light-client-friendly. Recommended for new projects.',
    docsUrl: 'https://papi.how',
  },
  {
    key: 'reactive-dot',
    name: 'reactive-dot',
    lang: 'ts',
    install: 'npm i @reactive-dot/core @reactive-dot/react polkadot-api',
    code: `// config.ts — defines chains + wallet providers
import { ahp } from '@polkadot-api/descriptors';
import { defineConfig } from '@reactive-dot/core';
import { InjectedWalletProvider } from '@reactive-dot/core/wallets.js';

export const config = defineConfig({
  chains: {
    asset_hub: {
      descriptor: ahp,
      provider: { type: 'ws', url: 'wss://asset-hub-polkadot.dotters.network' },
    },
  },
  wallets: [new InjectedWalletProvider()],
});

// App.tsx — wrap your tree, then call hooks anywhere inside
// import { ReactiveDotProvider, ChainProvider } from '@reactive-dot/react';
// <ReactiveDotProvider config={config}>
//   <ChainProvider chainId="asset_hub"><App /></ChainProvider>
// </ReactiveDotProvider>

// component.tsx
import { useLazyLoadQuery } from '@reactive-dot/react';

export function BlockInfo() {
  const [now] = useLazyLoadQuery((b) =>
    b.storage('Timestamp', 'Now'),
  );
  return <div>{new Date(Number(now)).toLocaleString()}</div>;
}`,
    note: 'React hooks over PAPI. Built by buffed-labs. `npx create-polkadot-dapp@latest` scaffolds a project.',
    docsUrl: 'https://github.com/buffed-labs/reactive-dot',
  },
  {
    key: 'dedot',
    name: 'Dedot',
    lang: 'ts',
    install: 'npm i dedot && npm i -D @dedot/codegen',
    code: `// Generate types from chain metadata first:
//   npx dedot typegen --wsUrl wss://asset-hub-polkadot.dotters.network \\
//                     --output ./src/dedot-types --chain ahp
import { DedotClient, WsProvider } from 'dedot';
import type { AhpApi } from './dedot-types/ahp';

// WsProvider here is Dedot's own — distinct from the legacy @polkadot/api one.
const client = await DedotClient.new<AhpApi>(
  new WsProvider('wss://asset-hub-polkadot.dotters.network'),
);

const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const account = await client.query.system.account(address);
console.log('Free:', account.data.free);    // bigint
console.log('Nonce:', account.nonce);       // number`,
    note: 'Tree-shakable, fully typed. Polkadot.js-shaped API for easier migration.',
    docsUrl: 'https://docs.dedot.dev',
  },
  {
    key: 'subxt',
    name: 'subxt (Rust)',
    lang: 'rust',
    install: 'cargo add subxt',
    code: `use subxt::{OnlineClient, PolkadotConfig};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let api = OnlineClient::<PolkadotConfig>::from_url(
        "wss://asset-hub-polkadot.dotters.network"
    ).await?;

    let latest = api.blocks().at_latest().await?;
    println!("Block #{}", latest.header().number);

    let mut sub = api.blocks().subscribe_finalized().await?;
    while let Some(block) = sub.next().await {
        let block = block?;
        println!("Finalized #{}", block.header().number);
    }
    Ok(())
}`,
    note: 'Idiomatic Rust client. Runtime metadata, statically typed pallets.',
    docsUrl: 'https://github.com/paritytech/subxt',
  },
  {
    key: 'viem',
    name: 'viem',
    lang: 'ts',
    install: 'npm i viem',
    code: `import { createPublicClient, http, defineChain } from 'viem';

// Asset Hub Polkadot, EVM-side (PolkaVM-backed)
const ahPolkadotEvm = defineChain({
  id: 0, // read at runtime via eth_chainId — don't hardcode for production
  name: 'Asset Hub Polkadot (EVM)',
  nativeCurrency: { name: 'DOT', symbol: 'DOT', decimals: 18 },
  rpcUrls: { default: { http: ['https://eth-asset-hub-polkadot.dotters.network'] } },
});

const client = createPublicClient({
  chain: ahPolkadotEvm,
  transport: http(),
});

// Block number
const block = await client.getBlockNumber();
console.log('Block:', block);

// Native balance of an EVM-style address
const balance = await client.getBalance({
  address: '0xCa1e02e2a3df56b53C7b73AF94De95edA01D8a9C',
});
console.log('Balance (wei):', balance);`,
    note: 'TypeScript-first EVM client. Recommended for new EVM dApps on Asset Hub.',
    docsUrl: 'https://viem.sh',
  },
  {
    key: 'ethers',
    name: 'ethers.js',
    lang: 'ts',
    install: 'npm i ethers',
    code: `import { JsonRpcProvider } from 'ethers';

// EVM-compatible endpoints, e.g. Asset Hub Polkadot
const provider = new JsonRpcProvider(
  'https://eth-asset-hub-polkadot.dotters.network',
);

const blockNumber = await provider.getBlockNumber();
console.log('Block:', blockNumber);

const balance = await provider.getBalance('0x…');
console.log('Balance (wei):', balance.toString());`,
    note: 'Asset Hub is the only IBP-served chain with EVM-compatible RPC. Use eth-asset-hub-polkadot.dotters.network (or .ibp.network).',
    docsUrl: 'https://docs.ethers.org',
  },
];
