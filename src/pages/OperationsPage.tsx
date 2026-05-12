import { A } from '@solidjs/router';
import { TreePage } from './DocsPage';
import { defaultWikiPage, loadWikiPage, loadWikiTree } from '@/data/ops-content';

/**
 * /operations — programme operations, audit history, member onboarding.
 * The old "wiki" content lived at /docs before the developer-docs rewrite;
 * we moved it here so /docs is unambiguously a dev resource.
 */
export default function OperationsPage() {
  return (
    <TreePage
      tree={loadWikiTree()}
      pageLookup={loadWikiPage}
      defaultPage={defaultWikiPage}
      urlPrefix="/operations"
      eyebrow="IBP operations"
      title={
        <>
          The <span class="cosmic-text">programme</span> in detail.
        </>
      }
      intro={
        <>
          How the Infrastructure Builders' Programme is run, audited, and built.
          Governance history, member onboarding, hardware standards. The things
          that make a public RPC service trustworthy. Developer guides are at{' '}
          <A href="/build" class="text-cyan hover:text-magenta underline underline-offset-4 decoration-cyan/40">
            /build
          </A>
          .
        </>
      }
      docTitleSuffix="Operations"
      notFoundPrefix="/operations"
    />
  );
}
