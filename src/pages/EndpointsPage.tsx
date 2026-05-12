import { createMemo, createSignal, For, Show, Suspense } from 'solid-js';
import { A } from '@solidjs/router';
import CopyableEndpoint from '@/components/CopyableEndpoint';
import RoutedTo from '@/components/RoutedTo';
import TestConnection from '@/components/TestConnection';
import { useDocMeta } from '@/utils/title';
import {
  ecosystemLabel,
  useNetworkSnapshot,
  type Bootnode,
  type Network,
} from '@/data/network';

const ecosystems: Network['ecosystem'][] = ['polkadot', 'kusama', 'paseo'];

type Protocol = 'wss' | 'https';

function toProtocol(url: string, target: Protocol): string {
  if (!url) return url;
  return url.replace(/^wss?:/, target === 'wss' ? 'wss:' : 'https:').replace(/^https?:/, target === 'https' ? 'https:' : 'wss:');
}

function BootnodeDetails(props: { list: Bootnode[]; chainSpecUrl?: string; chainSpecRawUrl?: string }) {
  return (
    <Show when={props.list.length > 0 || props.chainSpecRawUrl}>
      <details class="mt-3 border-t border-ink-600 pt-3 group">
        <summary class="cursor-pointer list-none flex items-center justify-between text-left">
          <span class="text-xs font-medium uppercase tracking-wider text-paper-dim group-hover:text-paper transition-colors">
            <span class="text-cyan">Trustless access</span>
            <span class="ml-2 normal-case tracking-normal">(light client or self-hosted)</span>
          </span>
          <span class="i-mdi-chevron-down text-paper-dim transition-transform group-open:rotate-180" />
        </summary>
        <div class="mt-4 space-y-5">
          {/* Smoldot path — primary, lightweight */}
          <Show when={props.chainSpecRawUrl}>
            <div>
              <div class="flex items-center gap-2 mb-2">
                <span class="i-mdi-flash text-cyan" />
                <span class="text-[11px] uppercase tracking-wider font-medium text-paper">
                  Smoldot light client
                </span>
                <span class="ml-auto text-[10px] uppercase tracking-wider text-cyan">
                  recommended
                </span>
              </div>
              <CopyableEndpoint url={props.chainSpecRawUrl!} label="Chain spec" />
              <p class="mt-2 text-[11px] text-paper-dim leading-relaxed">
                Pass this URL to smoldot's <code class="font-mono text-paper">chainSpec</code>{' '}
                config. Bootnodes are baked into the spec; nothing else to wire.
                <Show when={props.chainSpecUrl}>
                  {' '}
                  <a
                    href={props.chainSpecUrl!}
                    target="_blank"
                    rel="noreferrer"
                    class="text-cyan hover:text-magenta inline-flex items-center gap-1 transition-colors"
                  >
                    View on GitHub <span class="i-mdi-arrow-top-right" />
                  </a>
                </Show>
              </p>
            </div>
          </Show>

          {/* Bootnodes — for self-hosted full nodes */}
          <Show when={props.list.length > 0}>
            <div>
              <div class="flex items-center gap-2 mb-2">
                <span class="i-mdi-server text-cyan" />
                <span class="text-[11px] uppercase tracking-wider font-medium text-paper">
                  Bootnodes for full nodes
                </span>
                <span class="ml-auto text-[10px] uppercase tracking-wider text-paper-dim">
                  {props.list.length} peers
                </span>
              </div>
              <div class="flex flex-col gap-1.5">
                <For each={props.list}>
                  {(b) => (
                    <CopyableEndpoint
                      url={b.multiaddr}
                      label={`${b.member} · ${b.transport.toUpperCase()}`}
                    />
                  )}
                </For>
              </div>
              <p class="mt-2 text-[11px] text-paper-dim leading-relaxed">
                Pass these to <code class="font-mono text-paper">--bootnodes</code> when starting
                your node binary. Multiple addresses are allowed.
              </p>
            </div>
          </Show>
        </div>
      </details>
    </Show>
  );
}

/**
 * Canonical URL form: prefer the hyphenated subdomain for both pools
 *   (e.g. wss://bridge-hub-paseo.ibp.network — works on both pools).
 * Subpath forms in the upstream config use inconsistent naming for some
 * chains (e.g. `sys.ibp.network/bridgehub-paseo` lacks the hyphen and 404s
 * even though the subdomain version works), so the subdomain is the safe
 * default. Subpath kept as a fallback when no subdomain is configured.
 */
