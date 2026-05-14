import { createSignal, For, lazy, onCleanup, onMount, Show, Suspense } from 'solid-js';
import type { JSX } from 'solid-js';
import { A } from '@solidjs/router';
import CopyableEndpoint from '@/components/CopyableEndpoint';
import { site } from '@/data/site';
import { memberStats } from '@/data/members';

/**
 * Landing page — fast above-the-fold, lazy everything else.
 *
 * Above the fold (the hero) ships zero network calls and no JS work beyond
 * Solid mount: title, tagline, copyable Asset Hub URL, two CTAs, wordmark.
 *
 * The static stats strip and 4-card nav grid are plain HTML (numbers baked
 * at build time from `members.ts`, no dashboard API fetch on landing).
 *
 * The "Connect with any library" section needs ~3 KB of code-snippet JS;
 * it's gated behind `LazyVisible` so its chunk only downloads when the user
 * scrolls within ~400 px of it. Visitors who never scroll past the hero
 * never pay for that chunk.
 */

/**
 * Mount `children` only once `<this>` enters the viewport (or comes within
 * `rootMargin`). Until then, render a placeholder of `minHeight` so layout
 * doesn't shift on mount.
 *
 * IntersectionObserver gating means lazy chunks load on-demand from scroll,
 * not from idle — the difference matters on slow networks where idle prefetch
 * still competes with content fetches for bandwidth.
 */
function LazyVisible(props: { rootMargin?: string; minHeight: string; children: JSX.Element }) {
  const [visible, setVisible] = createSignal(false);
  let el: HTMLDivElement | undefined;

  onMount(() => {
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
            return;
          }
        }
      },
      { rootMargin: props.rootMargin ?? '400px' },
    );
    io.observe(el);
    onCleanup(() => io.disconnect());
  });

  return (
    <div ref={el} style={{ 'min-height': props.minHeight }}>
      <Show when={visible()}>{props.children}</Show>
    </div>
  );
}

const ConnectingTabs = lazy(() => import('@/components/ConnectingTabs'));

const navCards = [
  {
    href: '/endpoints',
    eyebrow: 'Connect',
    title: 'All endpoints',
    body: 'WSS and HTTPS endpoints for every supported chain.',
    icon: 'i-mdi-server-network',
  },
  {
    href: '/build',
    eyebrow: 'Build',
    title: 'Developer docs',
    body: 'Reference snippets for PAPI, reactive-dot, Dedot, subxt, viem, ethers, and smoldot.',
    icon: 'i-mdi-book-open-page-variant',
  },
  {
    href: '/members',
    eyebrow: 'Operators',
    title: 'Members',
    body: 'Seven independent operators on bare-metal hardware across five continents.',
    icon: 'i-mdi-earth',
  },
  {
    href: '/blog',
    eyebrow: 'Programme',
    title: 'Blog',
    body: 'Programme notes: funding cycles, operator changes, design decisions.',
    icon: 'i-mdi-rss',
  },
];

// Static stats baked at build time. Live request counts are surfaced on
// /members (and the operator-facing /ibdash), not here — the landing should
// load in one round trip on a cold connection.
const inlineStats = [
  { label: 'Operators',  value: `${memberStats.count}` },
  { label: 'Continents', value: `${memberStats.continents}` },
  { label: 'Chains',     value: '28' },
  { label: 'Years up',   value: 'Since 2022' },
];

