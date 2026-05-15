import { defineConfig, type Plugin } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import UnocssPlugin from '@unocss/vite';
import path from 'node:path';
import { readdirSync, statSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { buildContentTrees, setIbpVars, type IbpVars } from './src/data/wiki-build';
import type { WikiCategory } from './src/data/wiki-types';

/**
 * Single shared loader for the canonical IBP config JSONs.
 *
 * Both wikiContentPlugin (markdown __IBP_*__ substitution) and
 * configMirrorPlugin (dist/data/* mirroring + dev middleware) need data
 * from raw.githubusercontent.com/ibp-network/config. Without this each
 * plugin fetched independently in its own buildStart, doubling the
 * cold-start round-trips and the flakiness surface.
 *
 * We memoize the Promise (not the resolved Map). Concurrent callers
 * during the same buildStart phase share the in-flight request — one
 * fetch satisfies both consumers. On rejection the promise is cleared
 * so a transient network failure doesn't poison the cache for the
 * rest of the process; the next caller retries.
 */
const CONFIG_BASE = 'https://raw.githubusercontent.com/ibp-network/config/main';
const CONFIG_FILES = ['bootnodes.json', 'members_professional.json', 'services_rpc.json'] as const;
type ConfigName = (typeof CONFIG_FILES)[number];
let configCachePromise: Promise<Map<ConfigName, string>> | null = null;
function loadCanonicalConfigs(): Promise<Map<ConfigName, string>> {
  if (configCachePromise) return configCachePromise;
  const p = Promise.all(
    CONFIG_FILES.map(async (name) => {
      const r = await fetch(`${CONFIG_BASE}/${name}`);
      if (!r.ok) throw new Error(`canonical config fetch: ${name} HTTP ${r.status}`);
      return [name, await r.text()] as const;
    }),
  ).then((pairs) => new Map<ConfigName, string>(pairs));
  p.catch(() => { configCachePromise = null; });
  configCachePromise = p;
  return p;
}

/**
 * Three virtual modules — one per content tree — so each route only pays for
 * the content it actually renders:
 *   virtual:ibp-docs   → src/docs/**   → consumed by /build/*       (DocsPage)
 *   virtual:ibp-wiki   → src/wiki/**   → consumed by /operations/*  (OperationsPage)
 *   virtual:ibp-posts  → src/posts/*   → consumed by /blog/*        (BlogPage / BlogPostPage)
 *
 * Walking + running remark + frontmatter + admonitions + link-rewrites at
 * build time means the runtime ships only the rendered HTML strings — no
 * remark/remark-gfm/remark-html/front-matter in the production bundle.
 *
 * Dev HMR: any .md or _category_.json change invalidates the affected
 * virtual module so the dev server hot-reloads only that subset.
 */
function wikiContentPlugin(): Plugin {
  const srcRoot = path.resolve(__dirname, 'src');
  const VIRTS = {
    'virtual:ibp-docs':  { key: 'docs',  fsDir: '/docs/'  },
    'virtual:ibp-wiki':  { key: 'wiki',  fsDir: '/wiki/'  },
    'virtual:ibp-posts': { key: 'posts', fsDir: '/posts/' },
  } as const;
  const resolvedToVirtual = new Map<string, keyof typeof VIRTS>();
  for (const v of Object.keys(VIRTS) as (keyof typeof VIRTS)[]) {
    resolvedToVirtual.set('\0' + v, v);
  }
  // Build once per plugin lifecycle and cache. Invalidated on HMR.
  let cache: ReturnType<typeof buildContentTrees> | null = null;
  const rebuild = () => {
    cache = buildContentTrees(srcRoot);
    return cache;
  };

  // Fetch live membership from the canonical config repo at build time
  // and pass it through to wiki-build's substitution layer. Markdown
  // files use placeholders like __IBP_MEMBER_COUNT__ /
  // __IBP_MEMBERS_WITH_COUNTRY__ which get replaced with the real
  // values before remark renders. No more "seven members" hardcoded
  // in docs that drifts when the membership changes.
  type RawMember = {
    Details?: { Name?: string };
    Service?: { Active?: number };
    Location?: { Country?: string };
  };
  async function loadIbpVars(): Promise<IbpVars> {
    const configs = await loadCanonicalConfigs();
    const text = configs.get('members_professional.json');
    if (!text) throw new Error('members_professional.json missing from canonical config cache');
    const raw: Record<string, RawMember> = JSON.parse(text);
    const active = Object.values(raw)
      .filter((m) => m?.Service?.Active === 1)
      .map((m) => ({ name: m.Details?.Name ?? '', country: m.Location?.Country ?? '' }))
      .filter((m) => m.name)
      .sort((a, b) => a.name.localeCompare(b.name));
    const uniqCountries = [...new Set(active.map((m) => m.country).filter(Boolean))];
    return {
      memberCount:        active.length,
      membersList:        active.map((m) => m.name).join(', '),
      membersWithCountry: active.map((m) => m.country ? `${m.name} (${m.country})` : m.name).join(', '),
      memberCountries:    uniqCountries.join(', '),
      memberCountryCount: uniqCountries.length,
    };
  }

  return {
    name: 'ibp-wiki-content',
    async buildStart() {
      try {
        setIbpVars(await loadIbpVars());
      } catch (e) {
        // Don't fail the build on a flaky network — log and continue.
        // Placeholders will remain literal in the output, which is
        // visually loud enough to notice in a PR review.
        // eslint-disable-next-line no-console
        console.warn(`[ibp-wiki-content] failed to load member vars: ${String(e)}`);
      }
    },
    resolveId(id) {
      if (id in VIRTS) return '\0' + id;
      return null;
    },
    load(id) {
      const virt = resolvedToVirtual.get(id);
      if (!virt) return null;
      const { key } = VIRTS[virt];
      const data = (cache ?? rebuild())[key];
      return `export const ${key} = ${JSON.stringify(data)};\n`;
    },
    handleHotUpdate(ctx) {
      if (!/\.(md|json)$/.test(ctx.file)) return;
      // Find which virtual modules this file affects.
      const affected: string[] = [];
      for (const [vid, cfg] of Object.entries(VIRTS)) {
        if (ctx.file.includes(cfg.fsDir)) affected.push('\0' + vid);
      }
      if (affected.length === 0) return undefined;
      cache = null; // force rebuild on next load
      const mods = affected
        .map((id) => ctx.server.moduleGraph.getModuleById(id))
        .filter((m): m is NonNullable<typeof m> => Boolean(m));
      return mods.length ? mods : undefined;
    },
  };
}

/**
 * Generate dist/sitemap.xml from the source content trees.
 *   src/docs/**.md     → /build/...        (priority 0.9)
 *   src/wiki/**.md     → /operations/...   (priority 0.6)
 *   src/posts/*.md     → /blog/...         (priority 0.7)
 *
 * Mirrors the URL-mapping in src/data/wiki.ts (numeric prefixes stripped).
 * Writes after build so the generated file lands in dist/, alongside the
 * static index.html and assets/.
 */
/**
 * Bake the canonical IBP config (bootnodes, members, services) into the dist
 * so the site no longer reaches across origins to raw.githubusercontent.com
 * on every visit to /endpoints and /members.
 *
 * - At buildStart: fetch the three JSONs from GitHub once.
 * - In dev: a middleware serves them from `/data/*.json` (same-origin in dev).
 * - In build: closeBundle writes them to `dist/data/` so redbean serves them
 *   with its standard cache headers.
 *
 * Trade-off: data is frozen at build time. The config repo updates on the
 * order of weeks; rebuild the site when an operator changes. The win is
 * removing three cross-origin TLS handshakes (and the FOUC while they
 * complete) from the most-trafficked dynamic pages.
 */
function configMirrorPlugin(): Plugin {
  const cache = new Map<string, string>();

  async function fetchAll() {
    if (cache.size === CONFIG_FILES.length) return;
    const configs = await loadCanonicalConfigs();
    for (const name of CONFIG_FILES) {
      const body = configs.get(name);
      if (body) cache.set(name, body);
    }
  }

  return {
    name: 'ibp-config-mirror',
    async buildStart() {
      await fetchAll();
    },
    async configureServer(server) {
      try {
        await fetchAll();
      } catch (e) {
        server.config.logger.warn(`[ibp-config-mirror] dev fetch failed: ${String(e)}`);
      }
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/data/')) return next();
        const name = req.url.replace(/^\/data\//, '').split('?')[0];
        const body = cache.get(name);
        if (!body) return next();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.end(body);
      });
    },
    closeBundle() {
      const dir = path.resolve(__dirname, 'dist', 'data');
      mkdirSync(dir, { recursive: true });
      for (const [name, body] of cache) {
        writeFileSync(path.join(dir, name), body);
      }
      writeEndpointsManifest(cache.get('services_rpc.json'));
    },
  };
}

