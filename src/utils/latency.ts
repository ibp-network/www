/**
 * Browser-side latency probe — fires against each operator's `ServiceIPv4`
 * from the canonical config (members_professional.json) rather than their
 * monitor hostnames. The previous version probed monitor URLs and several
 * landed on CDN edges (Cloudflare-fronted), so a Bangkok client measured
 * ~8 ms to Amforc/Zurich because it was actually hitting CF Singapore.
 *
 * IP-direct probing avoids the CDN entirely. The TLS handshake to
 * `https://<ipv4>/` will fail because the operator's TLS cert is bound to a
 * hostname, not the raw IP. That's fine — we don't need the response. The
 * browser's `onerror` fires after the TCP+TLS roundtrip completes, which is
 * the real RTT to the operator's box.
 *
 * Caveats this carries:
 *   - First probe pays TCP SYN + TLS 1.3 handshake (~2 one-way trips
 *     beyond the TCP one) so the raw measurement is roughly 2× the warm-
 *     connection round-trip. We divide by 2 to report the latency the
 *     user will actually see on an established WSS — that's what RPC calls
 *     ride over, not cold connects.
 *   - Mixed-content rules don't apply: both the page and the probe are HTTPS.
 *   - Some browsers/networks may delay or batch requests to many IPs in
 *     parallel; numbers should be read as "approximate, comparable across
 *     operators on the same page load," not as SLA truth. For real telemetry
 *     point users at ibdash.
 */
import { createResource, type Resource } from 'solid-js';

const TIMEOUT_MS = 4000;
const cache = new Map<string, number>();

export type Probeable = { name: string; ipv4?: string };

/** Probe a single IPv4 over HTTPS. Resolves to ms latency or null on timeout. */
export function probeIp(ipv4: string, timeoutMs = TIMEOUT_MS): Promise<number | null> {
  if (cache.has(ipv4)) return Promise.resolve(cache.get(ipv4)!);

  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(null);
    const t0 = performance.now();
    let done = false;
    const finish = (ms: number | null) => {
      if (done) return;
      done = true;
      if (ms !== null) cache.set(ipv4, ms);
      resolve(ms);
    };
    const img = new Image();
    // Divide by 2: the raw measurement is a cold TCP+TLS handshake (~2×
    // the warm-connection RTT). Users care about the per-call latency over
    // their established WSS, not the connect cost, so we report that.
    const elapsed = () => (performance.now() - t0) / 2;
    img.onload = () => finish(elapsed());
    img.onerror = () => finish(elapsed());
    setTimeout(() => finish(null), timeoutMs);
    // TLS will reject — onerror fires with the real RTT. Cache-bust the URL.
    img.src = `https://${ipv4}/?_=${Date.now()}`;
  });
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
