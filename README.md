# IBP site

Public website for the Infrastructure Builders' Programme, served at `ibp.rotko.net` / `ibp.network` / `dotters.network`.

Stack: SolidJS 1.9 · Solid Router 0.16 · UnoCSS 66 (presetMini + presetIcons mdi + presetTypography) · rolldown-vite 7.3 · TypeScript 5.9 · Redbean for hosting.

## Develop

```sh
npm install
npm run dev          # http://localhost:3000 (HMR)
npm run build        # bundle + per-route HTML + pre-gzipped /assets/*
npm run preview      # serve the dist locally
npm run typecheck    # tsc --noEmit
```

`vite` resolves to `rolldown-vite` via the `overrides` in `package.json`. Build time on a clean tree is ~2 s.

## Layout

```
public/
  .init.lua           Redbean request handler (SPA fallback, cache headers, origin rewrite)
  world-dots.svg      Generated dot-mosaic continents (see scripts/)
  ibp-mark.svg        Brand mark, used as <link rel="icon">
  llms.txt            Markdown index for LLM crawlers
src/
  pages/              Route components (HomePage, EndpointsPage, MembersPage, …)
  components/         Cross-page UI (Header, Footer, ServiceMap2D, Globe, …)
  data/               Network snapshot, dashboard stats, members roster, blog/docs trees
  utils/              Latency probes, geo lookups, country-traffic palette helpers
  docs/               Markdown for /build/* (developer docs)
  wiki/               Markdown for /operations/* (operator runbooks)
  posts/              Markdown for /blog/* (programme blog)
scripts/
  generate-world-dots.ts   Rebuilds the dot-mosaic mask from natural-earth GeoJSON
vite.config.ts        Build pipeline: virtual content modules, sitemap, config mirror, prerender, pre-gzip
Dockerfile            Multi-stage build → redbean.com binary in a 13 MB Alpine image
docker-build.sh       Local convenience wrapper
```

## Data sources

The site never holds operator-side data on its own. Everything is pulled from public sources at build or runtime.

| What                           | Source                                                                 | When                                                       |
| ------------------------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| Member roster + IPs            | `github.com/ibp-network/config/members_professional.json`              | Mirrored to `/data/members_professional.json` at build time |
| Bootnodes per chain            | `github.com/ibp-network/config/bootnodes.json`                         | Mirrored to `/data/bootnodes.json` at build time           |
| Service / chain metadata       | `github.com/ibp-network/config/services_rpc.json`                      | Mirrored to `/data/services_rpc.json` at build time        |
| Operator logos                 | `github.com/ibp-network/config/assets/member-logos/*.png`              | Referenced live by URL                                     |
| Continents (dot mask)          | `nvkelso/natural-earth-vector` 50m countries GeoJSON                   | Rasterised once via `scripts/generate-world-dots.ts`       |
| Live block heights             | `wss://asset-hub-polkadot.dotters.network` (chain itself)               | At runtime, on user action                                 |
| Per-country request volume     | `ibdash.dotters.network:9000/api/requests/country?start&end`            | Singleton fetch on `/members` mount                        |
| Per-operator request volume    | `ibdash.dotters.network:9000/api/requests/member?start&end`             | Singleton fetch on `/members` mount                        |
| Dashboard summary stats        | `ibdash.dotters.network:9000/api/{requests,services}/summary`           | Singleton fetch on `/members` mount                        |
| GeoDNS resolution              | Cloudflare DoH (`cloudflare-dns.com/dns-query`)                        | At runtime in the RoutedTo widget                          |

### Why mirror

The `/data/*.json` mirror exists because `raw.githubusercontent.com` is a cross-origin host with no useful CDN cache for our visitors. Mirroring at build time turns three cross-origin TLS handshakes per visit into three same-origin GETs served from the redbean container, with `Cache-Control: public, max-age=3600`. If the upstream config is unreachable during a build, the build fails loudly rather than silently shipping stale data.

### Refreshing the data mirror

The mirror is re-fetched on every build. To pick up an upstream config change without writing code, rebuild + redeploy:

```sh
npm run build
./docker-build.sh
```

### Modifying static content

