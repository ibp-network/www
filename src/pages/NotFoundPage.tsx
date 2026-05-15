import { A, useLocation } from '@solidjs/router';
import CopyableEndpoint from '@/components/CopyableEndpoint';
import { useDocMeta } from '@/utils/title';

export default function NotFoundPage() {
  useDocMeta({
    title: 'Not found',
    description: 'Page not found. Try /endpoints for public RPC URLs, /build to start a dApp, or /members for the operators.',
  });
  const location = useLocation();
  return (
    <section class="section">
      <div class="container-page text-center max-w-2xl mx-auto">
        <p class="eyebrow">404</p>
        <h1 class="h-display text-5xl md:text-7xl mt-4">Lost in the relay.</h1>
        <p class="mt-4 text-sm text-paper-dim font-mono break-all">
          {location.pathname}
        </p>
        <p class="mt-6 text-paper-muted">
          That path isn't on this node. If you came for an endpoint, here's the
          one most users need:
        </p>
        <div class="mt-8 text-left">
          <CopyableEndpoint
            url="wss://asset-hub-polkadot.dotters.network"
            label="Asset Hub Polkadot"
          />
        </div>
        <p class="mt-3 text-xs text-paper-dim">
          The consumer chain for the Polkadot ecosystem. Balances, assets, NFTs.
        </p>
        <div class="mt-10 flex justify-center gap-3">
          <A href="/" class="pill-cta">Home</A>
          <A href="/endpoints" class="pill">All endpoints</A>
        </div>
      </div>
    </section>
  );
}
