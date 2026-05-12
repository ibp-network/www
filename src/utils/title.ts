import { createEffect, onCleanup } from 'solid-js';

const BASE = 'IBP';
const TAGLINE = 'Public RPC endpoints for Polkadot';

/**
 * Set document.title for the current route. SPA routing doesn't update
 * the title automatically — search engines and browser-tab UIs need it.
 *
 * Pass a title segment (e.g. "Members") and the helper composes:
 *    Members · IBP — Public RPC endpoints for Polkadot
 *
 * Pass null to reset to the homepage default.
 */
export function useDocTitle(segment: string | (() => string | null)) {
  createEffect(() => {
    const s = typeof segment === 'function' ? segment() : segment;
    const prev = document.title;
    document.title = s ? `${s} · ${BASE} — ${TAGLINE}` : `${BASE} — ${TAGLINE}`;
    onCleanup(() => {
      document.title = prev;
    });
  });
}

/**
 * Per-route SEO metadata. Updates the title plus:
 *   - meta[name=description]
 *   - link[rel=canonical]
 *   - og:title, og:description, og:url
 *   - twitter:title, twitter:description
 *
 * The canonical URL self-references the current host so the site works
 * correctly when served from any domain (ibp.rotko.net mirror today,
 * ibp.network long-term) without code change. JS-rendering crawlers
 * (Googlebot) pick these up; non-JS crawlers see the static index.html
 * defaults until we add prerendering.
 */
export type DocMeta = {
  title: string;       // page-specific segment, e.g. "Endpoints"
  description: string; // 1-sentence summary, ~155 chars max for SERP
};

export function useDocMeta(meta: DocMeta | (() => DocMeta | null)) {
  createEffect(() => {
    const m = typeof meta === 'function' ? meta() : meta;
    if (!m) return;

    const fullTitle = `${m.title} · ${BASE} — ${TAGLINE}`;
    const url =
      typeof window === 'undefined'
        ? `https://ibp.rotko.net${m.title === BASE ? '' : ''}`
        : `${window.location.origin}${window.location.pathname}`;

    const prev = {
      title: document.title,
      description: getMeta('name', 'description'),
      canonical: getLinkHref('canonical'),
      ogTitle: getMeta('property', 'og:title'),
      ogDescription: getMeta('property', 'og:description'),
      ogUrl: getMeta('property', 'og:url'),
      twitterTitle: getMeta('name', 'twitter:title'),
      twitterDescription: getMeta('name', 'twitter:description'),
    };

    document.title = fullTitle;
    setMeta('name', 'description', m.description);
    setLinkHref('canonical', url);
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', m.description);
    setMeta('property', 'og:url', url);
    setMeta('name', 'twitter:title', fullTitle);
    setMeta('name', 'twitter:description', m.description);

    onCleanup(() => {
      document.title = prev.title;
      setMeta('name', 'description', prev.description);
      setLinkHref('canonical', prev.canonical);
      setMeta('property', 'og:title', prev.ogTitle);
      setMeta('property', 'og:description', prev.ogDescription);
      setMeta('property', 'og:url', prev.ogUrl);
      setMeta('name', 'twitter:title', prev.twitterTitle);
      setMeta('name', 'twitter:description', prev.twitterDescription);
    });
  });
}

function getMeta(attr: 'name' | 'property', key: string): string {
  const el = document.querySelector(`meta[${attr}="${key}"]`);
  return el?.getAttribute('content') ?? '';
}

function setMeta(attr: 'name' | 'property', key: string, value: string): void {
  let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

function getLinkHref(rel: string): string {
  const el = document.querySelector(`link[rel="${rel}"]`);
  return el?.getAttribute('href') ?? '';
}

function setLinkHref(rel: string, href: string): void {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}
