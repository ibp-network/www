import { createSignal, onCleanup, Show } from 'solid-js';

export default function CopyableEndpoint(props: { url: string; label?: string }) {
  const [copied, setCopied] = createSignal(false);
  let timeout: number | undefined;

  onCleanup(() => {
    if (timeout) window.clearTimeout(timeout);
  });

  const flash = () => {
    setCopied(true);
    if (timeout) window.clearTimeout(timeout);
    timeout = window.setTimeout(() => setCopied(false), 1200);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.url);
      flash();
    } catch {
      // Clipboard API can fail on non-secure contexts; fall back to selection.
      const node = document.createTextNode(props.url);
      document.body.appendChild(node);
      const range = document.createRange();
      range.selectNode(node);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      try {
        document.execCommand('copy');
        flash();
      } catch {
        /* user-visible failure not actionable; swallow */
      }
      sel?.removeAllRanges();
      node.remove();
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      // Native tooltip — users hovering see the full URL before they click.
      // Critical for trust: never make someone copy a URL they can't fully see.
      title={props.url}
      aria-label={`Copy ${props.label ?? 'endpoint'}: ${props.url}`}
      class="group w-full max-w-full min-w-0 flex items-center gap-2 px-3 py-2 rounded bg-ink-800 border border-ink-600 hover:border-cyan transition-colors text-left"
    >
      <Show when={props.label}>
        <span class="text-[10px] uppercase tracking-wider text-paper-dim shrink-0">
          {props.label}
        </span>
      </Show>
      <code
        class="flex-1 min-w-0 max-w-full block font-mono text-xs text-paper overflow-hidden whitespace-nowrap"
        style={{
          // Truncate from the LEFT so the most informative end (chain path) stays visible
          // when space is tight, instead of the always-same protocol+host prefix.
          direction: 'rtl',
          'text-overflow': 'ellipsis',
          'text-align': 'left',
        }}
      >
        {/* Wrap in LTR isolate so the URL itself isn't reversed, only the overflow direction is. */}
        <bdi style={{ direction: 'ltr' }}>{props.url}</bdi>
      </code>
      <span
        class={`text-xs shrink-0 ${copied() ? 'text-cyan' : 'text-paper-dim group-hover:text-paper'}`}
      >
        {copied() ? (
          <span class="inline-flex items-center gap-1">
            <span class="i-mdi-check-circle" /> copied
          </span>
        ) : (
          <span class="inline-flex items-center gap-1">
            <span class="i-mdi-content-copy" /> copy
          </span>
        )}
      </span>
    </button>
  );
}
