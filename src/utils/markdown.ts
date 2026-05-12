/**
 * Runtime blog post lookup.
 *
 * Posts are pre-rendered at build time by the `wiki-content` Vite plugin
 * (see vite.config.ts). The virtual module emits HTML strings + metadata
 * so the runtime never has to ship remark.
 */

import { posts as builtPosts, type BlogPost } from 'virtual:ibp-posts';

export type Post = BlogPost;

export function loadPosts(): Promise<Post[]> {
  // Async to preserve the existing call sites (BlogPage/BlogPostPage use
  // createResource), but the data is already in memory.
  return Promise.resolve(builtPosts);
}

export function loadPost(slug: string): Promise<Post | undefined> {
  return Promise.resolve(builtPosts.find((p) => p.slug === slug));
}
