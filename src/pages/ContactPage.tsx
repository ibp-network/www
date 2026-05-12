import { site } from '@/data/site';
import CopyableEndpoint from '@/components/CopyableEndpoint';
import MatrixChatEmbed from '@/components/MatrixChatEmbed';
import { useDocMeta } from '@/utils/title';

// Public IBP room — internal Matrix room ID (no alias registered).
const ROOM_ID = '!tNVRcjndUHhSDzCKFF:matrix.org';
const ELEMENT_DEEPLINK = `https://app.element.io/#/room/${ROOM_ID}`;
const MATRIX_TO_LINK = `https://matrix.to/#/${ROOM_ID}`;

const clients = [
  {
    name: 'Element (Web)',
    body: "Opens in your browser. No install. Sign in with any Matrix account or create one.",
    cta: 'Open Element Web',
    href: ELEMENT_DEEPLINK,
    icon: 'i-mdi-language-html5',
  },
  {
    name: 'Element (Desktop / iOS / Android)',
    body: 'After install, paste the room ID below into the room search to join.',
    cta: 'Download Element',
    href: 'https://element.io/download',
    icon: 'i-mdi-cellphone-link',
  },
  {
    name: 'Any other Matrix client',
    body: 'FluffyChat, Cinny, SchildiChat, Beeper, Nheko all federate. Open the universal link below.',
    cta: 'Open matrix.to',
    href: MATRIX_TO_LINK,
    icon: 'i-mdi-shield-link-variant-outline',
  },
];

export default function ContactPage() {
  useDocMeta({
    title: 'Contact',
    description:
      'No ticket forms, no support email. The IBP operators sit in one public Matrix room. Endpoint issues, integration help, GeoDNS routing questions, anything.',
  });
  return (
    <section class="section">
      <div class="container-page">
        <div class="text-center max-w-3xl mx-auto mb-10 sm:mb-14">
          <p class="eyebrow mb-4">Public chat room</p>
          <h1 class="h-display text-4xl md:text-6xl">
            Talk to the <span class="cosmic-text">operators</span>.
          </h1>
          <p class="mt-6 text-paper-muted leading-relaxed">
            No ticket forms, no support email. The IBP operators sit in one
            public Matrix room. Drop in, ask a question, or just lurk. Open to
            anyone.
          </p>
        </div>

        {/* Embedded Element — opt-in load. */}
        <div class="max-w-4xl mx-auto">
          <MatrixChatEmbed />
        </div>

        {/* Room handle — big, copyable, prominent. */}
        <div class="max-w-2xl mx-auto mt-10 sm:mt-12">
          <div class="text-center mb-3 text-xs uppercase tracking-[0.2em] text-paper-dim">
            Or join from your own client · Room ID
          </div>
          <CopyableEndpoint url={ROOM_ID} label="Matrix" />
          <p class="mt-3 text-center text-xs text-paper-dim">
            Paste this into the room search of any Matrix client, or use one of the
            one-click options below.
          </p>
        </div>

        {/* Join paths */}
        <div class="mt-10 sm:mt-14 grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
          {clients.map((c) => (
            <a
              href={c.href}
              target="_blank"
              rel="noreferrer"
              class="card-hover block group"
            >
              <span class={`${c.icon} text-3xl text-cyan`} />
              <h3 class="mt-4 font-display text-xl font-light">{c.name}</h3>
              <p class="mt-2 text-sm text-paper-muted leading-relaxed">{c.body}</p>
              <span class="mt-5 inline-flex items-center gap-2 text-sm text-cyan group-hover:text-magenta transition-colors">
                {c.cta}
                <span class="i-mdi-arrow-top-right" />
              </span>
            </a>
          ))}
        </div>

        {/* Room norms — short, practical */}
        <div class="mt-12 sm:mt-20 max-w-3xl mx-auto card border-white/6">
          <h2 class="font-display text-2xl font-light mb-5">What to expect</h2>
          <ul class="space-y-4 sm:space-y-3 text-sm text-paper-muted leading-relaxed">
            <li class="flex gap-3">
              <span class="i-mdi-account-group text-cyan shrink-0 mt-0.5" />
              <span>
                <span class="text-paper">Public room.</span> Operators, devs, and end users
                all read it. No support escalation, no SLA. The room is usually
                responsive.
              </span>
            </li>
            <li class="flex gap-3">
              <span class="i-mdi-chat-question-outline text-cyan shrink-0 mt-0.5" />
              <span>
                On topic: endpoint issues, integration help, geo-routing questions,
                bootnode setup, light-client integration, monitoring oddities.
              </span>
            </li>
            <li class="flex gap-3">
              <span class="i-mdi-github text-cyan shrink-0 mt-0.5" />
              <span>
                For code or bug reports, use{' '}
                <a href={site.links.github} target="_blank" rel="noreferrer" class="text-cyan underline">
                  GitHub
                </a>
                . Easier to track.
              </span>
            </li>
            <li class="flex gap-3">
              <span class="i-mdi-shield-check-outline text-cyan shrink-0 mt-0.5" />
              <span>
                For confidential security reports, DM an operator in-room
                (handles are in the room topic) rather than posting publicly.
              </span>
            </li>
          </ul>
        </div>

        {/* Alternate channels */}
        <div class="mt-10 sm:mt-14 max-w-3xl mx-auto text-center text-sm text-paper-dim">
          Not on Matrix?{' '}
          <a href={site.links.twitter} target="_blank" rel="noreferrer" class="text-cyan underline">
            X / Twitter
          </a>{' '}
          ·{' '}
          <a href={site.links.github} target="_blank" rel="noreferrer" class="text-cyan underline">
            GitHub
          </a>{' '}
          ·{' '}
          <a href={site.links.config} target="_blank" rel="noreferrer" class="text-cyan underline">
            Config repo
          </a>
        </div>
      </div>
    </section>
  );
}
