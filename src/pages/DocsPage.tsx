import { createMemo, For, Show, type JSX } from 'solid-js';
import { A, useLocation } from '@solidjs/router';
import {
  defaultDocsPage,
  loadDocsPage,
  loadDocsTree,
} from '@/data/docs-content';
import type {
  WikiCategory,
  WikiGroup,
  WikiPage,
} from '@/data/wiki-types';
import { useDocMeta } from '@/utils/title';

/**
 * /docs — developer documentation for building dApps on Polkadot using IBP
 * endpoints. Source: src/docs/**.md (markdown, see src/data/wiki.ts).
 *
 * Routes handled (all enter the same component, location-based page pick):
 *   /docs                                  → first page (start/quickstart)
 *   /docs/:category                        → first page of that category
 *   /docs/:category/:slug                  → top-level page in category
 *   /docs/:category/:group/:slug           → nested page
 *
 * Programme operations / member docs now live at /operations (see
 * OperationsPage.tsx) — same component shape, different markdown tree.
 */

export default function DocsPage() {
  return (
    <TreePage
      tree={loadDocsTree()}
      pageLookup={loadDocsPage}
      defaultPage={defaultDocsPage}
      urlPrefix="/build"
      eyebrow="Developer documentation"
      title={
        <>
          Build on <span class="cosmic-text">Polkadot</span>.
        </>
      }
      intro={
        <>
          Application-side guides for IBP's public RPC: connecting libraries,
          submitting transactions, in-browser light clients, EVM contracts.
          Protocol-level material (runtime, consensus, governance) is at{' '}
          <a
            href="https://docs.polkadot.com"
            target="_blank"
            rel="noreferrer"
            class="text-cyan hover:text-magenta underline underline-offset-4 decoration-cyan/40 inline-flex items-baseline gap-1"
          >
            docs.polkadot.com <span class="i-mdi-arrow-top-right text-[10px]" />
          </a>
          .
        </>
      }
      docTitleSuffix="Build"
      notFoundPrefix="/build"
    />
  );
}

/* ───────────────────────── Generic tree-rendering page ───────────────────── */

export type TreePageProps = {
  tree: WikiCategory[];
  pageLookup: (slug: string) => WikiPage | undefined;
  defaultPage: () => WikiPage | undefined;
  urlPrefix: string;            // "/docs" or "/operations"
  eyebrow: string;
  title: JSX.Element;
  intro: JSX.Element;
  docTitleSuffix: string;       // for the <title> — "Docs" or "Operations"
  notFoundPrefix: string;
};

