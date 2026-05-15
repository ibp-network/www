import { createSignal, For, lazy, Show, Suspense } from 'solid-js';
import { A } from '@solidjs/router';
import { members, memberStats } from '@/data/members';
import RoutedTo from '@/components/RoutedTo';
import CopyableEndpoint from '@/components/CopyableEndpoint';
import ServiceMap2D from '@/components/ServiceMap2D';
import { compactNumber, useDashboardStats } from '@/data/dashboard';
import { useNetworkSnapshot } from '@/data/network';
import { useDocMeta } from '@/utils/title';

/**
 * /members — operator roster + service map, merged. The 2D map renders
 * immediately (no WebGL chunk needed). A button promotes to the 3D globe
 * on demand; globe.gl is ~516 KB gzipped, so users who don't ask for the
 * flourish never pay for it.
 */

// Globe is dynamically imported only when the user toggles into 3D mode.
const Globe = lazy(() => import('@/components/Globe'));

type Protocol = 'wss' | 'https';

type MemberCard = {
  name: string;
  region: string;
  city: string;
  country: string;
  website?: string;
  logoUrl: string;
  level: number;
  color: string;
};

const accentColors: Record<string, string> = {
  Amforc:           '#00d0ff',
  Dwellir:          '#33b1ff',
  Gatotech:         '#7b6cff',
  RadiumBlock:      '#b04dff',
  'Rotko Networks': '#dc3ad8',
  'Stake Plus':     '#f502ff',
  Turboflakes:      '#ff409f',
};

const localMeta: Record<string, { region: string; city: string; country: string }> = {
  Amforc:           { region: 'Europe',          city: 'Zurich',    country: 'Switzerland' },
  Dwellir:          { region: 'Africa',          city: 'Lagos',     country: 'Nigeria' },
  Gatotech:         { region: 'Central America', city: 'San José',  country: 'Costa Rica' },
  RadiumBlock:      { region: 'Asia',            city: 'Bengaluru', country: 'India' },
  'Rotko Networks': { region: 'Asia',            city: 'Bangkok',   country: 'Thailand' },
  'Stake Plus':     { region: 'North America',   city: 'Ashburn',   country: 'USA' },
  Turboflakes:      { region: 'Europe',          city: 'Lisbon',    country: 'Portugal' },
};

