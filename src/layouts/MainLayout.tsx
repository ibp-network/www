import { type JSX } from 'solid-js';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

/**
 * No explicit Suspense boundary here — Solid Router already keeps the previous
 * route on screen while the next lazy chunk loads, which is the right UX. A
 * top-level skeleton flickered before resource-suspending widgets (LiveBlock,
 * RoutedTo, etc.) on initial mount, which read as "loading screen" rather
 * than "fetching data."
 */
export default function MainLayout(props: { children?: JSX.Element }) {
  return (
    <div class="min-h-screen flex flex-col text-paper">
      <Header />
      <main class="flex-1 pt-16">{props.children}</main>
      <Footer />
    </div>
  );
}