function ProviderColumn(props: {
  label: string;
  provider: 'Dotters' | 'Ibp';
  urls: { subdomain: string; subpath?: string };
  protocol: Protocol;
  serviceType: 'RPC' | 'ETHRPC';
}) {
  const preferredHost = () => props.urls.subdomain || props.urls.subpath;
  const url = () => {
    const p = preferredHost();
    return p ? toProtocol(p, props.protocol) : '';
  };
  // Test transport is fixed regardless of the user's WSS/HTTPS toggle:
  //   - Substrate RPC: WSS + chain_getHeader
  //   - Asset Hub EVM: WSS + eth_blockNumber (HTTPS would work as JSON-RPC,
  //     but the EVM endpoint's CORS preflight is broken, so browser fetch()
  //     is blocked — WSS skips CORS entirely)
  const isEvm = () => props.serviceType === 'ETHRPC';
  const testUrl = () => {
    const p = preferredHost();
    return p ? toProtocol(p, 'wss') : '';
  };
  return (
    <div class="flex-1 min-w-0 flex flex-col gap-1.5">
      <div class="flex items-center gap-2">
        <span class="i-mdi-server-network text-brand-300 text-sm" />
        <h4 class="text-[11px] font-medium uppercase tracking-wider text-paper-muted">
          {props.label}
        </h4>
      </div>
      <Show when={url()}>
        <CopyableEndpoint url={url()} />
        <div class="mt-1">
          <TestConnection url={testUrl()} kind={isEvm() ? 'evm' : 'substrate'} />
        </div>
      </Show>
    </div>
  );
}

function NetworkCard(props: {
  network: Network;
  bootnodes: Bootnode[];
  protocol: Protocol;
}) {
  return (
    <article class="card flex flex-col gap-4">
      <header class="flex items-start justify-between gap-3">
        <div class="flex items-start gap-3 min-w-0">
          <img
            src={props.network.logoUrl}
            alt=""
            class="w-10 h-10 rounded object-contain bg-ink-800 p-1 shrink-0"
            referrerpolicy="no-referrer"
            loading="lazy"
            onError={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = 'hidden')}
          />
          <div class="min-w-0">
            <h3 class="font-display font-bold text-lg leading-tight">
              {props.network.displayName}
            </h3>
            <Show when={props.network.description}>
              <p class="mt-1 text-xs text-paper-muted line-clamp-2">
                {props.network.description}
              </p>
            </Show>
            <Show when={props.network.infoUrl}>
              <a
                href={props.network.infoUrl}
                target="_blank"
                rel="noreferrer"
                class="mt-1 inline-flex items-center gap-1 text-[11px] text-cyan hover:text-magenta transition-colors"
              >
                Learn more <span class="i-mdi-arrow-top-right" />
              </a>
            </Show>
          </div>
        </div>
        <div class="flex flex-col items-end gap-1 shrink-0 text-[10px] uppercase tracking-wider">
          <Show
            when={props.network.type === 'Relay'}
            fallback={<span class="text-cyan">{props.network.type}</span>}
          >
            <span class="px-2 py-0.5 rounded border border-pink/40 bg-pink/10 text-pink-300">
              Relay
            </span>
          </Show>
          <Show when={props.network.serviceType === 'ETHRPC'}>
            <span class="text-magenta">ETH-RPC</span>
          </Show>
        </div>
      </header>

      <div class="grid sm:grid-cols-2 gap-4">
        <ProviderColumn
          label="Dotters pool"
          provider="Dotters"
          urls={props.network.providers.Dotters}
          protocol={props.protocol}
          serviceType={props.network.serviceType}
        />
        <ProviderColumn
          label="IBP pool"
          provider="Ibp"
          urls={props.network.providers.Ibp}
          protocol={props.protocol}
          serviceType={props.network.serviceType}
        />
      </div>

      <BootnodeDetails
        list={props.bootnodes}
        chainSpecUrl={props.network.chainSpecUrl}
        chainSpecRawUrl={props.network.chainSpecRawUrl}
      />
    </article>
  );
}

