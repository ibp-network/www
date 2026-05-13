/**
 * Hidden / unlisted route for IBP members to submit bootnode multiaddrs
 * for chains where they have gaps. Not in navigation, not in sitemap.
 *
 * Why this exists: ibp-network/config / bootnodes.json drifts as operators
 * rotate hosts and PeerIds, and the canonical fix is a PR upstream. This
 * form is a UX helper that turns "operator wants to update their entries"
 * into a structured GitHub issue against the canonical repo, ready for a
 * curator to merge into bootnodes.json with a one-line jq command.
 *
 * Why GitHub-issue and not a server endpoint: redbean runs under pledge
 * stdio rpath inet — no `cpath`, so there's literally no writable disk
 * surface on the host. The form generates a prefilled new-issue URL on
 * github.com/ibp-network/config; the operator (already authenticated
 * with GitHub) clicks submit on GitHub. Zero server state, durable
 * record, free.
 */

import { createMemo, createSignal, For, Show, Suspense, onMount, onCleanup } from 'solid-js';
import { useNetworkSnapshot, type Bootnode } from '@/data/network';
import { useDocMeta } from '@/utils/title';

// Belt-and-braces: not in sitemap, not pre-rendered, but a crawler that
// guesses the URL still gets a noindex/nofollow on the response.
function useNoIndex() {
  onMount(() => {
    let el = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    const prev = el?.getAttribute('content') ?? null;
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('name', 'robots');
      document.head.appendChild(el);
    }
    el.setAttribute('content', 'noindex, nofollow, noarchive');
    onCleanup(() => {
      if (prev === null) el?.remove();
      else el?.setAttribute('content', prev);
    });
  });
}

const CONFIG_REPO = 'ibp-network/config';

type Transport = 'tcp' | 'wss';

// Detect a member's multiaddrs already on a chain. Returns the existing
// addrs split by transport, so the form can render them as read-only
// context and only ask for what's missing.
function existingByTransport(list: Bootnode[], member: string): Record<Transport, string[]> {
  const out: Record<Transport, string[]> = { tcp: [], wss: [] };
  for (const b of list) {
    if (b.member !== member) continue;
    out[b.transport].push(b.multiaddr);
  }
  return out;
}

function validateMultiaddr(addr: string, transport: Transport): string | null {
  if (!addr) return null;
  if (!addr.startsWith('/dns') && !addr.startsWith('/ip4') && !addr.startsWith('/ip6')) {
    return 'must start with /dns, /dns4, /dns6, /ip4 or /ip6';
  }
  if (!/\/tcp\/\d+/.test(addr)) return 'missing /tcp/<port> segment';
  if (!/\/p2p\/12D3KooW[A-Za-z0-9]+/.test(addr)) return 'missing /p2p/12D3KooW… PeerId segment';
  if (transport === 'wss' && !addr.includes('/wss')) return 'wss row but multiaddr has no /wss';
  if (transport === 'tcp' && addr.includes('/wss')) return 'tcp row but multiaddr has /wss';
  return null;
}