export default function HomePage() {
  return (
    <>
      <section
        class="relative min-h-screen overflow-hidden flex flex-col items-center text-center pt-[120px] md:pt-[140px] pb-20 px-5 sm:px-8 lg:px-12"
        style={{
          'background-image':
            "radial-gradient(ellipse 70% 40% at 50% 100%, transparent 35%, rgba(0,0,0,0.55) 65%, rgba(0,0,0,0.95) 95%), " +
            "url('/figma-hero-bg.webp'), " +
            'radial-gradient(1200px 700px at 50% -10%, rgba(0,208,255,0.2), transparent 60%), ' +
            'radial-gradient(900px 600px at 80% 30%, rgba(245,2,255,0.16), transparent 60%)',
          'background-position': 'center, center bottom, center, center',
          'background-size': 'cover, cover, auto, auto',
          'background-repeat': 'no-repeat, no-repeat, no-repeat, no-repeat',
          'background-color': '#000',
        }}
      >
        <h1 class="h-display text-[40px] sm:text-[56px] md:text-[72px] xl:text-[104px] max-w-5xl leading-[1.04]">
          Powering <span class="cosmic-text">Polkadot</span>
          <br />
          from all around the world.
        </h1>

        <p class="mt-8 max-w-xl text-base md:text-lg text-paper-muted leading-relaxed">
          Free public RPC for Polkadot. Member-owned bare metal, GeoDNS-routed, no API keys, no rate limits.
        </p>

        <div class="mt-10 w-full max-w-xl">
          <p class="text-[11px] uppercase tracking-[0.24em] text-paper-dim mb-3">
            Quick connect
          </p>
          <CopyableEndpoint
            url="wss://asset-hub-polkadot.ibp.network"
            label="Asset Hub Polkadot"
          />
        </div>

        <div class="mt-8 flex flex-wrap justify-center gap-3">
          <A href="/endpoints" class="pill-cta">All chains &rarr;</A>
          <A href="/members" class="pill"><span class="i-mdi-earth" /> Members</A>
        </div>

        <div class="hero-divider mt-12" />

        <img
          src="/ibp-wordmark.svg"
          alt="ibp"
          width="320"
          height="174"
          decoding="async"
          class="mt-10 mb-4 select-none"
          style={{
            width: 'clamp(220px, 26vw, 320px)',
            height: 'auto',
            'filter': 'drop-shadow(0 0 32px rgba(255,64,159,0.25))',
          }}
        />
      </section>

      <section class="border-y border-ink-600 py-10">
        <div class="container-page grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <For each={inlineStats}>
            {(s) => (
              <div>
                <div class="font-display font-light text-2xl sm:text-3xl md:text-4xl cosmic-text tabular-nums">
                  {s.value}
                </div>
                <div class="mt-1 text-[10px] sm:text-[11px] uppercase tracking-[0.18em] sm:tracking-[0.2em] text-paper-dim">
                  {s.label}
                </div>
              </div>
            )}
          </For>
        </div>
      </section>

      <section class="section">
        <div class="container-page">
          <div class="text-center max-w-2xl mx-auto mb-12">
            <div class="eyebrow mb-3">Reference snippets</div>
            <h2 class="h-display text-3xl md:text-5xl lg:text-[64px]">
              Connect with any <span class="cosmic-text">Polkadot library</span>.
            </h2>
            <p class="mt-5 text-paper-muted">
              Each snippet targets Asset Hub Polkadot. Substitute the URL for any other chain.
            </p>
          </div>
          <div class="max-w-4xl mx-auto">
            <LazyVisible minHeight="420px" rootMargin="400px">
              <Suspense fallback={<div class="h-[420px] rounded-2xl bg-glass animate-pulse" />}>
                <ConnectingTabs defaultKey="papi" />
              </Suspense>
            </LazyVisible>
          </div>
        </div>
      </section>

      <section class="section border-t border-ink-600">
        <div class="container-page">
          <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <For each={navCards}>
              {(c) => (
                <A href={c.href} class="card-hover block group">
                  <span class={`${c.icon} text-3xl text-cyan`} />
                  <div class="mt-4 text-[11px] uppercase tracking-[0.24em] text-paper-dim">
                    {c.eyebrow}
                  </div>
                  <h3 class="mt-1 font-display text-2xl font-light">{c.title}</h3>
                  <p class="mt-3 text-sm text-paper-muted leading-relaxed">{c.body}</p>
                  <span class="mt-5 inline-flex items-center gap-2 text-sm text-cyan group-hover:text-magenta transition-colors">
                    Open <span class="i-mdi-arrow-top-right" />
                  </span>
                </A>
              )}
            </For>
          </div>
          <p class="mt-10 text-center text-xs text-paper-dim">
            Running a validator? Relay-chain endpoints are at the bottom of <A href="/endpoints" class="text-paper underline hover:text-cyan">/endpoints</A>.
          </p>
        </div>
      </section>

      <section class="section border-t border-ink-600">
        <div class="container-page text-center">
          <div class="eyebrow mb-3">Contact</div>
          <h2 class="h-display text-3xl md:text-5xl lg:text-[64px]">
            Reach the <span class="cosmic-text">operators</span>.
          </h2>
          <p class="mt-5 max-w-xl mx-auto text-paper-muted">
            Public Matrix room for operational questions, outage reports, and integration help.
          </p>
          <div class="mt-8 flex flex-wrap justify-center gap-3">
            <a href={site.links.matrix} target="_blank" rel="noreferrer" class="pill-cta">
              <span class="i-mdi-matrix" /> Join Matrix room
            </a>
            <A href="/contact" class="pill">Other channels</A>
          </div>
        </div>
      </section>
    </>
  );
}
