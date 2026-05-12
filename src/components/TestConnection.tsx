import { createSignal, Show } from 'solid-js';
import { probeEvm, probeSubstrate, type EvmProbe, type SubstrateProbe } from '@/utils/rpc';
import { dohResolveBoth } from '@/utils/geo';
import { useNetworkSnapshot } from '@/data/network';

/**
 * Inline "test the endpoint" widget. Click → probes the endpoint, displays the
 * block number plus end-to-end roundtrip time, then expands to show the node
 * software version, chain name, peer count, and the IBP operator that GeoDNS
 * routed the request to. Lazy on purpose — we don't open 28 sockets on page
 * load. One per click, one shot, dispose.
 *
 * Transport depends on the service:
 *   - `substrate` (the default): WebSocket, batch of (chain_getHeader,
 *     system_version, system_chain, system_name, system_health).
 *   - `evm`: WebSocket, batch of (eth_blockNumber, web3_clientVersion,
 *     net_peerCount, eth_chainId). Asset Hub's EVM RPC speaks Ethereum
 *     JSON-RPC, not Substrate.
 *
 * The probe runs as a single batched WS open: opens, fires all requests,
 * collects results indexed by id, closes. In parallel, a DoH lookup resolves
 * the hostname to an IP and we match that against the canonical member list
 * to surface the routed-to operator. Browser WebSockets don't expose the
 * remote IP, so DoH is the cleanest way to identify the operator the user
 * is actually talking to — same approach as the global RoutedTo widget.
 */
type Result =
  | { kind: 'substrate'; probe: SubstrateProbe; ms: number }
  | { kind: 'evm'; probe: EvmProbe; ms: number };

type Provider = {
  name: string;
  region?: string;
  ip: string;
  family: 'ipv4' | 'ipv6';
};

type State =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'ok'; result: Result; provider: Provider | null }
  | { kind: 'fail' };

function shortVersion(v: string | null): string | null {
  if (!v) return null;
  return v.split(/[-+]/, 2)[0] ?? v;
}

