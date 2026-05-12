/**
 * Browser-side bootnode liveness probe.
 *
 * Substrate bootnode multiaddrs look like
 *   /dns/bootnode.polkadot.dotters.network/tcp/30334/wss/p2p/12D3KooW...
 * For browsers the only reachable transport is /wss (no raw TCP, no QUIC).
 * We can't do a full libp2p Noise handshake from the browser (the libp2p
 * stack is not realistic to ship here), but we *can* verify the TLS +
 * WebSocket layer with `new WebSocket('wss://host:port')`. If the upgrade
 * succeeds, the host is at least listening on the right port with a valid
 * cert; the libp2p Noise mismatch then triggers an immediate close, which
 * we treat as 'up' (the network layer is healthy — that's what we care
 * about for the "is this bootnode reachable from this user's browser"
 * signal).
 *
 * Surface for operators: every failure goes to console.error so it shows
 * up in devtools when an operator visits /endpoints. Casual visitors see
 * a filtered list — only bootnodes their browser can reach.
 */

export type ProbeStatus = 'pending' | 'up' | 'down';

const PROBE_TIMEOUT_MS = 4500;

const cache = new Map<string, Promise<ProbeStatus>>();

/**
 * Convert a multiaddr to a `wss://host:port` URL, or `null` if the
 * multiaddr isn't browser-reachable. We accept /dns, /dns4, /dns6,
 * /ip4, /ip6 hosts and require both a /tcp/<port> segment and a /wss
 * segment somewhere in the chain.
 */
export function multiaddrToWss(addr: string): string | null {
  if (!addr.includes('/wss')) return null;
  const portMatch = addr.match(/\/tcp\/(\d+)/);
  if (!portMatch) return null;
  const host =
    addr.match(/^\/dns[46]?\/([^/]+)/)?.[1] ??
    addr.match(/^\/ip4\/([^/]+)/)?.[1] ??
    addr.match(/^\/ip6\/([^/]+)/)?.[1];
  if (!host) return null;
  return `wss://${host}:${portMatch[1]}`;
}

/**
 * Probe a single bootnode. Results are cached for the lifetime of the
 * page so re-renders / details-toggling don't re-fire the network probe.
 */
export function probeBootnode(multiaddr: string): Promise<ProbeStatus> {
  const cached = cache.get(multiaddr);
  if (cached) return cached;
  const result = probeOnce(multiaddr);
  cache.set(multiaddr, result);
  return result;
}

function probeOnce(multiaddr: string): Promise<ProbeStatus> {
  const url = multiaddrToWss(multiaddr);
  if (!url) {
    // TCP-only or QUIC-only — browser can't reach it. Not a server fault;
    // don't log noisy console errors. Treat as 'down' so we filter it out.
    return Promise.resolve('down');
  }
  return new Promise<ProbeStatus>((resolve) => {
    let resolved = false;
    let ws: WebSocket;
    const finish = (status: ProbeStatus, reason?: string) => {
      if (resolved) return;
      resolved = true;
      try {
        ws?.close();
      } catch {
        /* already closing */
      }
      if (status === 'down') {
        console.error(`[bootnode-probe] ${multiaddr} unreachable: ${reason ?? 'unknown'}`);
      }
      resolve(status);
    };
    try {
      ws = new WebSocket(url);
    } catch (e) {
      finish('down', `ctor threw: ${(e as Error).message}`);
      return;
    }
    const timer = setTimeout(() => finish('down', `timeout after ${PROBE_TIMEOUT_MS}ms`), PROBE_TIMEOUT_MS);
    ws.addEventListener('open', () => {
      clearTimeout(timer);
      finish('up');
    });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      // We can't distinguish "DNS NXDOMAIN" from "TLS error" from "connection
      // refused" — the browser deliberately hides that. The console.error
      // entry just says "unreachable" and the operator can verify with curl
      // or openssl s_client.
      finish('down', 'websocket error event');
    });
    ws.addEventListener('close', (ev) => {
      // If we already resolved (open fired first), this is fine. If the
      // socket closed before opening, treat as down — but only if we
      // haven't already errored above. Some libp2p WSS endpoints accept
      // the TLS upgrade then immediately close on Noise-handshake-absent;
      // for those, the `open` event fires before this `close`, so we're
      // resolved 'up' already.
      clearTimeout(timer);
      if (!resolved) finish('down', `closed before open (code ${ev.code})`);
    });
  });
}
