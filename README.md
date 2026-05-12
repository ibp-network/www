# IBP site

Public website for the **Infrastructure Builders' Programme**, served at `ibp.rotko.net` / `ibp.network` / `dotters.network`.

Solid 1.9 · Solid Router 0.16 · UnoCSS 66 · rolldown-vite 7.3 · TypeScript 5.9 · Redbean host. Cold-visit wire weight ≈ 32 KB gz per page; build ≈ 2 s.

## Develop

```sh
npm install
npm run dev          # http://localhost:3000 (HMR)
npm run build        # bundle + per-route HTML + pre-gzipped /assets/*
npm run preview      # serve the dist locally
npm run typecheck
```

## File layout

```
public/                 Hand-edited static assets (favicons, .init.lua, llms.txt)
src/
  pages/                Route components
  components/           Cross-page UI
  data/                 Network snapshot, dashboard API, members roster
  utils/                Latency probes, geo lookups, palette helpers
  docs/                 /build/* markdown (developer docs)
  wiki/                 /operations/* markdown (operator runbooks)
  posts/                /blog/* markdown
scripts/
  generate-world-dots.ts   Rebuilds the dot-mosaic mask from natural-earth GeoJSON
vite.config.ts          Build pipeline plugins
Dockerfile              Multi-stage redbean container (~13 MB final image)
.github/workflows/      CI deploy
```

## Editing content

| Want to change                        | File or directory                                                                 |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| Homepage hero / copy / nav cards      | `src/pages/HomePage.tsx` and `HOMEPAGE_SSG` block in `vite.config.ts` (keep them in sync) |
| Header / footer nav                   | `src/data/site.ts` (`nav` array)                                                  |
| Blog post                             | New file at `src/posts/YYYY-MM-DD-<slug>.md` with frontmatter                     |
| Build docs page                       | New file at `src/docs/<category>/<order>-<slug>.md`                               |
| Operations runbook                    | New file at `src/wiki/<category>/<order>-<slug>.md`                               |
| Operator coordinates / region code    | `src/data/members.ts`                                                             |
| Country traffic-bubble centroids      | `src/data/country-centroids.ts`                                                   |
| Endpoint page copy                    | `src/pages/EndpointsPage.tsx`                                                     |
| Cache headers / SPA fallback          | `public/.init.lua`                                                                |
| LLM-crawler index                     | `public/llms.txt`                                                                 |

## Data sources

The site never holds operator-side data on its own. Everything is pulled from public upstreams.

| Data                        | Upstream                                                          | When                                    |
| --------------------------- | ----------------------------------------------------------------- | --------------------------------------- |
| Members + IPs + assignments | `github.com/ibp-network/config` (3 JSON files)                    | Mirrored to `/data/*.json` at build time |
| Operator logos              | `github.com/ibp-network/config/assets/member-logos/*.png`         | Referenced live by URL                  |
| Continent dot mask          | `nvkelso/natural-earth-vector` 50m countries                      | Rasterised once via `scripts/`          |
| Per-country requests        | `/api/ibdash/requests/country?…` (proxied + cached 1 h)           | First visit per hour fetches; rest cached |
| Per-member requests         | `/api/ibdash/requests/member?…` (proxied + cached 1 h)            | Same                                    |
| (country × member) routing  | `/api/ibdash/requests/country?member=X&…` (one call per operator) | Same — powers the globe arc layer       |
| Dashboard summary stats     | `/api/ibdash/{requests,services}/summary` (proxied)               | Same                                    |
| Live block heights          | `wss://asset-hub-polkadot.dotters.network` (chain RPC)            | At runtime on user action               |
| GeoDNS routing detection    | Cloudflare DoH                                                    | At runtime in `RoutedTo`                |

`/api/ibdash/*` is a same-origin reverse proxy that lives in `public/.init.lua`. First request in each 1 h window pulls from `ibdash.dotters.network`; everyone else gets the cached body. Saves ibdash from getting hammered when traffic spikes, and saves visitors one cross-origin TLS handshake per fetch.

## Build pipeline

`vite build` runs five plugins in order; each one's role:

- `solidPlugin()` + `UnocssPlugin()` — standard transforms.
- `wikiContentPlugin()` — walks `src/docs`, `src/wiki`, `src/posts` at build time, runs `remark` once, exposes three virtual modules consumed by `DocsPage` / `OperationsPage` / `BlogPage`. No `remark` in the runtime bundle.
- `configMirrorPlugin()` — fetches the three `ibp-network/config` JSONs, writes to `dist/data/` and proxies them in dev.
- `sitemapPlugin()` — writes `dist/sitemap.xml`.
- `prerenderPlugin()` — inlines the CSS into `<style>` (kills one render-blocking round trip), injects the homepage hero SSG into `<div id="root">` (instant FCP), emits per-route HTML with the right title / OG / canonical / BreadcrumbList JSON-LD / modulepreload. Then pre-gzips every `/assets/*` to a `.gz` sibling.

