import { createResource, Show, Suspense } from 'solid-js';
import { A, useParams } from '@solidjs/router';
import { loadPost } from '@/utils/markdown';
import { useDocMeta } from '@/utils/title';
import { members } from '@/data/members';

/** "2026-05-12" → "May 12, 2026". Falls back to the raw string on parse failure. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Match a markdown frontmatter `author:` string to a known member and
 * return its website URL, if any. */
function authorUrl(name: string | undefined): string | undefined {
  if (!name) return undefined;
  return members.find((m) => m.name === name)?.website;
}

export default function BlogPostPage() {
  const params = useParams<{ slug: string }>();
  const [post] = createResource(() => params.slug, loadPost);
  useDocMeta(() => {
    const p = post();
    if (!p) return null;
    return {
      title: p.title,
      description:
        p.description ??
        `IBP blog post: ${p.title}${p.date ? ` (${p.date})` : ''}.`,
    };
  });

  return (
    <article class="section">
      <div class="container-page max-w-3xl">
        <A href="/blog" class="text-sm text-paper-dim hover:text-paper inline-flex items-center gap-1">
          <span class="i-mdi-arrow-right rotate-180" /> All posts
        </A>

        <Suspense fallback={<p class="mt-8 text-paper-dim">Loading…</p>}>
          <Show
            when={post()}
            fallback={
              <div class="mt-12">
                <h1 class="h-display text-4xl">Post not found.</h1>
                <p class="mt-4 text-paper-muted">That post doesn't exist or has been removed.</p>
              </div>
            }
          >
            {(p) => (
              <>
                <header class="mt-8 border-b border-ink-700 pb-8">
                  <Show when={p().date}>
                    <time class="eyebrow" datetime={p().date}>
                      {formatDate(p().date!)}
                    </time>
                  </Show>
                  <h1 class="mt-2 h-display text-4xl md:text-5xl">{p().title}</h1>
                  <Show when={p().author}>
                    <p class="mt-4 text-sm text-paper-dim">
                      by{' '}
                      <Show when={authorUrl(p().author)} fallback={p().author}>
                        <a
                          href={authorUrl(p().author)}
                          target="_blank"
                          rel="noreferrer"
                          class="text-cyan hover:text-magenta transition-colors"
                        >
                          {p().author}
                        </a>
                      </Show>
                    </p>
                  </Show>
                </header>
                <div class="mt-10 prose-ibp" innerHTML={p().html} />
              </>
            )}
          </Show>
        </Suspense>
      </div>
    </article>
  );
}
