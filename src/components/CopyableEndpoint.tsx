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
      // No aria-label. WCAG 2.5.3 (Label in Name): an interactive element
      // whose visible text already names it must NOT be overridden with a
      // differently-worded accessible name — voice-control users say what
      // they see. This button's children (label span + URL <code> + the
      // "copy"/"copied" action span) compose an accessible name that is,
      // by construction, exactly the visible text. Any aria-label here
      // (even a careful one) reintroduces the mismatch the audit flags.
      // Mobile (default): stack — label as a top eyebrow, then the URL +
      // copy on their own full-width row. Giving the URL the whole row
      // width means short endpoint URLs (the hero's
      // wss://asset-hub-polkadot.ibp.network is ~37 chars) render in full
      // instead of left-truncating to a meaningless "…lkadot.ibp.network".
      // sm+ : revert to the original single inline row (works in the
      // narrow /endpoints grid cards where rtl-ellipsis is still wanted).
      class="group w-full max-w-full min-w-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 px-3 py-2 rounded bg-ink-800 border border-ink-600 hover:border-cyan transition-colors text-left"
    >
      <Show when={props.label}>
        <span class="text-[10px] uppercase tracking-wider text-paper-dim shrink-0">
          {props.label}
        </span>
      </Show>
      <div class="flex items-center gap-2 w-full min-w-0 sm:flex-1">
        {/* Mobile: wrap the full URL across up to two lines (break-all).
            A copyable endpoint must be fully legible before the user
            trusts it — left-truncating to "…b-polkadot.dotters.network"
            hides the protocol + chain prefix. We have the room here
            (stacked, full-width row). sm+: the original single-line
            rtl-ellipsis, because in the /endpoints 2-col grid cards a
            wrapping URL would blow the card height. */}
        <code class="flex-1 min-w-0 max-w-full block font-mono text-xs text-paper break-all sm:overflow-hidden sm:whitespace-nowrap sm:[direction:rtl] sm:[text-align:left] sm:text-ellipsis">
          <bdi class="sm:[direction:ltr]">{props.url}</bdi>
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
      </div>
    </button>
  );
}
