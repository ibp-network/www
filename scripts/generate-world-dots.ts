/**
 * Generate `public/world-dots.svg` — the dot-mosaic continent layer used by
 * ServiceMap2D as a CSS mask.
 *
 * Pipeline:
 *   1. Fetch natural-earth-vector 50m countries GeoJSON (same data the 3D
 *      globe uses via globe.gl's hexPolygonsData, so the two maps share a
 *      coastline reference).
 *   2. For every cell in a `COLS × ROWS` grid, project the cell centre to
 *      lat/lng (equirectangular, matching the projection used in
 *      ServiceMap2D), and test whether it falls inside any country polygon.
 *   3. Emit a `<circle>` per land cell with cx/cy as a percentage of the
 *      viewBox.
 *
 * Resolution trade-off:
 *   110m countries + 120×60 grid: ~1.3 K dots, ~3.6 KB gz, Europe blob.
 *   50m countries + 360×180 grid: ~12 K dots, ~10 KB gz, individual
 *   countries (UK, Italy, Korea, Japan etc.) recognisable.
 *
 * Re-run: `npx tsx scripts/generate-world-dots.ts` whenever you want to
 * change resolution or update the natural-earth snapshot.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const GEOJSON =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';

const COLS = 360;
const ROWS = 180;
// Full equirectangular ±90° latitude span — anything narrower clips Canada's
// northern territories and Greenland (Iqaluit ~63°N, Greenland up to 83°N).
// ServiceMap2D.project() now uses the same span.
const LAT_TOP = 90;
const LAT_BOTTOM = -90;

type Ring = number[][];
type Polygon = Ring[];
type MultiPolygon = Polygon[];

function pointInRing(point: [number, number], ring: Ring): boolean {
  // Ray-casting (Sunday's algorithm).
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point: [number, number], polygon: Polygon): boolean {
  // First ring is outer, rest are holes.
  if (polygon.length === 0) return false;
  if (!pointInRing(point, polygon[0])) return false;
  for (let i = 1; i < polygon.length; i++) {
    if (pointInRing(point, polygon[i])) return false;
  }
  return true;
}

type Feature = {
  geometry?: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: Polygon | MultiPolygon;
  };
  bbox?: [number, number, number, number];
};

type FeatureWithBbox = {
  feature: Feature;
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
};

function computeBbox(coords: Polygon | MultiPolygon, isMulti: boolean): [number, number, number, number] {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  const visit = (lon: number, lat: number) => {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  };
  if (isMulti) {
    for (const poly of coords as MultiPolygon) {
      for (const ring of poly) for (const [lon, lat] of ring) visit(lon, lat);
    }
  } else {
    for (const ring of coords as Polygon) for (const [lon, lat] of ring) visit(lon, lat);
  }
  return [minLon, minLat, maxLon, maxLat];
}

async function main(): Promise<void> {
  console.log(`[world-dots] fetching ${GEOJSON}`);
  const res = await fetch(GEOJSON);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const gj = (await res.json()) as { features?: Feature[] };
  const raw = gj.features ?? [];
  console.log(`[world-dots] ${raw.length} country features`);

  const features: FeatureWithBbox[] = [];
  for (const f of raw) {
    if (!f.geometry) continue;
    const isMulti = f.geometry.type === 'MultiPolygon';
    if (!isMulti && f.geometry.type !== 'Polygon') continue;
    features.push({
      feature: f,
      bbox: computeBbox(f.geometry.coordinates as Polygon | MultiPolygon, isMulti),
    });
  }

  function isLand(lon: number, lat: number): boolean {
    for (const { feature, bbox } of features) {
      if (lon < bbox[0] || lon > bbox[2] || lat < bbox[1] || lat > bbox[3]) continue;
      const g = feature.geometry!;
      if (g.type === 'Polygon') {
        if (pointInPolygon([lon, lat], g.coordinates as Polygon)) return true;
      } else {
        for (const poly of g.coordinates as MultiPolygon) {
          if (pointInPolygon([lon, lat], poly)) return true;
        }
      }
    }
    return false;
  }

  // SVG viewBox matches the 2:1 container aspect so cells are square in
  // screen space (otherwise `preserveAspectRatio="slice"` clipped the top
  // and bottom of a 100×100 canvas rendered into a 2:1 container, AND made
  // vertical spacing visibly larger than horizontal — produced striped
  // rows instead of continents).
  //
  // Coordinates:
  //   cx: 0..200, linear in lon -180..180.
  //   cy: 0..100, linear in lat 60..-60 (clamped). Matches ServiceMap2D's
  //   project() so operator pin dots land on the right country.
  //
  // Cell size: 200/COLS by 100/ROWS — at 360×180 that's a square 0.556
  // SVG units. Dot radius set to 85% of half-cell so neighbours don't
  // visibly fuse.
  const cellW = 200 / COLS;
  const r = (Math.min(cellW, 100 / ROWS) * 0.5 * 0.85).toFixed(3);

  // Emit each land cell as `<use href="#d" x=".." y=".."/>` referencing a
  // single `<circle id="d" r="..."/>` in <defs>. The repeated prefix is
  // ~20 bytes shorter per element than inlining cx/cy/r on every <circle>,
  // and gzip compresses the literal `<use href="#d" x="` token block to
  // almost nothing — total file ≈ 30 KB gz instead of 60 KB.
  const uses: string[] = [];
  for (let row = 0; row < ROWS; row++) {
    const latFrac = (row + 0.5) / ROWS;
    const lat = LAT_TOP - latFrac * (LAT_TOP - LAT_BOTTOM);
    const cy = (((LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)) * 100).toFixed(2);
    for (let col = 0; col < COLS; col++) {
      const lonFrac = (col + 0.5) / COLS;
      const lon = -180 + lonFrac * 360;
      if (!isLand(lon, lat)) continue;
      const cx = (lonFrac * 200).toFixed(2);
      uses.push(`<use href="#d" x="${cx}" y="${cy}"/>`);
    }
    if (row % 20 === 0) {
      process.stdout.write(`[world-dots] row ${row}/${ROWS} land cells so far: ${uses.length}\r`);
    }
  }
  console.log(`\n[world-dots] ${uses.length} land cells total`);

  // preserveAspectRatio="none" stretches the SVG to fill the container,
  // safe because viewBox aspect matches container aspect (2:1).
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" preserveAspectRatio="none" fill="white">` +
    `<defs><circle id="d" r="${r}"/></defs>` +
    uses.join('') +
    `</svg>`;

  const out = path.resolve(process.cwd(), 'public', 'world-dots.svg');
  writeFileSync(out, svg);
  console.log(`[world-dots] wrote ${svg.length.toLocaleString()} bytes → ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
