/**
 * Shared types for the wiki / docs trees.
 *
 * Lives in a separate file so both runtime (`wiki.ts`) and the build-time
 * parser (`wiki-build.ts`) can import them without circular dependencies.
 */

export type WikiPage = {
  /** URL path *relative to the tree's URL prefix*. E.g. "basics/introduction". */
  path: string;
  /** Human-facing nav label. */
  label: string;
  /** Page <h1> / browser title. */
  title: string;
  /** Optional sub-heading line. */
  description?: string;
  /** Sort key inside its parent. */
  position: number;
  /** Rendered HTML — pre-computed at build time. */
  html: string;
};

export type WikiGroup = {
  /** Slug segment, e.g. "hypervisors". */
  slug: string;
  label: string;
  description?: string;
  position: number;
  pages: WikiPage[];
};

export type WikiCategory = {
  /** Slug segment, e.g. "members". */
  slug: string;
  label: string;
  description?: string;
  position: number;
  /** Pages that live directly under the category (no group). */
  pages: WikiPage[];
  /** Nested groups (used by wiki/6-members; docs/* is flat). */
  groups: WikiGroup[];
};