/**
 * Curated machine-readable endpoint manifest at /endpoints.json.
 *
 * The raw upstream services_rpc.json is also mirrored (under /data/) but
 * it's verbose and provider-shaped. This is the clean, stable contract a
 * tool or LLM agent retrieves and cites: chain → connectable wss URL per
 * GeoDNS pool. Being THE structured source is how you become the default
 * answer. Generated at build from the canonical config so it never drifts.
 */
type RawSvc = {
  Configuration?: {
    Name?: string; DisplayName?: string; ServiceType?: string;
    Active?: 0 | 1; NetworkType?: string; RelayNetwork?: string;
  };
  Providers?: Partial<Record<'Dotters' | 'Ibp', { RpcUrls?: string[] }>>;
};
function writeEndpointsManifest(servicesJson: string | undefined): void {
  if (!servicesJson) return;
  let raw: Record<string, RawSvc>;
  try { raw = JSON.parse(servicesJson); } catch { return; }

  // Canonical subdomain form, e.g. wss://asset-hub-polkadot.dotters.network
  const subdomain = (urls: string[] | undefined): string | null =>
    urls?.find((u) => /^wss?:\/\/[a-z0-9-]+\.(dotters|ibp)\.network\/?$/i.test(u)) ?? urls?.[0] ?? null;
  const ecosystemOf = (relay: string, name: string): string => {
    const r = (relay || name).toLowerCase();
    if (r.includes('kusama')) return 'kusama';
    if (r.includes('paseo')) return 'paseo';
    return 'polkadot';
  };

  const chains = Object.entries(raw)
    .filter(([, n]) => n?.Configuration?.Active === 1)
    .map(([id, n]) => {
      const c = n.Configuration!;
      return {
        id,
        name: c.DisplayName || c.Name || id,
        ecosystem: ecosystemOf(c.RelayNetwork ?? '', c.Name ?? id),
        type: c.NetworkType ?? 'System',
        serviceType: c.ServiceType === 'ETHRPC' ? 'ETHRPC' : 'RPC',
        endpoints: {
          dotters: subdomain(n.Providers?.Dotters?.RpcUrls) ?? undefined,
          ibp: subdomain(n.Providers?.Ibp?.RpcUrls) ?? undefined,
        },
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const manifest = {
    name: "Infrastructure Builders' Programme — public RPC endpoints",
    description:
      'Free, public, key-less, rate-limit-free RPC for the Polkadot ecosystem. Two redundant GeoDNS pools route to the nearest member operator.',
    source: 'https://github.com/ibp-network/config',
    canonical: 'https://ibp.network/endpoints',
    docs: 'https://ibp.network/llms.txt',
    pools: ['dotters.network', 'ibp.network'],
    generated: new Date().toISOString(),
    chains,
  };
  writeFileSync(
    path.resolve(__dirname, 'dist', 'endpoints.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  console.log(`[endpoints-manifest] wrote ${chains.length} chains to dist/endpoints.json`);
}

function sitemapPlugin(): Plugin {
  const HOST = 'https://ibp.network';
  const stripNum = (s: string) => s.replace(/^\d+[-_]/, '').toLowerCase();
  const walk = (dir: string): string[] => {
    const out: string[] = [];
    try {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) out.push(...walk(p));
        else if (name.endsWith('.md')) out.push(p);
      }
    } catch {
      /* directory absent — return empty */
    }
    return out;
  };
  const urlForTree = (file: string, root: string, prefix: string): string => {
    const rel = path.relative(root, file).replace(/\.md$/, '');
    const segs = rel.split(path.sep).map(stripNum);
    return `${HOST}${prefix}/${segs.join('/')}`;
  };
  const postSlug = (file: string): string => {
    // posts/YYYY-MM-DD-slug.md → /blog/slug
    const base = path.basename(file, '.md');
    return base.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  };
  return {
    name: 'ibp-www-sitemap',
    apply: 'build',
    closeBundle() {
      const root = path.resolve(__dirname, 'src');
      const entries: Array<{ url: string; priority: string; changefreq: string }> = [
        { url: `${HOST}/`,           priority: '1.0',  changefreq: 'weekly' },
        { url: `${HOST}/endpoints`,  priority: '0.95', changefreq: 'daily'  },
        { url: `${HOST}/members`,    priority: '0.8',  changefreq: 'weekly' },
        { url: `${HOST}/build`,      priority: '0.9',  changefreq: 'weekly' },
        { url: `${HOST}/operations`, priority: '0.6',  changefreq: 'monthly'},
        { url: `${HOST}/blog`,       priority: '0.7',  changefreq: 'weekly' },
        { url: `${HOST}/contact`,    priority: '0.6',  changefreq: 'monthly'},
      ];
      for (const f of walk(path.join(root, 'docs'))) {
        entries.push({ url: urlForTree(f, path.join(root, 'docs'), '/build'), priority: '0.7', changefreq: 'monthly' });
      }
      for (const f of walk(path.join(root, 'wiki'))) {
        entries.push({ url: urlForTree(f, path.join(root, 'wiki'), '/operations'), priority: '0.5', changefreq: 'monthly' });
      }
      for (const f of walk(path.join(root, 'posts'))) {
        entries.push({ url: `${HOST}/blog/${postSlug(f)}`, priority: '0.6', changefreq: 'monthly' });
      }
      const xml =
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        entries
          .map(
            (e) =>
              `  <url><loc>${e.url}</loc><priority>${e.priority}</priority><changefreq>${e.changefreq}</changefreq></url>`,
          )
          .join('\n') +
        `\n</urlset>\n`;
      writeFileSync(path.resolve(__dirname, 'dist/sitemap.xml'), xml);
      // Echo count to the build log so CI can sanity-check.
      console.log(`[sitemap] wrote ${entries.length} URLs to dist/sitemap.xml`);
    },
  };
}

/**
 * Per-route HTML pre-rendering.
 *
 * SPA's <title> and meta tags are set client-side via useDocMeta, so social
 * previewers (Slack/Twitter/LinkedIn — they don't run JS) see the static
 * homepage card for every shared URL. This plugin emits a per-route
 * index.html with route-specific <title>, description, canonical, and og:*
 * tags rewritten. Body still points at the same JS bundle, so the SPA
 * hydrates normally.
 *
 * Redbean's .init.lua looks for /<route>/index.html first and falls back to
 * /index.html if absent. So this plugin only needs to write files, not wire
 * server routing.
 */
/**
 * Static SSG hero for the homepage. Injected into `<div id="root">` at build
 * time by the prerender plugin AND served by the dev server's transformIndexHtml
 * hook below, so first contentful paint is identical in dev and prod.
 *
 * The endpoint button mirrors `CopyableEndpoint`: same wrapper classes, same
 * label / code / icon layout. The RoutedTo line renders a blurred placeholder
 * ("Routed to operator · city") to reserve space and hint that DoH geolocation
 * will fill it in. Solid clears #root and remounts the real components — see
 * src/index.tsx — so the visual swap is one frame.
 */
const HOMEPAGE_SSG = `
    <main><section class="relative min-h-screen overflow-hidden flex flex-col items-center text-center pt-[120px] md:pt-[140px] pb-20 px-5 sm:px-8 lg:px-12" style="background-image:radial-gradient(ellipse 70% 40% at 50% 100%, transparent 35%, rgba(0,0,0,0.55) 65%, rgba(0,0,0,0.95) 95%),url('/figma-hero-bg.webp'),radial-gradient(1200px 700px at 50% -10%, rgba(0,208,255,0.2), transparent 60%),radial-gradient(900px 600px at 80% 30%, rgba(245,2,255,0.16), transparent 60%);background-position:center, center bottom, center, center;background-size:cover, cover, auto, auto;background-repeat:no-repeat, no-repeat, no-repeat, no-repeat;background-color:#000;">
      <div class="mb-6 mt-2 flex justify-center" style="min-height:32px"></div>
      <h1 class="h-display text-[40px] sm:text-[56px] md:text-[72px] xl:text-[104px] max-w-5xl leading-[1.04]">Powering <span class="cosmic-text">Polkadot</span><br>from all around the world.</h1>
      <p class="mt-8 max-w-xl text-base md:text-lg text-paper-muted leading-relaxed">Free public RPC for Polkadot. Member-owned bare metal, GeoDNS-routed, no API keys, no rate limits.</p>
      <div class="mt-10 w-full max-w-xl">
        <p class="text-[11px] uppercase tracking-[0.24em] text-paper-dim mb-3">Quick connect</p>
        <div class="group w-full max-w-full min-w-0 flex items-center gap-2 px-3 py-2 rounded bg-ink-800 border border-ink-600 text-left">
          <span class="text-[10px] uppercase tracking-wider text-paper-dim shrink-0">Asset Hub Polkadot</span>
          <code class="flex-1 min-w-0 max-w-full block font-mono text-xs text-paper overflow-hidden whitespace-nowrap" style="text-align:left">wss://asset-hub-polkadot.dotters.network</code>
          <span class="text-xs shrink-0 text-paper-dim inline-flex items-center gap-1"><span class="i-mdi-content-copy"></span>copy</span>
        </div>
      </div>
      <div class="mt-8 flex flex-wrap justify-center gap-3">
        <a href="/endpoints" class="pill-cta">All chains →</a>
        <a href="/members" class="pill">Members</a>
      </div>
    </section></main>`;

function prerenderPlugin(): Plugin {
  const HOST = 'https://ibp.network';
  const TITLE_SUFFIX = 'IBP — Public RPC endpoints for Polkadot';
  type RouteMeta = {
    url: string;
    title: string;
    description: string;
    /** Present only for blog posts → emits BlogPosting JSON-LD. */
    article?: { headline: string; datePublished: string; author: string };
  };

  function staticRoutes(): RouteMeta[] {
    return [
      { url: '/endpoints',  title: `Endpoints · ${TITLE_SUFFIX}`,  description: 'Public WSS and HTTPS endpoints for Polkadot, Kusama, and every Asset Hub. Two GeoDNS pools (dotters.network, ibp.network), bootnodes for trustless smoldot sync, no keys, no rate limits.' },
      { url: '/members',    title: `Members · ${TITLE_SUFFIX}`,    description: 'Seven independent operators run the IBP across five continents — bare-metal hardware, member-owned datacentres, GeoDNS-routed. Live service map and full roster.' },
      { url: '/build',      title: `Build · ${TITLE_SUFFIX}`,      description: 'Developer documentation for building on Polkadot via IBP public RPC: PAPI, reactive-dot, Dedot, subxt, viem, ethers, smoldot, EVM on Asset Hub.' },
      { url: '/operations', title: `Operations · ${TITLE_SUFFIX}`, description: 'How the Infrastructure Builders’ Programme is run, audited, and built. Governance, funding, member roster, hardware standards.' },
      { url: '/blog',       title: `Blog · ${TITLE_SUFFIX}`,       description: 'Announcements, technical updates, and governance notes from IBP members — funding cycles, operator changes, design decisions.' },
      { url: '/contact',    title: `Contact · ${TITLE_SUFFIX}`,    description: 'No ticket forms, no support email — the IBP operators sit in one public Matrix room. Endpoint issues, integration help, GeoDNS routing questions, anything.' },
    ];
  }

  function treeRoutes(tree: WikiCategory[], urlPrefix: string, suffix: string): RouteMeta[] {
    const out: RouteMeta[] = [];
    const visit = (slug: string, title: string, description: string | undefined) => {
      // Skip the section suffix when the page title already matches it
      // (avoids "Operations · Operations · IBP..." for the Operations page).
      const titleParts = title.toLowerCase() === suffix.toLowerCase()
        ? `${title} · ${TITLE_SUFFIX}`
        : `${title} · ${suffix} · ${TITLE_SUFFIX}`;
      out.push({
        url: `${urlPrefix}/${slug}`,
        title: titleParts,
        description: description ?? `${title} — ${suffix} documentation for IBP.`,
      });
    };
    for (const cat of tree) {
      for (const p of cat.pages) visit(p.path, p.title, p.description);
      for (const g of cat.groups) for (const p of g.pages) visit(p.path, p.title, p.description);
    }
    return out;
  }

  function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** Build a BreadcrumbList for a route. Each segment becomes a list item;
   *  segments are humanized (kebab-case → Title Case). Helps Google show
   *  breadcrumb trails in search results for nested URLs. */
  function breadcrumbJsonLd(routeUrl: string): string | null {
    if (routeUrl === '/') return null;
    const segments = routeUrl.split('/').filter(Boolean);
    if (segments.length === 0) return null;
    // Per-segment overrides for initialisms / proper nouns that don't
    // round-trip through naive Title Case (e.g. "papi" → "Papi" looks bad).
    const overrides: Record<string, string> = {
      'papi': 'PAPI',
      'evm': 'EVM',
      'llm-and-agents': 'LLMs and agents',
      'reactive-dot': 'reactive-dot',
    };
    const humanize = (s: string) =>
      overrides[s] ?? s.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const items: Array<{ '@type': string; position: number; name: string; item: string }> = [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${HOST}/` },
    ];
    let path = '';
    segments.forEach((seg, i) => {
      path += `/${seg}`;
      items.push({ '@type': 'ListItem', position: i + 2, name: humanize(seg), item: `${HOST}${path}` });
    });
    const data = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: items,
    };
    return `    <script type="application/ld+json">${JSON.stringify(data)}</script>`;
  }

  /** FAQPage for /endpoints. The answers literally contain the wss URLs:
   *  this is what Google rich-results and LLM answer-engines lift verbatim
   *  when someone asks "what's the public Polkadot RPC?". Only emitted on
   *  /endpoints — FAQPage must reflect on-page content. */
  function faqJsonLd(routeUrl: string): string | null {
    if (routeUrl !== '/endpoints') return null;
    const qa: Array<[string, string]> = [
      [
        'What is the public RPC endpoint for Polkadot Asset Hub?',
        'wss://asset-hub-polkadot.dotters.network (or the redundant pool wss://asset-hub-polkadot.ibp.network). It is free, needs no API key, applies no rate limits, and is GeoDNS-routed to the nearest IBP operator. Asset Hub is the consumer chain — balances, assets, NFTs, and EVM contracts live there.',
      ],
      [
        'What is the public RPC endpoint for the Polkadot relay chain?',
        'wss://polkadot.dotters.network (or wss://polkadot.ibp.network). The relay chain is only needed if you run a validator or a parachain collator; wallets, dApps, and indexers should use Asset Hub instead.',
      ],
      [
        'What is the public Kusama RPC endpoint?',
        'Kusama relay: wss://kusama.dotters.network. Kusama Asset Hub: wss://asset-hub-kusama.dotters.network. Both are free, key-less, and rate-limit-free, with an ibp.network mirror pool for failover.',
      ],
      [
        'Do I need an API key or account for IBP public RPC?',
        'No. The Infrastructure Builders’ Programme RPC requires no API key, no sign-up, and applies no rate limits. It is treasury-funded public infrastructure.',
      ],
      [
        'How do I connect trustlessly with a light client?',
        'Use the chain spec linked on each endpoint card with a smoldot light client. IBP bootnodes are baked into the official Polkadot chain specs, so smoldot reaches the network with no hosted RPC in the request path.',
      ],
    ];
    const data = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: qa.map(([q, a]) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    };
    return `    <script type="application/ld+json">${JSON.stringify(data)}</script>`;
  }

  /** BlogPosting for /blog/:slug. Gives crawlers + answer-engines a dated,
   *  attributed article object (freshness + authority signal). */
  function blogPostingJsonLd(m: RouteMeta): string | null {
    if (!m.article) return null;
    const data = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: m.article.headline,
      description: m.description,
      datePublished: m.article.datePublished,
      dateModified: m.article.datePublished,
      author: { '@type': 'Organization', name: m.article.author },
      publisher: {
        '@type': 'Organization',
        name: "Infrastructure Builders' Programme",
        logo: { '@type': 'ImageObject', url: 'https://ibp.network/ibp-logo.svg' },
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': `${HOST}${m.url}` },
    };
    return `    <script type="application/ld+json">${JSON.stringify(data)}</script>`;
  }

  function rewriteForRoute(template: string, m: RouteMeta, chunkPreload: string | null): string {
    const t = escapeHtml(m.title);
    const d = escapeHtml(m.description);
    const u = `${HOST}${m.url}`;
    let out = template;
    out = out.replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`);
    out = out.replace(/(<meta name="description" content=")[^"]*(")/, `$1${d}$2`);
    out = out.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${u}$2`);
    out = out.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${t}$2`);
    out = out.replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${d}$2`);
    out = out.replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${u}$2`);
    out = out.replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${t}$2`);
    out = out.replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${d}$2`);
    // The hero background is only used on the homepage. On every other
    // route the preload fires and triggers a "preloaded but not used" warning
    // (and wastes a request). Strip it from per-route HTML.
    out = out.replace(
      /\s*<link rel="preload"[^>]*figma-hero-bg\.webp[^>]*\/?>\s*/,
      '\n    ',
    );
    // Inject BreadcrumbList JSON-LD + route-specific modulepreload before </head>.
    const extras: string[] = [];
    if (chunkPreload) {
      extras.push(`    <link rel="modulepreload" href="/assets/${chunkPreload}" crossorigin />`);
    }
    const crumbs = breadcrumbJsonLd(m.url);
    if (crumbs) extras.push(crumbs);
    const faq = faqJsonLd(m.url);
    if (faq) extras.push(faq);
    const posting = blogPostingJsonLd(m);
    if (posting) extras.push(posting);
    if (extras.length) {
      out = out.replace(/(\n\s*)<\/head>/, `\n${extras.join('\n')}$1</head>`);
    }
    return out;
  }

  return {
    name: 'ibp-prerender',
    apply: 'build',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      const srcRoot = path.resolve(__dirname, 'src');
      let template = readFileSync(path.join(distDir, 'index.html'), 'utf8');

      // Inline the main CSS bundle so HTML+CSS fits in the TCP slow-start
      // window (~14 KB on the first RTT). Removes one render-blocking
      // round-trip; subsequent route navigations don't re-fetch the
      // stylesheet either since each prerendered HTML is self-contained.
      const cssFile = readdirSync(path.join(distDir, 'assets'))
        .find((n) => n.startsWith('index-') && n.endsWith('.css'));
      if (cssFile) {
        const css = readFileSync(path.join(distDir, 'assets', cssFile), 'utf8');
        template = template.replace(
          /<link[^>]*rel="stylesheet"[^>]*\/assets\/index-[^"]*\.css"[^>]*>/,
          `<style>${css}</style>`,
        );
      }

      // No font preload injection — we ship zero web fonts. System fonts
      // (Avenir Next on Apple, Segoe UI on Windows, Cantarell on Linux)
      // are already in memory, so nothing on the LCP path needs the
      // network.
      writeFileSync(path.join(distDir, 'index.html'), template);

      const { docs, wiki, posts } = buildContentTrees(srcRoot);

      // Inject the homepage hero structure into dist/index.html so the user
      // sees the headline + tagline + endpoint URL before JS executes. The
      // static markup mirrors the JSX in HomePage.tsx; when Solid `render()`
      // mounts, the structure matches and the swap is visually invisible.
      // Dynamic widgets (LiveBlock pill, RoutedTo, ConnectingTabs) keep
      // placeholder space so layout doesn't shift on hydration.
      const homepageHtml = readFileSync(path.join(distDir, 'index.html'), 'utf8')
        .replace(/<div id="root"><\/div>/, `<div id="root">${HOMEPAGE_SSG}</div>`);
      writeFileSync(path.join(distDir, 'index.html'), homepageHtml);

      // Map each route to the lazy chunk it renders, so we can preload it
      // in parallel with the entry script. Chunks are fingerprinted; resolve
      // names from the actual dist/assets directory.
      const assetDir = path.join(distDir, 'assets');
      const assets = readdirSync(assetDir);
      const findChunk = (prefix: string): string | null =>
        assets.find((n) => n.startsWith(prefix + '-') && n.endsWith('.js')) ?? null;
      const chunkByRoute = (url: string): string | null => {
        if (url === '/endpoints')        return findChunk('EndpointsPage');
        if (url === '/members')          return findChunk('MembersPage');
        if (url === '/contact')          return findChunk('ContactPage');
        if (url === '/blog')             return findChunk('BlogPage');
        if (url.startsWith('/blog/'))    return findChunk('BlogPostPage');
        if (url === '/build' || url.startsWith('/build/'))           return findChunk('DocsPage');
        if (url === '/operations' || url.startsWith('/operations/')) return findChunk('OperationsPage');
        return null;
      };

      const routes: RouteMeta[] = [
        ...staticRoutes(),
        ...treeRoutes(docs, '/build', 'Build'),
        ...treeRoutes(wiki, '/operations', 'Operations'),
        ...posts.map((p) => ({
          url: `/blog/${p.slug}`,
          title: `${p.title} · Blog · ${TITLE_SUFFIX}`,
          description:
            p.description ??
            `IBP blog post — ${p.title}${p.date ? ` (${p.date})` : ''}.`,
          article: {
            headline: p.title,
            datePublished: p.date,
            author: p.author ?? 'Rotko Networks',
          },
        })),
      ];

      for (const m of routes) {
        const dir = path.join(distDir, m.url);
        mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, 'index.html'), rewriteForRoute(template, m, chunkByRoute(m.url)));
      }
      console.log(`[prerender] wrote ${routes.length} per-route HTML files`);

      // RSS 2.0 feed for /blog — freshness/discovery signal for crawlers
      // and aggregators. Sorted newest-first.
      const xmlEsc = (s: string) =>
        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const sortedPosts = [...posts].sort((a, b) => (a.date < b.date ? 1 : -1));
      const items = sortedPosts
        .map((p) => {
          const link = `https://ibp.network/blog/${p.slug}`;
          const pub = new Date(`${p.date}T00:00:00Z`).toUTCString();
          return (
            `    <item>\n` +
            `      <title>${xmlEsc(p.title)}</title>\n` +
            `      <link>${link}</link>\n` +
            `      <guid isPermaLink="true">${link}</guid>\n` +
            `      <pubDate>${pub}</pubDate>\n` +
            `      <dc:creator>${xmlEsc(p.author ?? 'Rotko Networks')}</dc:creator>\n` +
            `      <description>${xmlEsc(p.description ?? p.title)}</description>\n` +
            `    </item>`
          );
        })
        .join('\n');
      const rss =
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">\n` +
        `  <channel>\n` +
        `    <title>IBP — News from the network</title>\n` +
        `    <link>https://ibp.network/blog</link>\n` +
        `    <atom:link href="https://ibp.network/blog/rss.xml" rel="self" type="application/rss+xml" />\n` +
        `    <description>Announcements, technical updates, and governance notes from IBP operators.</description>\n` +
        `    <language>en</language>\n` +
        `${items}\n` +
        `  </channel>\n` +
        `</rss>\n`;
      mkdirSync(path.join(distDir, 'blog'), { recursive: true });
      writeFileSync(path.join(distDir, 'blog', 'rss.xml'), rss);
      console.log(`[rss] wrote ${sortedPosts.length} items to dist/blog/rss.xml`);
    },
  };
}

