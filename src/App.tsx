import { lazy, type Component, type JSX } from 'solid-js';
import { Navigate, Route, useLocation } from '@solidjs/router';
import MainLayout from '@/layouts/MainLayout';
import HomePage from '@/pages/HomePage';

// /docs/* was renamed to /build/* — preserve any external links by redirecting.
// Strip the leading "/docs" and pass the rest through.
const DocsRedirect: Component = () => {
  const loc = useLocation();
  const rest = loc.pathname.replace(/^\/docs/, '');
  return <Navigate href={`/build${rest}${loc.search}${loc.hash}`} />;
};

// Lazy-load every non-home page so the markdown / globe chunks stay off the
// critical path. Home is statically imported because it's the hot landing.
const EndpointsPage = lazy(() => import('@/pages/EndpointsPage'));
const DocsPage = lazy(() => import('@/pages/DocsPage'));
const OperationsPage = lazy(() => import('@/pages/OperationsPage'));
const MembersPage = lazy(() => import('@/pages/MembersPage'));
const ContactPage = lazy(() => import('@/pages/ContactPage'));
const BlogPage = lazy(() => import('@/pages/BlogPage'));
const BlogPostPage = lazy(() => import('@/pages/BlogPostPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

const Layout: Component<{ children?: JSX.Element }> = (props) => (
  <MainLayout>{props.children}</MainLayout>
);

const App: Component = () => (
  <Route path="/" component={Layout}>
    <Route path="" component={HomePage} />
    <Route path="endpoints" component={EndpointsPage} />
    <Route path="build" component={DocsPage} />
    <Route path="build/:category" component={DocsPage} />
    <Route path="build/:category/:slug" component={DocsPage} />
    <Route path="build/:category/:group/:slug" component={DocsPage} />
    {/* /docs/* was renamed to /build/* — keep external links working. */}
    <Route path="docs" component={DocsRedirect} />
    <Route path="docs/*" component={DocsRedirect} />
    <Route path="operations" component={OperationsPage} />
    <Route path="operations/:category" component={OperationsPage} />
    <Route path="operations/:category/:slug" component={OperationsPage} />
    <Route path="operations/:category/:group/:slug" component={OperationsPage} />
    {/* /map merged into /members — preserve any external links. */}
    <Route path="map" component={() => <Navigate href="/members" />} />
    <Route path="members" component={MembersPage} />
    <Route path="contact" component={ContactPage} />
    <Route path="blog" component={BlogPage} />
    <Route path="blog/:slug" component={BlogPostPage} />
    <Route path="*" component={NotFoundPage} />
  </Route>
);

export default App;