export default function MembersPage() {
  useDocMeta({
    title: 'Members',
    description:
      'Seven independent operators run the IBP across five continents: bare-metal hardware, member-owned datacentres, GeoDNS-routed. Live service map and full roster.',
  });
  const stats = useDashboardStats();
  const snap = useNetworkSnapshot();
  const [selected, setSelected] = createSignal<string | null>(null);
  const [protocol, setProtocol] = createSignal<Protocol>('wss');
  // 2D map renders immediately; 3D globe loads only after user opt-in.
  const [mapMode, setMapMode] = createSignal<'2d' | '3d'>('2d');

  const connectUrl = () =>
    `${protocol()}://asset-hub-polkadot.dotters.network`;

  const requestsBlurb = () => {
    const s = stats();
    if (s?.last30d) return `${compactNumber(s.last30d.total_requests)}+ requests / 30d`;
    return null;
  };

  const cards = (): MemberCard[] => {
    const s = snap();
    if (!s) return [];
    return s.members
      .map((m): MemberCard => {
        const meta = localMeta[m.name] ?? { region: '-', city: '-', country: '-' };
        return {
          name: m.name,
          region: meta.region,
          city: meta.city,
          country: meta.country,
          website: m.website,
          logoUrl: m.logoUrl,
          level: m.level,
          color: accentColors[m.name] ?? '#00d0ff',
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  return (
    <section class="section">
      <div class="container-page">
        <p class="eyebrow mb-3">Members</p>
        <h1 class="h-display text-3xl sm:text-4xl md:text-6xl max-w-4xl">
          {memberStats.count} operators. {memberStats.continents} continents.
        </h1>
        <p class="mt-6 max-w-2xl text-base md:text-lg text-paper-muted leading-relaxed">
          Every IBP node runs on hardware its operator owns, in a datacentre they
          control. <span class="text-paper">GeoDNS routes each request to the nearest healthy operator</span>, automatically.
        </p>

        <Show when={requestsBlurb()}>
          <p class="mt-3 text-sm text-paper-dim">
            <span class="cosmic-text font-medium">{requestsBlurb()}</span> · live from{' '}
            <a class="text-cyan underline" href="https://ibdash.dotters.network" target="_blank" rel="noreferrer">
              ibdash
            </a>
          </p>
        </Show>

        {/* Routed-to + immediate connect CTA (same layout as the old /map). */}
        <div class="mt-10 grid lg:grid-cols-[1.4fr_1fr] gap-6 items-start min-w-0">
          <RoutedTo variant="panel" />
          <div class="card">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <div class="text-xs uppercase tracking-[0.2em] text-paper-dim">
                Connect via your nearest operator
              </div>
              <div class="self-start sm:self-auto inline-flex rounded border border-ink-500 overflow-hidden text-[10px] tracking-wider uppercase">
                <button
                  type="button"
                  class="px-3 py-1.5 transition-colors min-w-12"
                  classList={{
                    'bg-cyan/80 text-ink-950': protocol() === 'wss',
                    'text-paper-muted hover:text-paper': protocol() !== 'wss',
                  }}
                  onClick={() => setProtocol('wss')}
                  aria-pressed={protocol() === 'wss'}
                >
                  WSS
                </button>
                <button
                  type="button"
                  class="px-3 py-1.5 transition-colors border-l border-ink-500 min-w-12"
                  classList={{
                    'bg-cyan/80 text-ink-950': protocol() === 'https',
                    'text-paper-muted hover:text-paper': protocol() !== 'https',
                  }}
                  onClick={() => setProtocol('https')}
                  aria-pressed={protocol() === 'https'}
                >
                  HTTPS
                </button>
              </div>
            </div>
            <CopyableEndpoint url={connectUrl()} label="Asset Hub" />
            <p class="mt-3 text-xs text-paper-dim leading-relaxed break-words">
              WebSocket is the Polkadot default. HTTPS works but drops
              subscriptions. The relay chain
              (<code class="text-paper-muted break-all">polkadot.dotters.network</code>) is for validators.
            </p>
            <A href="/endpoints" class="mt-4 inline-flex items-center gap-1 text-xs text-cyan hover:text-magenta transition-colors">
              All chains <span class="i-mdi-arrow-top-right" />
            </A>
          </div>
        </div>

        {/* Map — 2D by default (no WebGL chunk), 3D globe on opt-in. */}
        <div class="mt-10 relative">
          <div class="absolute top-3 right-3 z-10 inline-flex rounded border border-ink-500 overflow-hidden text-[10px] tracking-wider uppercase backdrop-blur-md bg-ink-900/70">
            <button
              type="button"
              class="px-3 py-1.5 transition-colors min-w-10"
              classList={{
                'bg-cyan/80 text-ink-950': mapMode() === '2d',
                'text-paper-muted hover:text-paper': mapMode() !== '2d',
              }}
              onClick={() => setMapMode('2d')}
              aria-pressed={mapMode() === '2d'}
            >
              2D
            </button>
            <button
              type="button"
              class="px-3 py-1.5 transition-colors border-l border-ink-500 min-w-10"
              classList={{
                'bg-cyan/80 text-ink-950': mapMode() === '3d',
                'text-paper-muted hover:text-paper': mapMode() !== '3d',
              }}
              onClick={() => setMapMode('3d')}
              aria-pressed={mapMode() === '3d'}
              title="WebGL globe (~516 KB)"
            >
              3D
            </button>
          </div>
          <Show
            when={mapMode() === '3d'}
            fallback={<ServiceMap2D />}
          >
            <div class="card p-0 overflow-hidden aspect-square sm:aspect-[16/9] bg-ink-950">
              <Suspense fallback={<div class="w-full h-full animate-pulse bg-glass" aria-hidden />}>
                <Globe members={members} webglFallback={<ServiceMap2D />} />
              </Suspense>
            </div>
          </Show>
        </div>

        {/* ── Operators (accordion) ──────────────────────────────────────── */}
        <div class="mt-16 flex flex-wrap items-end justify-between gap-4 mb-6">
          <h2 class="h-display text-2xl md:text-3xl">Operators.</h2>
          <p class="text-xs text-paper-dim md:max-w-xs md:text-right leading-relaxed">
            Per-operator latency and uptime telemetry on{' '}
            <a href="https://ibdash.dotters.network" target="_blank" rel="noreferrer" class="text-cyan hover:text-magenta inline-flex items-center gap-1">
              ibdash <span class="i-mdi-arrow-top-right" />
            </a>
            .
          </p>
        </div>

        <div>
          <For each={cards()}>
            {(m) => {
              const isOpen = () => selected() === m.name;
              const initials = m.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
              return (
                <div>
                  <button
                    type="button"
                    onClick={() => setSelected(isOpen() ? null : m.name)}
                    aria-expanded={isOpen()}
                    class="w-full grid grid-cols-[56px_1fr_auto_24px] gap-4 items-center py-6 border-t border-ink-500 last:border-b text-left transition-colors hover:bg-glass"
                  >
                    <div
                      class="w-14 h-14 rounded-xl border border-ink-500 flex items-center justify-center relative overflow-hidden"
                      style={{ background: 'linear-gradient(135deg, #1a1a1a, #0a0a0a)' }}
                    >
                      <span
                        class="absolute inset-0 mix-blend-screen opacity-20"
                        style={{ background: `linear-gradient(135deg, ${m.color}, transparent)` }}
                        aria-hidden
                      />
                      <Show
                        when={m.logoUrl}
                        fallback={<span class="relative text-base font-medium">{initials}</span>}
                      >
                        <img
                          src={m.logoUrl}
                          alt=""
                          class="relative w-10 h-10 object-contain"
                          referrerpolicy="no-referrer"
                          loading="lazy"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                            const init = document.createElement('span');
                            init.className = 'relative text-base font-medium';
                            init.textContent = initials;
                            (e.currentTarget.parentNode as HTMLElement | null)?.appendChild(init);
                          }}
                        />
                      </Show>
                    </div>
                    <div>
                      <div class="text-xl text-paper font-normal">{m.name}</div>
                      <div class="text-xs text-paper-dim mt-1">
                        {m.city}, {m.country} · {m.region}
                      </div>
                    </div>
                    <Show when={m.website}>
                      <a
                        href={m.website!}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        class="text-xs text-cyan hover:text-magenta inline-flex items-center gap-1 transition-colors"
                      >
                        {m.website!.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                        <span class="i-mdi-arrow-top-right" />
                      </a>
                    </Show>
                    <span
                      class="i-mdi-chevron-down text-paper-dim transition-transform"
                      classList={{ 'rotate-180': isOpen() }}
                    />
                  </button>
                  <Show when={isOpen()}>
                    <div class="grid md:grid-cols-2 gap-4 pb-6 pl-0 md:pl-28">
                      <div class="card">
                        <div class="text-xs uppercase tracking-wider text-paper-dim">Region</div>
                        <div class="mt-1 text-paper">{m.region}</div>
                        <div class="mt-4 text-xs uppercase tracking-wider text-paper-dim">Location</div>
                        <div class="mt-1 text-paper">{m.city}, {m.country}</div>
                      </div>
                      <div class="card">
                        <div class="text-xs uppercase tracking-wider text-paper-dim">Membership</div>
                        <div class="mt-1 text-paper">Professional</div>
                        <Show when={m.website}>
                          <div class="mt-4 text-xs uppercase tracking-wider text-paper-dim">Website</div>
                          <a
                            href={m.website!}
                            target="_blank"
                            rel="noreferrer"
                            class="mt-1 inline-flex items-center gap-1 text-cyan hover:text-magenta"
                          >
                            {m.website}
                            <span class="i-mdi-arrow-top-right" />
                          </a>
                        </Show>
                      </div>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>

        <p class="mt-10 text-xs text-paper-dim">
          Canonical roster from{' '}
          <a class="text-cyan underline" href="https://github.com/ibp-network/config" target="_blank" rel="noreferrer">
            ibp-network/config
          </a>
          .
        </p>
      </div>
    </section>
  );
}