export function TreePage(props: TreePageProps): JSX.Element {
  const location = useLocation();
  const stripRe = new RegExp(`^${props.urlPrefix}\\/?`);

  const currentSlug = createMemo(() => {
    return location.pathname.replace(stripRe, '').replace(/\/$/, '');
  });

  const currentPage = createMemo<WikiPage | undefined>(() => {
    const slug = currentSlug();
    if (!slug) return props.defaultPage();

    const exact = props.pageLookup(slug);
    if (exact) return exact;

    const segs = slug.split('/');
    if (segs.length === 1) {
      const cat = props.tree.find((c) => c.slug === segs[0]);
      if (cat) {
        if (cat.pages.length > 0) return cat.pages[0];
        for (const g of cat.groups) if (g.pages.length > 0) return g.pages[0];
      }
    }
    if (segs.length === 2) {
      const cat = props.tree.find((c) => c.slug === segs[0]);
      const grp = cat?.groups.find((g) => g.slug === segs[1]);
      if (grp && grp.pages.length > 0) return grp.pages[0];
    }
    return undefined;
  });

  useDocMeta(() => {
    const p = currentPage();
    const title = p ? `${p.title} · ${props.docTitleSuffix}` : props.docTitleSuffix;
    const description =
      p?.description ??
      (props.docTitleSuffix === 'Build'
        ? 'Developer documentation for building on Polkadot via IBP public RPC: PAPI, reactive-dot, Dedot, subxt, viem, ethers, smoldot, EVM on Asset Hub.'
        : 'How the Infrastructure Builders’ Programme is run, audited, and built. Governance, funding, member roster, hardware standards.');
    return { title, description };
  });

  return (
    <section class="section">
      <div class="container-page">
        <p class="eyebrow mb-3">{props.eyebrow}</p>
        <h1 class="h-display text-4xl md:text-5xl max-w-3xl">{props.title}</h1>
        <p class="mt-6 max-w-2xl text-lg text-paper-muted leading-relaxed">
          {props.intro}
        </p>

        <div class="mt-12 grid gap-8 md:gap-10 lg:gap-12 lg:grid-cols-[18rem_1fr]">
          <Sidebar tree={props.tree} currentSlug={currentSlug()} urlPrefix={props.urlPrefix} />
          <DocContent page={currentPage()} slug={currentSlug()} notFoundPrefix={props.notFoundPrefix} />
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────── sidebar ────────────────────────────────── */

function NavTree(props: { tree: WikiCategory[]; currentSlug: string; urlPrefix: string }) {
  return (
    <nav class="space-y-6 text-sm">
      <For each={props.tree}>
        {(cat) => <CategoryBlock cat={cat} currentSlug={props.currentSlug} urlPrefix={props.urlPrefix} />}
      </For>
    </nav>
  );
}

function Sidebar(props: { tree: WikiCategory[]; currentSlug: string; urlPrefix: string }) {
  return (
    <>
      {/* Mobile: the full nav tree stacked above the article pushed the
          doc you tapped ~1250px down the page (1.5 screens of scroll past
          title + intro + 22 nav links). Collapse it behind a disclosure
          so the content sits right under the page header. Desktop is
          unchanged — the sticky sidebar below. */}
      <details class="group lg:hidden rounded-lg border border-ink-600 bg-ink-900/40">
        <summary class="cursor-pointer list-none px-4 py-3 flex items-center justify-between text-sm font-medium text-paper">
          <span class="inline-flex items-center gap-2">
            <span class="i-mdi-book-open-page-variant text-cyan" /> Browse docs
          </span>
          <span class="i-mdi-chevron-down text-paper-dim transition-transform group-open:rotate-180" />
        </summary>
        <div class="px-2 pb-3 pt-1 max-h-[60vh] overflow-y-auto border-t border-ink-700">
          <NavTree tree={props.tree} currentSlug={props.currentSlug} urlPrefix={props.urlPrefix} />
        </div>
      </details>

      <aside
        class="hidden lg:block lg:w-72 lg:shrink-0 lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto"
        aria-label="Docs navigation"
      >
        <NavTree tree={props.tree} currentSlug={props.currentSlug} urlPrefix={props.urlPrefix} />
      </aside>
    </>
  );
}

function CategoryBlock(props: { cat: WikiCategory; currentSlug: string; urlPrefix: string }) {
  return (
    <div>
      <div class="px-3 mb-2 text-[11px] uppercase tracking-[0.22em] font-medium text-paper-dim">
        {props.cat.label}
      </div>
      <ul class="space-y-px">
        <For each={props.cat.pages}>
          {(p) => <SidebarLink page={p} currentSlug={props.currentSlug} urlPrefix={props.urlPrefix} />}
        </For>
        <For each={props.cat.groups}>
          {(g) => <GroupBlock group={g} currentSlug={props.currentSlug} urlPrefix={props.urlPrefix} />}
        </For>
      </ul>
    </div>
  );
}

function GroupBlock(props: { group: WikiGroup; currentSlug: string; urlPrefix: string }) {
  return (
    <li class="mt-3">
      <div class="px-3 pb-1 text-[11px] uppercase tracking-wider font-medium text-paper-muted/70">
        {props.group.label}
      </div>
      <ul class="space-y-px">
        <For each={props.group.pages}>
          {(p) => <SidebarLink page={p} currentSlug={props.currentSlug} urlPrefix={props.urlPrefix} />}
        </For>
      </ul>
    </li>
  );
}

function SidebarLink(props: { page: WikiPage; currentSlug: string; urlPrefix: string }): JSX.Element {
  const active = () => props.currentSlug === props.page.path;
  return (
    <li>
      <A
        href={`${props.urlPrefix}/${props.page.path}`}
        class="block px-3 py-1.5 rounded-md transition-colors border-l-2 border-transparent"
        classList={{
          'text-paper bg-glass border-cyan/60': active(),
          'text-paper-muted hover:text-paper hover:bg-glass/60': !active(),
        }}
      >
        {props.page.label}
      </A>
    </li>
  );
}

/* ─────────────────────────── content pane ───────────────────────────────── */

function DocContent(props: { page?: WikiPage; slug: string; notFoundPrefix: string }) {
  return (
    <article class="min-w-0">
      <Show
        when={props.page}
        fallback={
          <div class="card border-magenta/40">
            <h2 class="h-display text-2xl">Page not found</h2>
            <p class="mt-3 text-paper-muted">
              <code class="text-cyan">{props.notFoundPrefix}/{props.slug}</code> doesn't match
              any page. Pick one from the sidebar.
            </p>
          </div>
        }
      >
        {(p) => (
          <>
            <header class="border-b border-ink-700 pb-6 mb-8">
              <h1 class="h-display text-3xl md:text-4xl">{p().title}</h1>
              <Show when={p().description}>
                <p class="mt-2 text-paper-muted">{p().description}</p>
              </Show>
            </header>
            <div class="prose-ibp prose-ibp-docs" innerHTML={p().html} />
          </>
        )}
      </Show>
    </article>
  );
}
