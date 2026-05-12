/* @refresh reload */
import { render } from 'solid-js/web';
import { Router } from '@solidjs/router';
import App from './App';
import 'virtual:uno.css';
import './index.css';

// Self-heal stale tabs after a deploy. Vite fingerprints every chunk, so
// when we ship the chunk filenames change. A tab loaded before a deploy
// will fetch the old filename when it next dynamic-imports a route (eg.
// clicking "Members") and get a 404. The `vite:preloadError` event fires
// in that case; reload once to pull the new HTML + new chunk graph.
// Guard against reload loops with sessionStorage — if a reload doesn't
// fix it, stop trying.
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    const key = 'ibp:preload-reload';
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    event.preventDefault();
    window.location.reload();
  });
  window.addEventListener('load', () => {
    sessionStorage.removeItem('ibp:preload-reload');
  });
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

// We ship a static SSG hero inside #root for instant FCP (see prerender plugin
// in vite.config.ts). Solid's `render()` inserts new children alongside any
// existing ones rather than replacing them, so without this clear the static
// hero would paint twice — once from the HTML and once from the mounted app.
// Clear before mount: there's at most a single-frame gap before Solid paints
// the real hero, which is structurally identical to the SSG fallback.
while (root.firstChild) root.removeChild(root.firstChild);

render(
  () => (
    <Router>
      <App />
    </Router>
  ),
  root,
);
