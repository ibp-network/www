import { A } from '@solidjs/router';
import { site } from '@/data/site';

export default function Footer() {
  return (
    <footer class="relative border-t border-ink-700 mt-24">
      <span class="absolute inset-x-0 top-0 h-px cosmic-bar opacity-40 pointer-events-none" aria-hidden />
      <div class="container-page py-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
        <div>
          <A href="/" class="inline-flex items-center mb-3">
            <img
              src="/ibp-logo.svg"
              alt="IBP"
              width="48"
              height="28"
              decoding="async"
              loading="lazy"
              class="h-7 w-auto"
              style={{
                color: '#FFFFFF',
                filter: 'drop-shadow(0 0 12px rgba(255,255,255,0.14))',
              }}
            />
          </A>
          <p class="text-sm text-paper-dim leading-relaxed">{site.tagline}</p>
        </div>

        <div>
          <h3 class="eyebrow mb-3">Connect</h3>
          <ul class="space-y-2 text-sm text-paper-muted">
            <li><A href="/endpoints" class="block py-1.5 hover:text-paper">RPC endpoints</A></li>
            <li><A href="/members" class="block py-1.5 hover:text-paper">Members</A></li>
            <li><A href="/contact" class="block py-1.5 hover:text-paper">Contact</A></li>
            <li>
              <a href={site.links.ibdash} target="_blank" rel="noreferrer" class="block py-1.5 hover:text-paper">
                ibdash analytics <span class="i-mdi-arrow-top-right text-[10px]" />
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h3 class="eyebrow mb-3">Programme</h3>
          <ul class="space-y-2 text-sm text-paper-muted">
            <li><A href="/operations" class="block py-1.5 hover:text-paper">Operations</A></li>
            <li><A href="/blog" class="block py-1.5 hover:text-paper">Blog</A></li>
            <li>
              <a href={site.links.config} target="_blank" rel="noreferrer" class="block py-1.5 hover:text-paper">
                Config repo <span class="i-mdi-arrow-top-right text-[10px]" />
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h3 class="eyebrow mb-3">Build</h3>
          <ul class="space-y-2 text-sm text-paper-muted">
            <li><A href="/build" class="block py-1.5 hover:text-paper">Dev docs</A></li>
            <li>
              <a href={site.links.polkadotDocs} target="_blank" rel="noreferrer" class="block py-1.5 hover:text-paper">
                docs.polkadot.com <span class="i-mdi-arrow-top-right text-[10px]" />
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h3 class="eyebrow mb-3">Community</h3>
          <div class="flex items-center gap-3 text-2xl text-paper-muted">
            <a href={site.links.matrix} target="_blank" rel="noreferrer" aria-label="Matrix" class="hover:text-brand-300">
              <span class="i-mdi-matrix" />
            </a>
            <a href={site.links.github} target="_blank" rel="noreferrer" aria-label="GitHub" class="hover:text-brand-300">
              <span class="i-mdi-github" />
            </a>
            <a href={site.links.twitter} target="_blank" rel="noreferrer" aria-label="X / Twitter" class="hover:text-brand-300">
              <span class="i-mdi-twitter" />
            </a>
          </div>
        </div>
      </div>
      <div class="container-page pb-8 text-xs text-paper-dim flex flex-wrap justify-between gap-2">
        <span>© {new Date().getFullYear()} {site.fullName}</span>
        <span>Operator-run. Open-source.</span>
      </div>
    </footer>
  );
}