export default function SubmitBootnodePage() {
  useDocMeta({
    title: 'Submit bootnode',
    description: 'IBP operator-only form: report missing or rotated bootnode multiaddrs for inclusion in ibp-network/config.',
  });
  useNoIndex();

  const snapshot = useNetworkSnapshot();
  const [selectedMember, setSelectedMember] = createSignal<string>('');
  // map "chain|transport" -> typed multiaddr string
  const [entries, setEntries] = createSignal<Record<string, string>>({});

  const memberNames = createMemo(() => {
    const s = snapshot();
    return s ? s.members.map((m) => m.name).sort() : [];
  });

  const chains = createMemo(() => {
    const s = snapshot();
    if (!s) return [];
    return Object.keys(s.bootnodesByChain).sort();
  });

  // For the selected member, compute per-chain gaps. A chain × transport
  // cell is a "gap" if the member has no multiaddr of that transport.
  const gaps = createMemo(() => {
    const s = snapshot();
    const m = selectedMember();
    if (!s || !m) return [];
    return chains().map((chain) => {
      const list = s.bootnodesByChain[chain] ?? [];
      const existing = existingByTransport(list, m);
      return {
        chain,
        tcp: existing.tcp,
        wss: existing.wss,
        needsTcp: existing.tcp.length === 0,
        needsWss: existing.wss.length === 0,
      };
    }).filter((row) => row.needsTcp || row.needsWss);
  });

  // Live preview of what would land in the GitHub issue body.
  const issueBody = createMemo(() => {
    const m = selectedMember();
    if (!m) return '';
    const filled = Object.entries(entries())
      .map(([k, v]) => {
        const [chain, transport] = k.split('|') as [string, Transport];
        const trimmed = v.trim();
        if (!trimmed) return null;
        const err = validateMultiaddr(trimmed, transport);
        return { chain, transport, addr: trimmed, err };
      })
      .filter((x): x is { chain: string; transport: Transport; addr: string; err: string | null } => x !== null);

    if (filled.length === 0) return '';

    const lines = [
      `Bootnode additions / rotations for **${m}**.`,
      '',
      '| chain | transport | multiaddr |',
      '| --- | --- | --- |',
      ...filled.map((f) => `| \`${f.chain}\` | \`${f.transport}\` | \`${f.addr}\` |`),
      '',
      '<!-- generated by ibp.rotko.net/operators/submit-bootnode -->',
    ];
    const errs = filled.filter((f) => f.err);
    if (errs.length > 0) {
      lines.push('', '⚠️ The following entries did not validate locally; please double-check:');
      for (const e of errs) lines.push(`- \`${e.chain}\` / \`${e.transport}\`: ${e.err}`);
    }
    return lines.join('\n');
  });

  const issueUrl = createMemo(() => {
    const m = selectedMember();
    if (!m) return '';
    const title = `Bootnode submission: ${m}`;
    const body = issueBody();
    if (!body) return '';
    const params = new URLSearchParams({
      title,
      body,
      labels: 'bootnode-submission',
    });
    return `https://github.com/${CONFIG_REPO}/issues/new?${params.toString()}`;
  });

  const setEntry = (chain: string, transport: Transport, value: string) => {
    setEntries({ ...entries(), [`${chain}|${transport}`]: value });
  };

  return (
    <section class="section">
      <div class="container-page max-w-4xl mx-auto">
        <p class="eyebrow mb-4">Operators only</p>
        <h1 class="h-display text-3xl md:text-5xl">Submit a bootnode.</h1>
        <p class="mt-4 text-paper-muted max-w-2xl leading-relaxed">
          Unlisted operator-only form. Pick yourself, fill in the gaps for
          chains where your bootnodes are missing or rotated, and click the
          button at the bottom — it opens a prefilled issue on{' '}
          <code class="font-mono text-paper">{CONFIG_REPO}</code> on GitHub.
          A curator merges from there. No server state is involved.
        </p>

        <Suspense fallback={<p class="mt-10 text-paper-dim">Loading roster…</p>}>
          <div class="mt-10 card">
            <label class="block text-xs uppercase tracking-wider text-paper-dim mb-2">
              Your operator
            </label>
            <select
              class="w-full bg-ink-800 border border-ink-600 rounded px-3 py-2 text-paper"
              value={selectedMember()}
              onInput={(e) => setSelectedMember(e.currentTarget.value)}
            >
              <option value="">— select —</option>
              <For each={memberNames()}>
                {(name) => <option value={name}>{name}</option>}
              </For>
            </select>
          </div>

          <Show when={selectedMember()}>
            <Show
              when={gaps().length > 0}
              fallback={
                <p class="mt-8 text-paper-muted">
                  No gaps detected for <strong>{selectedMember()}</strong> — every
                  chain in <code class="font-mono">bootnodes.json</code> has at
                  least one TCP and one WSS entry registered to you.
                </p>
              }
            >
              <p class="mt-8 text-sm text-paper-dim">
                {gaps().length} chain{gaps().length === 1 ? '' : 's'} with missing
                transports for <strong class="text-paper">{selectedMember()}</strong>.
              </p>

              <div class="mt-4 flex flex-col gap-4">
                <For each={gaps()}>
                  {(row) => (
                    <div class="card">
                      <div class="flex items-center gap-3 mb-3">
                        <code class="font-mono text-paper">{row.chain}</code>
                        <Show when={row.tcp.length > 0 || row.wss.length > 0}>
                          <span class="text-xs text-paper-dim">
                            existing: {row.tcp.length} tcp · {row.wss.length} wss
                          </span>
                        </Show>
                      </div>

                      <Show when={row.needsTcp}>
                        <div class="mb-2">
                          <label class="block text-[11px] uppercase tracking-wider text-paper-dim mb-1">
                            /tcp multiaddr
                          </label>
                          <input
                            type="text"
                            placeholder="/dns/<chain>.<host>/tcp/<port>/p2p/12D3KooW…"
                            class="w-full bg-ink-800 border border-ink-600 rounded px-3 py-2 font-mono text-xs text-paper"
                            onInput={(e) => setEntry(row.chain, 'tcp', e.currentTarget.value)}
                          />
                        </div>
                      </Show>

                      <Show when={row.needsWss}>
                        <div>
                          <label class="block text-[11px] uppercase tracking-wider text-paper-dim mb-1">
                            /wss multiaddr (browser-reachable)
                          </label>
                          <input
                            type="text"
                            placeholder="/dns/<chain>.<host>/tcp/<port>/wss/p2p/12D3KooW…"
                            class="w-full bg-ink-800 border border-ink-600 rounded px-3 py-2 font-mono text-xs text-paper"
                            onInput={(e) => setEntry(row.chain, 'wss', e.currentTarget.value)}
                          />
                        </div>
                      </Show>
                    </div>
                  )}
                </For>
              </div>

              <Show when={issueBody()}>
                <div class="mt-8 card">
                  <h2 class="font-display text-lg mb-3">Preview</h2>
                  <pre class="font-mono text-[11px] text-paper-muted bg-ink-900 p-3 rounded overflow-x-auto whitespace-pre-wrap">{issueBody()}</pre>
                </div>
                <div class="mt-6 flex flex-wrap gap-3">
                  <a
                    href={issueUrl()}
                    target="_blank"
                    rel="noreferrer"
                    class="pill-cta"
                  >
                    Open prefilled GitHub issue →
                  </a>
                  <span class="text-xs text-paper-dim self-center">
                    Opens in a new tab on github.com/{CONFIG_REPO}. Review and click "Submit new issue" there.
                  </span>
                </div>
              </Show>
            </Show>
          </Show>
        </Suspense>
      </div>
    </section>
  );
}
