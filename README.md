# ibp-site

Public site for the Infrastructure Builders' Programme.
Served at `ibp.rotko.net`, `ibp.network`, `dotters.network`.

Solid 1.9, Solid Router 0.16, UnoCSS 66, rolldown-vite 7.3, TypeScript 5.9.
Hosted in a Redbean container, image ~13 MB.

Cold-visit weight ≈ 32 KB gz per page. Build ≈ 2 s.

## Develop

```
npm install
npm run dev           # http://localhost:3000
npm run build
npm run preview
npm run typecheck
```

## Layout

```
public/                static assets, redbean handler, llms.txt
src/
  pages/               route components
  components/          cross-page UI
  data/                snapshot, dashboard API, roster
  utils/               latency probes, geo, palettes
  docs/                /build/* markdown
  wiki/                /operations/* markdown
  posts/               /blog/* markdown
scripts/
  generate-world-dots.ts
vite.config.ts         build plugins
Dockerfile             redbean container
.github/workflows/     CI deploy
```

## Editing content

| Change                       | File                                                           |
| ---------------------------- | -------------------------------------------------------------- |
| Homepage hero, copy, cards   | `src/pages/HomePage.tsx` + `HOMEPAGE_SSG` in `vite.config.ts` |
| Header / footer nav          | `src/data/site.ts`                                             |
| Blog post                    | `src/posts/YYYY-MM-DD-<slug>.md`                               |
| Build docs page              | `src/docs/<category>/<order>-<slug>.md`                        |
| Operations runbook           | `src/wiki/<category>/<order>-<slug>.md`                        |
| Operator coords / region     | `src/data/members.ts`                                          |
| Country centroids            | `src/data/country-centroids.ts`                                |
| Endpoints page copy          | `src/pages/EndpointsPage.tsx`                                  |
| Cache headers, SPA fallback  | `public/.init.lua`                                             |
| LLM-crawler index            | `public/llms.txt`                                              |

The homepage hero is duplicated as an SSG block in `vite.config.ts` so first paint happens before JS mounts. Keep both copies in sync.

## Data sources

| Data                         | Upstream                                                | Cached as                          |
| ---------------------------- | ------------------------------------------------------- | ---------------------------------- |
| Member roster, IPs, services | `github.com/ibp-network/config` (3 JSON files)          | `dist/data/*.json` at build time   |
| Operator logos               | `ibp-network/config/assets/member-logos/*.png`          | hot-linked                         |
| Continent dot mask           | `nvkelso/natural-earth-vector` 50 m countries           | `public/world-dots.svg`            |
| Per-country requests         | `ibdash.dotters.network:9000/api/requests/country`      | redbean proxy, 1 h TTL             |
| Per-member requests          | `ibdash.../api/requests/member`                         | same                               |
| (country × member) routing   | `ibdash.../api/requests/country?member=X`               | same                               |
| Summary stats                | `ibdash.../api/{requests,services}/summary`             | same                               |
| Live block heights           | `wss://asset-hub-polkadot.dotters.network`              | direct                             |
| GeoDNS resolution            | Cloudflare DoH                                          | direct                             |

The dashboard API is reverse-proxied through `public/.init.lua` at `/api/ibdash/*`. First request in a 1 h window hits ibdash; everyone else gets the cached body. Response carries `X-Cache: HIT | MISS | STALE`.

## Build

`vite build` runs five plugins:

1. `solidPlugin` + `UnocssPlugin` — standard transforms.
2. `wikiContentPlugin` — walks `src/docs`, `src/wiki`, `src/posts`, runs remark once, exposes three virtual modules. No remark in the runtime bundle.
3. `configMirrorPlugin` — fetches the three `ibp-network/config` JSONs, writes them to `dist/data/`.
4. `sitemapPlugin` — writes `dist/sitemap.xml`.
5. `prerenderPlugin` — inlines CSS, injects the homepage hero SSG into `<div id="root">`, emits per-route HTML with title / OG / canonical / JSON-LD / `modulepreload`. Pre-gzips every `/assets/*` to a `.gz` sibling.

## Hosting

Container exposes port 80. Run on the host with `-p 127.0.0.1:44446:80`. The public hostname's HAProxy maps `443 → 127.0.0.1:44446`.

`public/.init.lua` handles every request:

- SPA fallback: any non-file path serves `index.html` with HTTP 200.
- `__SITE_ORIGIN__` placeholder substitution against the request `Host` header.
- `/assets/*`: `Cache-Control: public, max-age=31536000, immutable` + pre-gzipped `Content-Encoding`.
- `/data/*`: 1 h cache.
- `/api/ibdash/*`: reverse proxy + 1 h in-process cache + stale-on-failure.
- HSTS, X-Content-Type-Options, X-Frame-Options on every response.

## Deploy

`.github/workflows/deploy.yaml`. Build job typechecks, builds, packs the container, uploads the image as an artifact. Three deploy jobs, each gated by the dispatch input, download the artifact, scp to the target host, `podman load` + restart, smoke-test with curl. Failed smoke leaves the prior container stopped.

```
push to master            → ibp-rotko-net
workflow_dispatch (gh UI) → ibp-rotko-net | ibp-network | dotters-network | all
```

```
gh workflow run deploy.yaml --repo ibp-network/www.ibp.network -f targets=ibp-rotko-net
gh workflow run deploy.yaml --repo ibp-network/www.ibp.network -f targets=all
gh run watch                --repo ibp-network/www.ibp.network
```

### Secrets

Three per target:

| Target          | Host                   | User                   | Private key            |
| --------------- | ---------------------- | ---------------------- | ---------------------- |
| ibp-rotko-net   | `IBP_ROTKO_NET_HOST`   | `IBP_ROTKO_NET_USER`   | `IBP_ROTKO_NET_KEY`    |
| ibp-network     | `IBP_NETWORK_HOST`     | `IBP_NETWORK_USER`     | `IBP_NETWORK_KEY`      |
| dotters-network | `DOTTERS_NETWORK_HOST` | `DOTTERS_NETWORK_USER` | `DOTTERS_NETWORK_KEY`  |

`*_HOST` is an SSH-reachable address. `*_USER` owns the podman container. `*_KEY` is the matching SSH private key (full PEM, including BEGIN/END lines).

Generating a key for a new target:

```
ssh-keygen -t ed25519 -f /tmp/ibp_deploy -C 'ibp-site github-actions deploy' -N ''
cat /tmp/ibp_deploy.pub | ssh <user>@<host> 'cat >> ~/.ssh/authorized_keys'

gh secret set <TARGET>_HOST --repo ibp-network/www.ibp.network --body "<host>"
gh secret set <TARGET>_USER --repo ibp-network/www.ibp.network --body "<user>"
gh secret set <TARGET>_KEY  --repo ibp-network/www.ibp.network < /tmp/ibp_deploy
```

Host requirements: podman, port `127.0.0.1:44446` free, upstream HAProxy (or equivalent) routing the public hostname to that loopback.

### Manual deploy

```
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

## Regenerating world-dots.svg

```
npx tsx scripts/generate-world-dots.ts
```

The script rasterises the natural-earth 50 m countries set onto a 360×180 grid using the same equirectangular projection as `ServiceMap2D.project()`. The two have to agree pixel-for-pixel — change the projection in one and rerun the script.
