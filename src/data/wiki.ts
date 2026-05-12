/**
 * Public types for the wiki / docs trees. Split into per-tree modules
 * (`docs-content.ts`, `ops-content.ts`) so each route only ships the data
 * it actually renders. This file just re-exports the types.
 */

export type { WikiCategory, WikiGroup, WikiPage } from './wiki-types';

/* ---------- shared lookup helpers ---------- */

import type { WikiCategory, WikiPage } from './wiki-types';

export function findPage(tree: WikiCategory[], slug: string): WikiPage | undefined {
  for (const cat of tree) {
    for (const p of cat.pages) if (p.path === slug) return p;
    for (const g of cat.groups) for (const p of g.pages) if (p.path === slug) return p;
  }
  return undefined;
}

export function firstPage(tree: WikiCategory[]): WikiPage | undefined {
  for (const cat of tree) {
    if (cat.pages.length > 0) return cat.pages[0];
    for (const g of cat.groups) if (g.pages.length > 0) return g.pages[0];
  }
  return undefined;
}
