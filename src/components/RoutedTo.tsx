import { createSignal, onMount, Show } from 'solid-js';
import {
  detectRoutingFromTimezone,
  dohResolveBoth,
  refineWithIp,
  type Routing,
  type ResolvedRecord,
} from '@/utils/geo';
import { useNetworkSnapshot } from '@/data/network';
import { members as localMembers } from '@/data/members';

/**
 * Show which IBP member you'd hit when resolving an IBP GeoDNS hostname.
 *
 * Strategy (each step is more accurate than the last):
 *   1. Timezone-based estimate — instant, no network, no IP leak.
 *   2. DNS-over-HTTPS lookup — one query to Cloudflare DoH for the chain
 *      hostname. Match the returned A-record against the canonical
 *      member ServiceIPv4 list. This is the *actual* routing your
 *      resolver would pick.
 *   3. Optional IP-geo refinement — only on button click.
 */
const DEFAULT_HOSTNAME = 'asset-hub-polkadot.dotters.network';

export default function RoutedTo(props: { variant?: 'badge' | 'panel'; hostname?: string }) {
  const [routing, setRouting] = createSignal<Routing | null>(null);
  const [resolved, setResolved] = createSignal<ResolvedRecord | null>(null);
  const [refining, setRefining] = createSignal(false);
  const snapshot = useNetworkSnapshot();

  onMount(async () => {
    // 1. Instant timezone-based estimate so we never flash empty.
    setRouting(detectRoutingFromTimezone());

    // 2. Actual GeoDNS lookup via DoH — both A and AAAA in parallel. IPv6
    //    preferred when present (forward-compatible with IBP IPv6 rollout).
    const hostname = props.hostname ?? DEFAULT_HOSTNAME;
    const rec = await dohResolveBoth(hostname);
    if (!rec) return;
    setResolved(rec);

    // 3. Match the returned IP against the canonical member list. Match the
    //    correct family first; fall back to the other if needed.
    const snap = snapshot();
    if (snap) {
      const match = snap.members.find((m) =>
        rec.family === 'ipv6' ? m.ipv6 === rec.ip : m.ipv4 === rec.ip,
      );
      if (match) {
        // Augment with geo coords from the local map (canonical config
        // doesn't carry lat/lng).
        const coords = localMembers.find((lm) => lm.name === match.name);
        if (coords) {
          setRouting({
            member: coords,
            distanceKm: 0,
            source: 'doh' as Routing['source'],
          });
        }
      }
    }
  });

  const refine = async () => {
    setRefining(true);
    try {
      const refined = await refineWithIp();
      if (refined) setRouting(refined);
    } finally {
      setRefining(false);
    }
  };

  return (
    <Show when={routing()}>
      {(r) => (
        <Show
          when={props.variant === 'panel'}
          fallback={
            <span class="inline-flex items-center gap-2 text-xs text-paper-muted">
              <span class="i-mdi-map-marker text-brand-300" />
              Routed to <span class="font-medium text-paper">{r().member.name}</span>
              <span class="text-paper-dim">· {r().member.city}</span>
            </span>
          }
        >
          <div class="card border-brand/30 bg-card-tilt min-w-0 overflow-hidden">
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div class="flex items-start gap-3 min-w-0">
                <span class="i-mdi-map-marker text-3xl text-brand-300 shrink-0" />
                <div class="min-w-0">
                  <div class="text-xs uppercase tracking-wider text-paper-dim">
                    Your nearest pool member
                  </div>
                  <div class="mt-1 font-display font-bold text-xl">{r().member.name}</div>
                  <div class="mt-0.5 text-sm text-paper-muted">
                    {r().member.city}, {r().member.country} · {r().member.region}
                  </div>
                  <div class="mt-2 text-[11px] text-paper-dim min-w-0">
                    <Show
                      when={r().source === 'doh'}
                      fallback={
                        <>
                          ≈ {r().distanceKm.toLocaleString()} km away ·{' '}
                          {r().source === 'timezone' ? (
                            <>estimated from your timezone</>
                          ) : (
                            <>refined via IP geolocation</>
                          )}
                        </>
                      }
                    >
                      <>
                        {/* Hostname may break anywhere (it's a domain —
                            breaking mid-label is acceptable), but the IP
                            must wrap as one unit: break-all on the whole
                            line splits "160.22.181.81" into "16" / "0.22…"
                            on a narrow phone, which reads as corrupt. Keep
                            the arrow + IP in a nowrap span so it moves to
                            the next line whole. */}
                        <div class="font-mono">
                          <span class="break-all">{props.hostname ?? DEFAULT_HOSTNAME}</span>
                          <span class="whitespace-nowrap"> → {resolved()?.ip}</span>
                        </div>
                        <div class="mt-1 flex flex-wrap items-center gap-1">
                          <span class="inline-block px-1.5 py-0.5 rounded bg-cyan/15 text-cyan border border-cyan/30">
                            DoH verified
                          </span>
                          <Show when={resolved()?.family === 'ipv6'}>
                            <span class="inline-block px-1.5 py-0.5 rounded bg-magenta/15 text-magenta border border-magenta/30">
                              IPv6
                            </span>
                          </Show>
                        </div>
                      </>
                    </Show>
                  </div>
                </div>
              </div>
              <Show when={r().source === 'timezone'}>
                <button
                  type="button"
                  class="pill text-xs px-3 py-1.5"
                  onClick={refine}
                  disabled={refining()}
                >
                  <Show when={refining()} fallback={<>Use precise location</>}>
                    Refining…
                  </Show>
                </button>
              </Show>
            </div>
            <p class="mt-3 text-[11px] text-paper-dim leading-relaxed">
              <Show
                when={r().source === 'doh'}
                fallback={
                  <>
                    GeoDNS resolves <code class="font-mono text-paper">.dotters.network</code> and{' '}
                    <code class="font-mono text-paper">.ibp.network</code> to the closest healthy
                    operator. This is the operator your resolver should pick. Actual routing
                    depends on your DNS provider's geo and member health.
                  </>
                }
              >
                <>
                  Resolved live via Cloudflare DoH, matched against the canonical{' '}
                  <code class="font-mono text-paper">ServiceIPv4</code> in{' '}
                  <a class="text-cyan underline" href="https://github.com/ibp-network/config" target="_blank" rel="noreferrer">
                    ibp-network/config
                  </a>. This is the operator your connection lands on right now.
                </>
              </Show>
            </p>
          </div>
        </Show>
      )}
    </Show>
  );
}
