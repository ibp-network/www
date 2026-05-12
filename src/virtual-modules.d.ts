/**
 * Ambient declarations for Vite virtual modules emitted by plugins in
 * `vite.config.ts`. Keeps the runtime imports type-safe even though the
 * actual module content is generated at build time.
 *
 * One virtual per content tree so each route only ships the data it needs.
 */

declare module 'virtual:ibp-docs' {
  import type { WikiCategory } from '@/data/wiki-types';
  export const docs: WikiCategory[];
}

declare module 'virtual:ibp-wiki' {
  import type { WikiCategory } from '@/data/wiki-types';
  export const wiki: WikiCategory[];
}

declare module 'virtual:ibp-posts' {
  export type BlogPost = {
    slug: string;
    title: string;
    date: string;
    description?: string;
    author?: string;
    tags?: string[];
    html: string;
  };
  export const posts: BlogPost[];
}
