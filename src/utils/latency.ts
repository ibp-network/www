/**
 * Browser-side latency probe against operator ServiceIPv4 (from the
 * canonical config). Probing the IP directly bypasses CDNs that
 * front member hostnames; the TLS handshake fails because the cert
 * is bound to a hostname, but we don't need the response, only the
 * RTT to error.
 *
 * Notes on the design:
 *
 * Samples + min. A single browser timing has lots of noise — parallel
 * probes head-of-line block, the TLS abort path varies in length per
 * browser, performance.now() granularity is coarsened on some
 * platforms. Take SAMPLES probes and report the minimum. Min is the
 * best estimate of the network floor (= real round-trip + smallest
 * unavoidable browser overhead). It maps closer to ICMP ping than any
 * average would.
 *
 * No magic divisor. The old code did `/2` to approximate "warm
 * connection RTT" from a cold TCP+TLS measurement. That divisor is
 * wrong on TLS 1.2 (2-RTT handshake), wrong on connection reuse, and
 * empirically too aggressive. The number we report now is the
 * raw browser-observed RTT (cold connect + TLS abort). It will be
 * larger than ICMP ping but at least it's honest.
 *
 * fetch, not Image. img.onerror has slow, browser-specific cleanup
 * paths; fetch with no-cors + opaque response fails immediately on
 * cert verification. Same probe, less garbage on the timer.
 */
import { createResource, type Resource } from 'solid-js';

const TIMEOUT_MS = 3000;
const SAMPLES = 3;
const cache = new Map<string, number>();

export type Probeable = { name: string; ipv4?: string };

async function singleProbe(ipv4: string, timeoutMs: number, nonce: string): Promise<number | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t = performance.now();
  try {
    // mode: 'no-cors' avoids the CORS preflight. cache: 'no-store'
    // prevents the browser from satisfying us with a cached error.
    // The fetch will reject on TLS verification — we catch it and
    // measure how long that took.
    await fetch(`https://${ipv4}/?_=${nonce}`, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: ctrl.signal,
      keepalive: false,
    });
  } catch {
    // expected
  }
  clearTimeout(timer);
  const elapsed = performance.now() - t;
  // If we hit the abort timeout, the measurement is meaningless.
  return ctrl.signal.aborted ? null : elapsed;
}

/** Probe a single IPv4 over HTTPS. Returns the MIN of SAMPLES measurements, or null. */
export function probeIp(ipv4: string, timeoutMs = TIMEOUT_MS): Promise<number | null> {
  if (cache.has(ipv4)) return Promise.resolve(cache.get(ipv4)!);
  if (typeof window === 'undefined') return Promise.resolve(null);
  return (async () => {
    const xs: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const x = await singleProbe(ipv4, timeoutMs, `${Date.now()}-${i}`);
      if (x !== null) xs.push(x);
    }
    if (xs.length === 0) return null;
    const min = Math.min(...xs);
    cache.set(ipv4, min);
    return min;
  })();
}

/**
 * Solid resource: probe every member with a `ipv4` in parallel against the
 * canonical config's ServiceIPv4. Returns a `Map<memberName, ms|null>`.
 */
export function useMemberLatencies(
  source: () => readonly Probeable[] | undefined,
): Resource<Map<string, number | null>> {
  const [res] = createResource(source, async (list) => {
    const out = new Map<string, number | null>();
    if (!list || list.length === 0) return out;
    await Promise.all(
      list.map(async (m) => {
        if (!m.ipv4) {
          out.set(m.name, null);
          return;
        }
        const ms = await probeIp(m.ipv4);
        out.set(m.name, ms);
      }),
    );
    return out;
  });
  return res;
}
