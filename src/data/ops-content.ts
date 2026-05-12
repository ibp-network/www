/**
 * Operations wiki tree — pre-rendered HTML for src/wiki/**.
 *
 * Consumed only by OperationsPage. Kept in its own module so Rollup splits
 * it into the /operations route's chunk; /build and /blog never pay the
 * operations payload.
 */

import { wiki } from 'virtual:ibp-wiki';
import { findPage, firstPage } from './wiki';
import type { WikiCategory, WikiPage } from './wiki-types';

export function loadWikiTree(): WikiCategory[] {
  return wiki;
}

export function loadWikiPage(slug: string): WikiPage | undefined {
  return findPage(wiki, slug);
}

export function defaultWikiPage(): WikiPage | undefined {
  return firstPage(wiki);
}