export default function EndpointsPage() {
  useDocMeta({
    title: 'Endpoints',
    description:
      'Public WSS and HTTPS endpoints for Polkadot, Kusama, and every Asset Hub. Two GeoDNS pools (dotters.network, ibp.network), bootnodes for trustless smoldot sync, no keys, no rate limits.',
  });
  const snapshot = useNetworkSnapshot();
  const [filter, setFilter] = createSignal('');
  const [protocol, setProtocol] = createSignal<Protocol>('wss');

  const filtered = createMemo(() => {
    const snap = snapshot();
    if (!snap) return [] as Network[];
    const q = filter().trim().toLowerCase();
    if (!q) return snap.networks;
    return snap.networks.filter(
      (n) =>
        n.displayName.toLowerCase().includes(q) ||
        n.id.toLowerCase().includes(q) ||
        n.commandId.includes(q),
    );
  });

  // Memoized grouping — single pass per filter change instead of N×ecosystems.
  const grouped = createMemo(() => {
    const result: Record<Network['ecosystem'], Network[]> = {
      polkadot: [],
      kusama: [],
      paseo: [],
    };
    for (const n of filtered()) result[n.ecosystem].push(n);
    return result;
  });

  return (
    <section class="section">
      <div class="container-page">
        <p class="eyebrow mb-3">Public endpoints</p>
        <h1 class="h-display text-4xl md:text-5xl max-w-3xl">
          Connect to <span class="cosmic-text">Polkadot</span>.
        </h1>
        <p class="mt-6 max-w-2xl text-lg text-paper-muted leading-relaxed">
          Two redundant GeoDNS pools (<code class="text-cyan">dotters.network</code> and{' '}
          <code class="text-cyan">ibp.network</code>), each routing to the operator
          closest to you. Pick one as primary, the other as failover. For trustless
          access, run a <span class="text-paper">smoldot light client</span> against the
          chain spec; no IBP server in the critical path.
        </p>

        {/* Quick-copy hero — the dominant use case is "I want Asset Hub Polkadot".
            Surface it above the fold so consumers don't have to skim the chain
            list. The full list below remains for everything else. */}
        <div class="mt-8 max-w-2xl rounded-xl border border-ink-600 bg-ink-900/40 p-5">
          <div class="mb-3 text-[11px] uppercase tracking-[0.24em] text-paper-dim">
            Quick connect: Asset Hub Polkadot
          </div>
          <CopyableEndpoint
            url="wss://asset-hub-polkadot.dotters.network"
            label="Asset Hub Polkadot"
          />
          <p class="mt-3 text-xs text-paper-dim leading-relaxed">
            Balances, NFTs, USDT/USDC, EVM contracts, and most dApps live on Asset Hub.
            The relay chain is at the bottom of each ecosystem; you only need it if you're
            running a validator or collator.
          </p>
        </div>

        <div class="mt-8">
          <RoutedTo variant="panel" />
        </div>

        <div class="mt-8 grid sm:grid-cols-3 gap-3 max-w-4xl">
          <div class="card p-4">
            <div class="flex items-center gap-2">
              <span class="i-mdi-lightning-bolt text-cyan" />
              <h3 class="font-medium text-sm">Hosted RPC</h3>
              <span class="ml-auto text-[10px] uppercase tracking-wider text-paper-dim">fast</span>
            </div>
            <p class="mt-2 text-xs text-paper-muted">
              Paste a WSS URL into your wallet, dApp, or indexer. Geo-routed to the
              lowest-latency operator. No sign-up.
            </p>
          </div>
          <div class="card p-4 relative overflow-hidden">
            <span
              class="absolute inset-x-0 top-0 h-px"
              style={{ background: 'linear-gradient(90deg, #00d0ff 0%, #f502ff 100%)' }}
              aria-hidden
            />
            <div class="flex items-center gap-2">
              <span class="i-mdi-flash text-cyan" />
              <h3 class="font-medium text-sm">Smoldot light client</h3>
              <span class="ml-auto text-[10px] uppercase tracking-wider text-cyan">
                trustless
              </span>
            </div>
            <p class="mt-2 text-xs text-paper-muted">
              Run a verifying browser-side light client. It needs the chain spec;
              bootnodes are baked in.
            </p>
            <a
              href="https://github.com/paritytech/smoldot"
              target="_blank"
              rel="noreferrer"
              class="mt-3 inline-flex items-center gap-1 text-[11px] text-cyan hover:text-magenta transition-colors"
            >
              paritytech/smoldot <span class="i-mdi-arrow-top-right" />
            </a>
          </div>
          <div class="card p-4">
            <div class="flex items-center gap-2">
              <span class="i-mdi-server text-cyan" />
              <h3 class="font-medium text-sm">Full node</h3>
              <span class="ml-auto text-[10px] uppercase tracking-wider text-paper-dim">sovereign</span>
            </div>
            <p class="mt-2 text-xs text-paper-muted">
              Sync a full node with <code class="text-paper">--chain</code>, optionally
              pinning IBP bootnodes per chain.
            </p>
          </div>
        </div>

        <div class="mt-10 flex flex-wrap items-center gap-3">
          <div class="inline-flex rounded border border-ink-600 overflow-hidden">
            <button
              type="button"
              class="px-4 py-2 text-sm transition-colors"
              classList={{
                'bg-brand text-white': protocol() === 'wss',
                'text-paper-muted hover:text-paper': protocol() !== 'wss',
              }}
              onClick={() => setProtocol('wss')}
              aria-pressed={protocol() === 'wss'}
            >
              WebSocket
            </button>
            <button
              type="button"
              class="px-4 py-2 text-sm transition-colors border-l border-ink-600"
              classList={{
                'bg-brand text-white': protocol() === 'https',
                'text-paper-muted hover:text-paper': protocol() !== 'https',
              }}
              onClick={() => setProtocol('https')}
              aria-pressed={protocol() === 'https'}
            >
              HTTPS
            </button>
          </div>
          <label class="flex-1 min-w-[200px] max-w-md flex items-center gap-2 px-3 py-2 rounded border border-ink-600 focus-within:border-brand transition-colors">
            <span class="i-mdi-magnify text-paper-dim" />
            <input
              type="search"
              placeholder="Filter chains…"
              value={filter()}
              onInput={(e) => setFilter(e.currentTarget.value)}
              class="flex-1 bg-transparent text-sm placeholder:text-paper-dim outline-none"
              aria-label="Filter chains"
            />
          </label>
          <Show when={snapshot()?.fetchedAt}>
            <span class="text-[11px] text-paper-dim">
              Live from <a href="https://github.com/ibp-network/config" target="_blank" rel="noreferrer" class="underline hover:text-paper">ibp-network/config</a>
            </span>
          </Show>
        </div>

        <Suspense
          fallback={
            <div class="mt-16 space-y-4">
              <div class="h-8 w-48 bg-ink-700 rounded animate-pulse" />
              <div class="grid gap-4 md:grid-cols-2">
                <For each={[1, 2, 3, 4]}>
                  {() => <div class="h-44 bg-ink-700/50 rounded-lg animate-pulse" />}
                </For>
              </div>
            </div>
          }
        >
          <Show
            when={snapshot.error}
            fallback={
              <Show
                when={filtered().length > 0}
                fallback={
                  <p class="mt-16 text-paper-dim">No chains match "{filter()}".</p>
                }
              >
                <For each={ecosystems}>
                  {(eco) => {
                    // Memoize so the parachain/relay split runs once per
                    // ecosystem per filter-text change, not on every JSX
                    // read. Show + For + Show below reads each three times;
                    // without memo that's six .filter() passes per ecosystem
                    // per keystroke.
                    const all = createMemo(() => grouped()[eco]);
                    const parachains = createMemo(() => all().filter((n) => n.type !== 'Relay'));
                    const relay = createMemo(() => all().filter((n) => n.type === 'Relay'));
                    return (
                      <Show when={all().length > 0}>
                        <div class="mt-16 mb-6">
                          <h2 class="h-display text-2xl md:text-3xl">
                            {ecosystemLabel[eco]}
                            <span class="ml-3 text-sm text-paper-dim font-normal">
                              {all().length} chains
                            </span>
                          </h2>
                          <Show when={eco !== 'paseo'}>
                            <p class="mt-2 text-sm text-paper-dim max-w-3xl">
                              Asset Hub carries the user-facing state (balances, assets, NFTs,
                              dApps). The relay chain is consensus-only.
                            </p>
                          </Show>
                        </div>
                        <div class="grid gap-4 md:grid-cols-2">
                          <For each={parachains()}>
                            {(n) => (
                              <NetworkCard
                                network={n}
                                bootnodes={snapshot()?.bootnodesByChain[n.commandId] ?? []}
                                protocol={protocol()}
                              />
                            )}
                          </For>
                        </div>
                        <Show when={relay().length > 0}>
                          <p class="mt-12 mb-4 text-xs text-paper-dim max-w-3xl">
                            Below: the relay chain. Connect directly only if you run a
                            validator or a parachain collator. Wallets, dApps, and indexers
                            want Asset Hub.
                          </p>
                          <div class="grid gap-4 md:grid-cols-2">
                            <For each={relay()}>
                              {(n) => (
                                <NetworkCard
                                  network={n}
                                  bootnodes={snapshot()?.bootnodesByChain[n.commandId] ?? []}
                                  protocol={protocol()}
                                />
                              )}
                            </For>
                          </div>
                        </Show>
                      </Show>
                    );
                  }}
                </For>
              </Show>
            }
          >
            <div class="mt-16 card border-cosmos-magenta/40">
              <h3 class="font-display font-bold text-lg">Couldn't load endpoint list</h3>
              <p class="mt-2 text-sm text-paper-muted">
                Fetch failed for the canonical config at{' '}
                <a class="underline" href="https://github.com/ibp-network/config" target="_blank" rel="noreferrer">
                  github.com/ibp-network/config
                </a>
                . Refresh, or check your network.
              </p>
              <p class="mt-2 text-xs text-paper-dim font-mono">
                {String(snapshot.error)}
              </p>
            </div>
          </Show>
        </Suspense>

        {/* ─────── Using the endpoints — four paths, one card each ─────── */}
        <section class="mt-24">
          <div class="eyebrow mb-3">Four ways in</div>
          <h2 class="h-display text-3xl md:text-5xl lg:text-[64px] max-w-3xl">
            Use the endpoints <span class="cosmic-text">your way</span>.
          </h2>
          <p class="mt-5 max-w-2xl text-paper-muted">
            From "paste a URL" to "run your own node". All four point at the same
            GeoDNS-routed pool, so latency stays under 50&nbsp;ms wherever you are.
          </p>

          <div class="mt-10 grid gap-5 md:grid-cols-2">
            {/* 1. Wallet / dApp */}
            <div class="card">
              <div class="flex items-center gap-3 mb-3">
                <span class="i-mdi-wallet-outline text-2xl text-cyan" />
                <h3 class="font-display text-xl font-light">Wallet or block explorer</h3>
              </div>
              <p class="text-sm text-paper-muted leading-relaxed">
                Paste a WSS URL into Talisman, Nova, SubWallet, Polkadot.js
                Apps, or Subsquare. GeoDNS routes you to the closest healthy
                operator. No extension config needed.
              </p>
              <div class="mt-4">
                <CopyableEndpoint
                  url="wss://asset-hub-polkadot.dotters.network"
                  label="Asset Hub"
                />
              </div>
            </div>

            {/* 2. Code — PAPI v2 */}
            <div class="card">
              <div class="flex items-center gap-3 mb-3">
                <span class="i-mdi-language-typescript text-2xl text-cyan" />
                <h3 class="font-display text-xl font-light">In code</h3>
                <span class="ml-auto text-[10px] uppercase tracking-wider text-paper-dim">
                  PAPI&nbsp;v2
                </span>
              </div>
              <p class="text-sm text-paper-muted leading-relaxed mb-3">
                One line to a typed client. See the{' '}
                <A href="/build/start/quickstart" class="text-cyan hover:text-magenta">
                  quickstart
                </A>{' '}
                for descriptor generation.
              </p>
              <pre class="p-3 rounded bg-ink-950 border border-ink-700 overflow-x-auto text-xs leading-relaxed"><code>{`import { createWsClient } from 'polkadot-api/ws';
import { ahp } from '@polkadot-api/descriptors';

const client = createWsClient(
  'wss://asset-hub-polkadot.dotters.network',
);
const api = client.getTypedApi(ahp);`}</code></pre>
            </div>

            {/* 3. Light client — smoldot */}
            <div class="card">
              <div class="flex items-center gap-3 mb-3">
                <span class="i-mdi-flash text-2xl text-cyan" />
                <h3 class="font-display text-xl font-light">Light client</h3>
                <span class="ml-auto text-[10px] uppercase tracking-wider text-cyan">
                  trustless
                </span>
              </div>
              <p class="text-sm text-paper-muted leading-relaxed">
                Run a verifying smoldot client in the user's browser. Bootnodes
                are baked into the official Polkadot chain specs, and IBP addresses
                are already among the seed peers, so there's no hosted RPC in
                the path.
              </p>
              <A
                href="/build/light-client/smoldot"
                class="mt-4 inline-flex items-center gap-1 text-sm text-cyan hover:text-magenta transition-colors"
              >
                Smoldot guide <span class="i-mdi-arrow-top-right" />
              </A>
            </div>

            {/* 4. Self-hosted full node */}
            <div class="card">
              <div class="flex items-center gap-3 mb-3">
                <span class="i-mdi-server text-2xl text-cyan" />
                <h3 class="font-display text-xl font-light">Your own node</h3>
              </div>
              <p class="text-sm text-paper-muted leading-relaxed mb-3">
                Pass IBP bootnodes via <code class="font-mono text-paper text-xs">--bootnodes</code>{' '}
                to bootstrap from peers we already run. Per-chain multiaddrs are
                in the trustless drop-down on every card above.
              </p>
              <pre class="p-3 rounded bg-ink-950 border border-ink-700 overflow-x-auto text-xs leading-relaxed"><code>{`polkadot --chain polkadot \\
  --bootnodes "/dns/polkadot.boot.rotko.net\\
              /tcp/30333/wss/p2p/12D3KooW…"`}</code></pre>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
