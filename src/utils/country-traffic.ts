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

export type BuildOptions = {
  /** Cap the bubble count to the top-N traffic countries. Default: no cap. */
  top?: number;
};

export function buildCountryBubbles(
  rows: ReadonlyArray<CountryTrafficRow> | undefined,
  max: number | undefined,
  options: BuildOptions = {},
): CountryBubble[] {
  if (!rows || !max) return [];
  const source =
    options.top != null && options.top < rows.length
      ? [...rows].sort((a, b) => b.requests - a.requests).slice(0, options.top)
      : rows;
  const out: CountryBubble[] = [];
  for (const row of source) {
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