function shortClient(v: string | null): string | null {
  if (!v) return null;
  const parts = v.split('/');
  if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
  return v;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

/** First three octets of an IPv4 — proxy for /24 subnet membership. */
function sameIpv4Slash24(a: string, b: string): boolean {
  const an = a.split('.');
  const bn = b.split('.');
  if (an.length !== 4 || bn.length !== 4) return false;
  return an[0] === bn[0] && an[1] === bn[1] && an[2] === bn[2];
}

/**
 * Compare two IPv6 addresses by the leading `bits` bits. Used to match
 * operator allocations at /48 (the smallest practical chunk per BCP38) when
 * the canonical anchor IP and the actual host IP differ inside the same
 * allocation.
 */
function samePrefix(a: string, b: string, bits: number): boolean {
  const aw = expandIpv6(a);
  const bw = expandIpv6(b);
  if (!aw || !bw) return false;
  const groups = Math.floor(bits / 16);
  const rem = bits % 16;
  for (let i = 0; i < groups; i++) if (aw[i] !== bw[i]) return false;
  if (rem === 0) return true;
  const mask = (0xffff << (16 - rem)) & 0xffff;
  return (parseInt(aw[groups], 16) & mask) === (parseInt(bw[groups], 16) & mask);
}

/** Expand an IPv6 address (with or without ::) to its 8 16-bit groups. */
function expandIpv6(ip: string): string[] | null {
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = 8 - head.length - tail.length;
  if (fill < 0) return null;
  return [...head, ...Array(fill).fill('0'), ...tail].map((g) => g.padStart(4, '0'));
}

export default function TestConnection(props: { url: string; kind?: 'substrate' | 'evm' }) {
  const [state, setState] = createSignal<State>({ kind: 'idle' });
  const snapshot = useNetworkSnapshot();

  async function detectProvider(): Promise<Provider | null> {
    const host = hostnameOf(props.url);
    if (!host) return null;
    const rec = await dohResolveBoth(host);
    if (!rec) return null;
    const snap = snapshot();
    if (!snap) return { name: '', ip: rec.ip, family: rec.family };
    // Match the canonical ServiceIPv4/v6 exactly first, then fall back to
    // subnet match: each operator's dotters pool and ibp pool often live on
    // different hosts within the same /24 (IPv4) or /48 (IPv6) — the canonical
    // config only lists one anchor IP per member, so without the subnet
    // fallback the ibp-pool endpoint reads as "unknown · <real IP>".
    const exact = snap.members.find((mem) =>
      rec.family === 'ipv6' ? mem.ipv6 === rec.ip : mem.ipv4 === rec.ip,
    );
    const m = exact ?? snap.members.find((mem) => {
      if (rec.family === 'ipv6') return mem.ipv6 && samePrefix(mem.ipv6, rec.ip, 48);
      return mem.ipv4 && sameIpv4Slash24(mem.ipv4, rec.ip);
    });
    return {
      name: m?.name ?? '',
      region: m?.region,
      ip: rec.ip,
      family: rec.family,
    };
  }

  const probe = async () => {
    if (state().kind === 'pending') return;
    setState({ kind: 'pending' });
    const t0 = performance.now();
    const providerPromise = detectProvider();
    if (props.kind === 'evm') {
      const [p, provider] = await Promise.all([probeEvm(props.url), providerPromise]);
      const ms = Math.round(performance.now() - t0);
      if (p) setState({ kind: 'ok', result: { kind: 'evm', probe: p, ms }, provider });
      else setState({ kind: 'fail' });
      return;
    }
    const [p, provider] = await Promise.all([probeSubstrate(props.url), providerPromise]);
    const ms = Math.round(performance.now() - t0);
    if (p) setState({ kind: 'ok', result: { kind: 'substrate', probe: p, ms }, provider });
    else setState({ kind: 'fail' });
  };

  return (
    <div class="inline-flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={probe}
        class="inline-flex items-center gap-2 h-7 px-3 rounded border border-ink-500 bg-ink-800/60 text-[11px] uppercase tracking-wider transition-colors hover:border-cyan focus:border-cyan focus:outline-none"
        classList={{
          'text-paper-muted hover:text-paper': state().kind === 'idle',
          'text-paper-dim': state().kind === 'pending',
          'text-cyan border-cyan/40': state().kind === 'ok',
          'text-pink-300 border-pink/40': state().kind === 'fail',
        }}
        aria-label="Open a WebSocket to this endpoint, read the latest block, report node version, and identify the routed-to operator"
      >
        <Show when={state().kind === 'idle'}>
          <span class="i-mdi-flash text-sm" /> Test
        </Show>
        <Show when={state().kind === 'pending'}>
          <span class="i-mdi-flash text-sm animate-pulse" /> Probing…
        </Show>
        <Show when={state().kind === 'ok'}>
          {(() => {
            const s = state() as Extract<State, { kind: 'ok' }>;
            return (
              <>
                <span class="i-mdi-check-circle text-sm" />
                <span class="tabular-nums normal-case tracking-normal">
                  #{s.result.probe.number.toLocaleString()} · {s.result.ms} ms
                </span>
              </>
            );
          })()}
        </Show>
        <Show when={state().kind === 'fail'}>
          <span class="i-mdi-close-circle text-sm" /> No response
        </Show>
      </button>

      <Show when={state().kind === 'ok'}>
        {(() => {
          const s = state() as Extract<State, { kind: 'ok' }>;
          const provider = s.provider;
          const Common = () => (
            <Show when={provider}>
              <dt class="text-paper-muted">routed to</dt>
              <dd class="text-paper truncate" title={`${provider!.ip} (${provider!.family.toUpperCase()})`}>
                <Show when={provider!.name} fallback={<span class="text-paper-dim">unknown · {provider!.ip}</span>}>
                  {provider!.name}
                  <Show when={provider!.region}>
                    <span class="text-paper-dim"> · {provider!.region}</span>
                  </Show>
                </Show>
              </dd>
            </Show>
          );

          if (s.result.kind === 'substrate') {
            const p = s.result.probe;
            const ver = shortVersion(p.version);
            return (
              <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[10.5px] leading-snug font-mono text-paper-dim normal-case tracking-normal">
                <Common />
                <Show when={p.chain || p.nodeName}>
                  <dt class="text-paper-muted">chain</dt>
                  <dd class="text-paper truncate" title={`${p.chain ?? ''}${p.nodeName ? ` (${p.nodeName})` : ''}`}>
                    {p.chain ?? p.nodeName}
                  </dd>
                </Show>
                <Show when={ver}>
                  <dt class="text-paper-muted">version</dt>
                  <dd class="text-paper truncate" title={p.version ?? ''}>v{ver}</dd>
                </Show>
                <Show when={p.peers != null}>
                  <dt class="text-paper-muted">peers</dt>
                  <dd class="text-paper tabular-nums">
                    {p.peers}
                    <Show when={p.syncing === true}>
                      <span class="text-pink-300"> · syncing</span>
                    </Show>
                    <Show when={p.syncing === false}>
                      <span class="text-cyan"> · in sync</span>
                    </Show>
                  </dd>
                </Show>
              </dl>
            );
          }
          const p = s.result.probe;
          const client = shortClient(p.client);
          return (
            <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[10.5px] leading-snug font-mono text-paper-dim normal-case tracking-normal">
              <Common />
              <Show when={client}>
                <dt class="text-paper-muted">client</dt>
                <dd class="text-paper truncate" title={p.client ?? ''}>{client}</dd>
              </Show>
              <Show when={p.chainId != null}>
                <dt class="text-paper-muted">chain id</dt>
                <dd class="text-paper tabular-nums">{p.chainId}</dd>
              </Show>
              <Show when={p.peers != null}>
                <dt class="text-paper-muted">peers</dt>
                <dd class="text-paper tabular-nums">{p.peers}</dd>
              </Show>
            </dl>
          );
        })()}
      </Show>
    </div>
  );
}
