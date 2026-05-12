import { createSignal, For, Show } from 'solid-js';
import { libraries, type Library } from '@/data/connecting';
import CopyableEndpoint from './CopyableEndpoint';

export default function ConnectingTabs(props: { defaultKey?: string }) {
  const [active, setActive] = createSignal(
    libraries.find((l) => l.key === props.defaultKey) ?? libraries[0],
  );

  const set = (lib: Library) => setActive(lib);

  return (
    <div>
      {/* Horizontal scroll on narrow viewports — keeps tabs on one row
          instead of wrapping into a ragged block. Gradient + brighter
          border on the active tab so the selection is obvious at a glance. */}
      <div
        role="tablist"
        aria-label="Library"
        class="flex flex-nowrap gap-2 overflow-x-auto pb-1 -mx-1 px-1 scroll-smooth snap-x"
        style={{ 'scrollbar-width': 'thin' }}
      >
        <For each={libraries}>
          {(lib) => {
            const isActive = () => active().key === lib.key;
            return (
              <button
                type="button"
                role="tab"
                aria-selected={isActive()}
                aria-controls={`connecting-panel-${lib.key}`}
                id={`connecting-tab-${lib.key}`}
                onClick={() => set(lib)}
                class="pill-sm shrink-0 snap-start"
                classList={{
                  'border-cyan/60 text-white shadow-[0_0_24px_rgba(0,208,255,0.18)]': isActive(),
                  'opacity-60 hover:opacity-100': !isActive(),
                }}
                style={
                  isActive()
                    ? { background: 'linear-gradient(135deg, rgba(0,208,255,0.28), rgba(245,2,255,0.28))' }
                    : undefined
                }
              >
                {lib.name}
              </button>
            );
          }}
        </For>
      </div>

      <div
        id={`connecting-panel-${active().key}`}
        role="tabpanel"
        aria-labelledby={`connecting-tab-${active().key}`}
        class="mt-5 card p-0 overflow-hidden"
      >
        <div class="flex items-center justify-between border-b border-ink-500 px-5 py-3">
          <div class="flex items-center gap-2 text-sm">
            <span class="text-cyan">{active().name}</span>
            <span class="text-paper-dim">·</span>
            <code class="font-mono text-paper-dim">{active().install}</code>
          </div>
          <Show when={active().docsUrl}>
            <a
              href={active().docsUrl}
              target="_blank"
              rel="noreferrer"
              class="text-xs text-paper-dim hover:text-cyan inline-flex items-center gap-1"
            >
              Docs <span class="i-mdi-arrow-top-right" />
            </a>
          </Show>
        </div>
        <pre class="p-5 m-0 overflow-x-auto text-xs md:text-sm font-mono leading-relaxed text-paper bg-ink-900"><code>{active().code}</code></pre>
        <Show when={active().note}>
          <div class="px-5 py-3 border-t border-ink-500 text-xs text-paper-dim">
            {active().note}
          </div>
        </Show>
      </div>

      <div class="mt-5">
        <CopyableEndpoint
          url="wss://asset-hub-polkadot.dotters.network"
          label="Asset Hub WSS"
        />
      </div>
    </div>
  );
}
