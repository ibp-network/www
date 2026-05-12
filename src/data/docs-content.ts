/**
 * Developer docs tree — pre-rendered HTML for src/docs/**.
 *
 * Consumed only by DocsPage. Kept in its own module so Rollup splits
 * it into the /build route's chunk; /operations and /blog never pay
 * the docs payload.
 */

import { docs } from 'virtual:ibp-docs';
import { findPage, firstPage } from './wiki';
import type { WikiCategory, WikiPage } from './wiki-types';

export function loadDocsTree(): WikiCategory[] {
  return docs;
}

export function loadDocsPage(slug: string): WikiPage | undefined {
  return findPage(docs, slug);
}

export function defaultDocsPage(): WikiPage | undefined {
  return firstPage(docs);
}