/**
 * Dev-only: scope the hero-background preload to the homepage.
 *
 * index.html statically declares `<link rel="preload" ... figma-hero-bg.webp>`
 * because that WebP is the homepage LCP image and the preload scanner must
 * see it before JS. In production prerenderPlugin strips that line from every
 * per-route HTML except `/`. The dev server has no prerender — it serves the
 * raw index.html for every SPA route — so /members, /build, etc. fire an
 * unused preload and log "preloaded but not used". This mirrors the prod
 * strip in dev so dev === prod and the console stays clean.
 */
function heroPreloadDevScopePlugin(): Plugin {
  return {
    name: 'ibp-hero-preload-dev-scope',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (ctx.path === '/' || ctx.path === '/index.html') return html;
        return html.replace(
          /\s*<link rel="preload"[^>]*figma-hero-bg\.webp[^>]*\/?>\s*/,
          '\n    ',
        );
      },
    },
  };
}

export default defineConfig({
  plugins: [
    solidPlugin(),
    UnocssPlugin(),
    wikiContentPlugin(),
    configMirrorPlugin(),
    sitemapPlugin(),
    prerenderPlugin(),
    heroPreloadDevScopePlugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        // Rolldown requires a function for manualChunks (Rollup accepted an
        // object); keeping the same vendor-chunk shape, just function form.
        manualChunks(id: string): string | undefined {
          if (
            id.includes('node_modules/solid-js') ||
            id.includes('node_modules/@solidjs')
          ) {
            return 'vendor';
          }
          return undefined;
        },
      },
    },
  },
  optimizeDeps: {
    include: ['solid-js'],
  },
  assetsInclude: ['**/*.md'],
});
