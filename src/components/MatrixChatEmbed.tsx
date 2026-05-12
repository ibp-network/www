/**
 * Matrix join card.
 *
 * Element Web refuses iframe embed (sets X-Frame-Options DENY / CSP
 * frame-ancestors 'none' for security). So instead of a broken iframe,
 * we render a tasteful card that opens Element / matrix.to in a new tab.
 *
 * Hydrogen Web (element's lighter client) MIGHT allow embedding — left as
 * a future option. For now, "open in new tab" is honest, fast, and works
 * with every Matrix client.
 */

const ROOM_ID = '!tNVRcjndUHhSDzCKFF:matrix.org';
const ELEMENT_DEEPLINK = `https://app.element.io/#/room/${ROOM_ID}`;
const MATRIX_TO_LINK = `https://matrix.to/#/${ROOM_ID}`;

export default function MatrixChatEmbed() {
  return (
    <div class="relative w-full aspect-[4/3] md:aspect-[16/8] rounded-2xl border border-ink-500 overflow-hidden">
      {/* Cosmic-tinted backdrop. */}
      <div
        class="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(circle at 30% 30%, rgba(0,208,255,0.18), transparent 55%), radial-gradient(circle at 70% 70%, rgba(245,2,255,0.18), transparent 55%), #050505',
        }}
        aria-hidden
      />

      <div class="h-full flex flex-col items-center justify-center gap-6 text-center px-6">
        <div
          class="w-16 h-16 rounded-full flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, rgba(0,208,255,0.22), rgba(245,2,255,0.22))',
            border: '1px solid rgba(255,255,255,0.14)',
          }}
        >
          <span class="i-mdi-matrix text-3xl text-paper" />
        </div>

        <div>
          <div class="font-display text-2xl md:text-3xl">Chat with the operators</div>
          <div class="mt-3 text-sm text-paper-muted max-w-md mx-auto">
            The public IBP Matrix room. Sign in with any Matrix account, or
            register a free one to join.
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-center gap-3">
          <a
            href={ELEMENT_DEEPLINK}
            target="_blank"
            rel="noreferrer"
            class="pill-cta"
          >
            <span class="i-mdi-matrix" /> Open in Element Web
          </a>
          <a
            href={MATRIX_TO_LINK}
            target="_blank"
            rel="noreferrer"
            class="pill"
          >
            Any Matrix client ↗
          </a>
        </div>

        <p class="text-[11px] text-paper-dim max-w-sm">
          Element Web blocks iframe embedding, so these open in a new tab.
        </p>
      </div>
    </div>
  );
}
