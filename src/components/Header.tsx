import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js';
import { A, useLocation } from '@solidjs/router';
import { nav, site } from '@/data/site';

export default function Header() {
  const [open, setOpen] = createSignal(false);
  const location = useLocation();
  const isActive = (href: string) =>
    href === '/' ? location.pathname === '/' : location.pathname.startsWith(href);

  let toggleBtn: HTMLButtonElement | undefined;

  const close = () => {
    setOpen(false);
    toggleBtn?.focus();
  };

  createEffect(() => {
    if (!open()) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    onCleanup(() => document.removeEventListener('keydown', onKey));
  });

  // Close mobile menu when route changes.
  createEffect(() => {
    location.pathname;
    setOpen(false);
  });

  return (
    <header class="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-ink-950/80 border-b border-ink-700">
      <div class="container-page flex items-center justify-between h-16">
        <A href="/" class="flex items-center gap-2 group" aria-label="IBP home">
          <img
            src="/ibp-logo.svg"
            alt="IBP"
            width="48"
            height="28"
            decoding="async"
            class="h-7 w-auto"
            style={{
              color: '#FFFFFF',
              filter: 'drop-shadow(0 0 12px rgba(255,255,255,0.18))',
            }}
          />
        </A>

        <nav class="hidden md:flex items-center gap-1" aria-label="Primary">
          <For each={nav}>
            {(item) => (
              <A
                href={item.href}
                class="px-3 py-2 text-sm text-paper-muted hover:text-paper transition-colors relative"
                classList={{ 'text-paper': isActive(item.href) }}
              >
                {item.label}
                <Show when={isActive(item.href)}>
                  <span class="absolute bottom-1 left-3 right-3 h-px cosmic-bar" />
                </Show>
              </A>
            )}
          </For>
          <a
            href={site.links.github}
            target="_blank"
            rel="noreferrer"
            class="ml-3 inline-flex items-center gap-2 px-3 py-2 text-sm text-paper-muted hover:text-paper transition-colors"
            aria-label="GitHub"
          >
            <span class="i-mdi-github text-lg" />
          </a>
        </nav>

        <button
          ref={toggleBtn}
          type="button"
          class="md:hidden inline-flex items-center justify-center min-w-11 min-h-11 p-2 text-paper -mr-2"
          aria-label={open() ? 'Close menu' : 'Open menu'}
          aria-expanded={open()}
          aria-controls="mobile-nav"
          onClick={() => setOpen(!open())}
        >
          <span class={open() ? 'i-mdi-close text-2xl' : 'i-mdi-menu text-2xl'} />
        </button>
      </div>

      <Show when={open()}>
        <div id="mobile-nav" class="md:hidden border-t border-ink-700 bg-ink-950">
          <nav class="container-page py-4 flex flex-col gap-1" aria-label="Primary mobile">
            <For each={nav}>
              {(item) => (
                <A
                  href={item.href}
                  class="px-3 py-2 text-paper-muted hover:text-paper"
                  classList={{ 'text-brand-300': isActive(item.href) }}
                  onClick={close}
                >
                  {item.label}
                </A>
              )}
            </For>
            <a
              href={site.links.github}
              target="_blank"
              rel="noreferrer"
              class="px-3 py-2 text-paper-muted hover:text-paper inline-flex items-center gap-2"
              onClick={close}
            >
              <span class="i-mdi-github" /> GitHub
            </a>
          </nav>
        </div>
      </Show>
    </header>
  );
}