## Hosting

The build packs `dist/` into a Redbean binary via the `Dockerfile`. The container exposes port 80 internally and is run with `-p 127.0.0.1:44446:80`. HAProxy in front of each public hostname maps `<host>:443` to that loopback.

`public/.init.lua` handles every request:

- SPA fallback (any non-file path returns `index.html` with HTTP 200).
- `__SITE_ORIGIN__` substitution so the same image works at every public hostname.
- `/assets/*` served via `Write()` with `Cache-Control: public, max-age=31536000, immutable` + `Content-Encoding: gzip` from the pre-gzipped sibling. Headers stick because we bypass redbean's auto-Cache-Control.
- `/data/*` served with 1 h cache (mirrored canonical config).
- `/api/ibdash/*` reverse proxy with the 1 h in-process cache described above. Sets `X-Cache: HIT | MISS | STALE`.
- Security headers (HSTS, X-Content-Type-Options, X-Frame-Options).

## Deploy

CI does it. `.github/workflows/deploy.yaml` builds the container on every push to `master` and ships the resulting image.

```
push to master            → auto-deploys to ibp-rotko-net
workflow_dispatch (gh UI) → choose ibp-rotko-net | ibp-network | dotters-network | all
```

One **build** job (`npm ci` → `typecheck` → `build` → `podman build` → tarball artifact) plus three independent **deploy** jobs, each gated on the dispatch input. Each deploy job downloads the image, scps it to its target host, runs `podman load` + restart, smoke-tests with `curl http://127.0.0.1:44446/`. Failing smoke leaves the prior container stopped — restart it with `podman start ibp-rotko-net`.

### Triggering from the CLI

```sh
gh workflow run deploy.yaml --repo ibp-network/www.ibp.network -f targets=ibp-rotko-net
gh workflow run deploy.yaml --repo ibp-network/www.ibp.network -f targets=all
gh run watch                --repo ibp-network/www.ibp.network
```

### Per-target secrets

Each target needs three repository secrets:

| Target          | Host                   | User                   | Private key            |
| --------------- | ---------------------- | ---------------------- | ---------------------- |
| ibp-rotko-net   | `IBP_ROTKO_NET_HOST`   | `IBP_ROTKO_NET_USER`   | `IBP_ROTKO_NET_KEY`    |
| ibp-network     | `IBP_NETWORK_HOST`     | `IBP_NETWORK_USER`     | `IBP_NETWORK_KEY`      |
| dotters-network | `DOTTERS_NETWORK_HOST` | `DOTTERS_NETWORK_USER` | `DOTTERS_NETWORK_KEY`  |

`*_HOST` is an IP or DNS name reachable on SSH. `*_USER` is the login that owns the podman container. `*_KEY` is the matching SSH private key (full PEM, including BEGIN/END lines).

Generate a per-target deploy key, install the public half on the host, and stash the private half in secrets:

```sh
ssh-keygen -t ed25519 -f /tmp/ibp_deploy -C 'ibp-site github-actions deploy' -N ''
cat /tmp/ibp_deploy.pub | ssh <user>@<host> 'cat >> ~/.ssh/authorized_keys'

gh secret set <TARGET>_HOST --repo ibp-network/www.ibp.network --body "<host>"
gh secret set <TARGET>_USER --repo ibp-network/www.ibp.network --body "<user>"
gh secret set <TARGET>_KEY  --repo ibp-network/www.ibp.network < /tmp/ibp_deploy
```

Host requirements: `podman` installed, port `127.0.0.1:44446` free, the public hostname routed to that loopback port by the upstream proxy (HAProxy on rotko, equivalent on ibp.network / dotters.network).

### Manual deploy fallback

If CI is down or you're iterating locally:

```sh
./docker-build.sh
podman save -o /tmp/ibp.tar localhost/ibp-rotko-net:latest
scp -i /tmp/ibp_deploy /tmp/ibp.tar <user>@<host>:/tmp/
ssh -i /tmp/ibp_deploy <user>@<host> '
  podman load -i /tmp/ibp.tar &&
  podman stop ibp-rotko-net 2>/dev/null; podman rm ibp-rotko-net 2>/dev/null;
  podman run -d --restart=always -p 127.0.0.1:44446:80 --name ibp-rotko-net localhost/ibp-rotko-net:latest &&
  rm /tmp/ibp.tar
'
```

## Regenerating the world map

`public/world-dots.svg` is generated, not hand-edited — a 360×180 grid of `<use href="#d">` references rasterised from the natural-earth 50m countries set onto the same equirectangular projection that `ServiceMap2D.project()` uses for operator pins.

```sh
npx tsx scripts/generate-world-dots.ts
```

If you change the projection in `ServiceMap2D.tsx` (latitude clamps, viewBox aspect), rerun the script — both layers have to agree pixel-for-pixel or pins land on the wrong continent.
