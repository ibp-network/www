import { createResource, For, Show, Suspense } from 'solid-js';
import { A } from '@solidjs/router';
import { loadPosts } from '@/utils/markdown';
import { useDocMeta } from '@/utils/title';

/** "2026-05-12" → "May 12, 2026". Falls back to the raw string on parse failure. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function BlogPage() {
  useDocMeta({
    title: 'Blog',
    description:
      'Announcements, technical updates, and governance notes from IBP members: funding cycles, operator changes, design decisions.',
  });
  const [posts] = createResource(loadPosts);

  return (
    <section class="section">
      <div class="container-page">
        <p class="eyebrow mb-3">Blog</p>
        <h1 class="h-display text-4xl md:text-5xl">News from the network.</h1>
        <p class="mt-6 max-w-2xl text-paper-muted">
          Announcements, technical updates, and governance notes from IBP members.
        </p>

        <Suspense fallback={<p class="mt-12 text-paper-dim">Loading…</p>}>
          <Show
            when={posts() && posts()!.length > 0}
            fallback={<p class="mt-12 text-paper-dim">No posts yet.</p>}
          >
            <div class="mt-12 grid gap-4 md:grid-cols-2">
              <For each={posts()}>
                {(p) => (
                  <A href={`/blog/${p.slug}`} class="card-hover block">
                    <Show when={p.date}>
                      <time class="text-xs uppercase tracking-wider text-paper-dim" datetime={p.date}>
                        {formatDate(p.date!)}
                      </time>
                    </Show>
                    <h3 class="mt-2 font-display text-xl font-bold">{p.title}</h3>
                    <Show when={p.description}>
                      <p class="mt-2 text-sm text-paper-muted">{p.description}</p>
                    </Show>
                    <Show when={p.author}>
                      <p class="mt-4 text-xs text-paper-dim">by {p.author}</p>
                    </Show>
                  </A>
                )}
              </For>
            </div>
          </Show>
        </Suspense>
      </div>
    </section>
  );
}