| Edit              | File or directory                              |
| ----------------- | ---------------------------------------------- |
| Homepage hero, copy, nav cards | `src/pages/HomePage.tsx` + the matching `HOMEPAGE_SSG` block in `vite.config.ts` (keep them in sync; the SSG paints before JS mounts) |
| Header / footer nav             | `src/data/site.ts` (`nav` array)              |
| Site description + OG meta      | `src/data/site.ts` + `index.html` (per-route meta is rewritten by the prerender plugin) |
| Blog post                       | New file under `src/posts/YYYY-MM-DD-<slug>.md`, frontmatter `title/date/author/description/tags` |
| Build docs page                 | New file under `src/docs/<category>/<order>-<slug>.md` |
| Operations runbook              | New file under `src/wiki/<category>/<order>-<slug>.md` |
| Operator coordinates (map pins) | `src/data/members.ts` (lat / lng / region code) |
| Country-traffic centroids       | `src/data/country-centroids.ts` (ISO-2 → lat/lng) |
| Endpoint section copy           | `src/pages/EndpointsPage.tsx` |
| Cache headers / SPA fallback    | `public/.init.lua` |
| LLM-crawler index               | `public/llms.txt` |

## Build pipeline

`vite build` runs the following plugins in order:

1. **`solidPlugin()` + `UnocssPlugin()`** standard transforms.
2. **`wikiContentPlugin()`** walks `src/docs`, `src/wiki`, `src/posts` at build time, runs `remark + remark-gfm + remark-html` once, exposes three virtual modules (`virtual:ibp-docs`, `virtual:ibp-wiki`, `virtual:ibp-posts`) consumed by `DocsPage`, `OperationsPage`, `BlogPage`. No remark in the runtime bundle.
3. **`configMirrorPlugin()`** fetches the three canonical config JSONs from GitHub, makes them available at `/data/*` (dev middleware + dist write).
4. **`sitemapPlugin()`** writes `dist/sitemap.xml` with `__SITE_ORIGIN__` placeholders for runtime substitution.
5. **`prerenderPlugin()`** inlines the CSS into `<style>` (kills one render-blocking round trip), injects the homepage hero into `<div id="root">` (instant FCP), emits per-route HTML with the right `<title>` / `<meta description>` / canonical / OG / Twitter / BreadcrumbList JSON-LD / route-specific `<link rel="modulepreload">`. Then pre-gzips every `/assets/*` to a `.gz` sibling for the immutable-cache serve path.

Per-page wire weight on a cold visit lands around 32–35 KB gz (HTML + vendor + entry chunk).

## Hosting

The build packs `dist/` into a Redbean binary via the `Dockerfile`. The image is ~13 MB.

```sh
./docker-build.sh             # build + tag localhost/ibp-rotko-net:latest
```

`public/.init.lua` is the Redbean request handler. It does:

- SPA fallback (any non-file path serves `index.html` with HTTP 200)
- Same-origin `__SITE_ORIGIN__` substitution at response time
- `/assets/*` served via explicit `Write()` with `Cache-Control: public, max-age=31536000, immutable` + `Content-Encoding: gzip` from the pre-gzipped sibling
- `/data/*` short cache (1 h)
- Security headers (HSTS, X-Content-Type-Options, X-Frame-Options)

Deploy is two-step:

```sh
podman save -o /tmp/ibp.tar localhost/ibp-rotko-net:latest
scp /tmp/ibp.tar root@web.rotko.net:/tmp/
ssh root@web.rotko.net 'podman load -i /tmp/ibp.tar && podman stop ibp-rotko-net && podman rm ibp-rotko-net && podman run -d --restart=always -p 127.0.0.1:44446:80 --name ibp-rotko-net localhost/ibp-rotko-net:latest && rm /tmp/ibp.tar'
```

HAProxy on `web.rotko.net` routes `ibp.rotko.net` → `127.0.0.1:44446`.

## Regenerating the world map mask

`public/world-dots.svg` is generated, not hand-edited. It's a 360×180 grid of `<use href="#d">` references against a single `<circle id="d">` definition, rasterised from `nvkelso/natural-earth-vector` 50m countries onto the same equirectangular projection that `ServiceMap2D.project()` uses for operator pins.

```sh
npx tsx scripts/generate-world-dots.ts
```

If the projection in `ServiceMap2D.tsx` changes (latitude clamps, viewBox aspect), update both files together — they have to agree pixel-for-pixel or operator pins land on the wrong continent.

## Inputs / reference material

Reference sources live one level up at `/steam/rotko/ibp/`:

- `wiki/` Docusaurus wiki (wiki.ibp.network) content + branding
- `website/` legacy CRA marketing site copy + brand SVGs
- `ibp-geodns-dashboard/` production dashboard (for stats API contract + design tokens)
- `figma.md` links to Figma design + branding files
