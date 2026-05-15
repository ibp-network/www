/**
 * Shared country-traffic bubble builder. Both the 2D map (`ServiceMap2D`) and
 * the 3D globe (`Globe`) need the same projection of `useCountryRequests()`
 * into renderable bubbles, so the math lives here.
 *
 * Two normalisation curves are exposed per bubble so the renderer can use
 * the one each visual property wants:
 *
 *   - `sizeT`: **linear** share-of-max. The user reads visual area as
 *     request volume, so a 20× traffic gap (e.g. US vs Canada) needs to
 *     paint as a 20× area gap — not a sqrt-flattened 4× one.
 *   - `colorT`: **sqrt** share-of-max. Pure linear collapses every non-top
 *     country to faint pink; sqrt compression keeps mid-tier countries
 *     readably tinted while still tracking traffic order.
 */

import { countryCentroid } from '@/data/country-centroids';

export type CountryBubble = {
  code: string;
  name: string;
  requests: number;
  lat: number;
  lng: number;
  sizeT: number;
  colorT: number;
};

export type CountryTrafficRow = { code: string; name: string; requests: number };

/**
 * Caller contract: `rows` MUST come pre-sorted descending by request count.
 * `useCountryRequests` in data/dashboard.ts already returns them that way, so
 * we just preserve order through the projection — no redundant `.sort()` here
 * (and no `[...rows]` copy). Renderers can rely on first-row-is-busiest for
 * staggered animations.
 */
export function buildCountryBubbles(
  rows: ReadonlyArray<CountryTrafficRow> | undefined,
  max: number | undefined,
): CountryBubble[] {
  if (!rows || !max) return [];
  const out: CountryBubble[] = [];
  for (const row of rows) {
    const c = countryCentroid[row.code];
    if (!c) continue;
    const share = row.requests / max;
    out.push({
      code: row.code,
      name: row.name,
      requests: row.requests,
      lat: c.lat,
      lng: c.lng,
      sizeT: share,
      colorT: Math.sqrt(share),
    });
  }
  return out;
}
