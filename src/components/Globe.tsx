import { createEffect, createSignal, getOwner, onCleanup, onMount, runWithOwner, type JSX } from 'solid-js';
import type { Member } from '@/data/members';
import {
  compactNumber,
  useCountryRequests,
  useCountryRouting,
  useMemberRequests,
  type CountryRouting,
  type MemberRequests,
} from '@/data/dashboard';
import { bubbleColor } from '@/utils/country-color';
import { buildCountryBubbles } from '@/utils/country-traffic';
import { countryCentroid } from '@/data/country-centroids';

/**
 * Dot-pattern earth globe — matches the Figma direction (blue dot grid over
 * continents, near-black ocean, cosmic atmosphere rim). Uses globe.gl's
 * `hexPolygonsData` with a Natural Earth 110m countries GeoJSON loaded at
 * mount time, so there's no photographic texture and no large bundled
 * vector asset.
 */

type Arc = {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: [string, string];
  /** Stroke width for this arc, derived from request volume on this route. */
  stroke: number;
  /** Per-arc dash animation period in ms — shorter for hotter routes so the
   * eye reads them as "more traffic" without needing a legend. */
  dashTime: number;
};

const COUNTRIES_GEOJSON =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';

/**
 * Build the country → operator traffic arc set from the routing snapshot.
 * Top N edges by request volume; sqrt-scaled stroke so the long tail still
 * renders visibly. Colour stops blend the country side (cyan) with the
 * operator side (magenta) so each arc reads as "consumer request → IBP node".
 */
function buildTrafficArcs(
  routing: CountryRouting | null | undefined,
  members: readonly Member[],
  top = 36,
): Arc[] {
  if (!routing || !routing.edges.length) return [];
  const byName = new Map(members.map((m) => [m.name, m]));
  const arcs: Arc[] = [];
  const max = routing.max || 1;
  for (const e of routing.edges) {
    if (arcs.length >= top) break;
    const c = countryCentroid[e.country];
    const m = byName.get(e.member);
    if (!c || !m) continue;
    const share = Math.sqrt(e.requests / max); // 0..1
    arcs.push({
      startLat: c.lat,
      startLng: c.lng,
      endLat: m.lat,
      endLng: m.lng,
      color: [
        `rgba(0, 208, 255, ${(0.55 + share * 0.35).toFixed(3)})`,   // country side: cyan
        `rgba(245, 2, 255, ${(0.45 + share * 0.4).toFixed(3)})`,    // operator side: magenta
      ],
      stroke: 0.18 + share * 0.5,
      // Hotter routes pulse faster: ~1.5 s for top, ~4 s for the long tail.
      dashTime: 4000 - share * 2500,
    });
  }
  return arcs;
}

function initials(name: string): string {
  return (name.slice(0, 2) || '?').toUpperCase();
}

type MarkerCard = {
  num: HTMLElement;
  bar: HTMLElement;
  share: HTMLElement;
  block: HTMLElement;
};

/**
 * Write a member's 30-day traffic into its marker card. Used both at marker-
 * creation time (when memberReqs() may already be resolved) and from the
 * createEffect that fires after a late resolve. Idempotent.
 *
 * Bar width and the percentage label share one denominator (grand total of
 * all member traffic) so they say the same thing — otherwise a bar scaled
 * to "% of busiest member" reads as 95% next to text saying "18% of total",
 * which looks like the bar is "over 100%".
 */
function applyTraffic(card: MarkerCard, name: string, data: MemberRequests | null | undefined): void {
  if (!data) {
    card.block.style.display = 'none';
    return;
  }
  const v = data.totals.get(name);
  if (v == null) {
    card.block.style.display = 'none';
    return;
  }
  const pct = data.grandTotal ? (v / data.grandTotal) * 100 : 0;
  card.num.textContent = compactNumber(v);
  card.bar.style.width = `${Math.min(100, pct)}%`;
  card.share.textContent = `${pct.toFixed(1)}% of total IBP traffic`;
  card.block.style.display = '';
}

function markerEl(
  member: Member,
  logoUrl: string | undefined,
  registry: Map<string, MarkerCard>,
  initialTraffic: MemberRequests | null | undefined,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'ibp-marker';
  wrap.dataset.member = member.name;

  const dot = document.createElement('div');
  dot.className = 'ibp-marker-dot';
  if (logoUrl) {
    // Real operator logo from the canonical config. Fall back to initials
    // on load failure so a broken upstream CDN doesn't leave us with a blank dot.
    const img = document.createElement('img');
    img.src = logoUrl;
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.loading = 'lazy';
    img.className = 'ibp-marker-logo';
    img.onerror = () => {
      img.remove();
      dot.textContent = initials(member.name);
    };
    dot.appendChild(img);
  } else {
    dot.textContent = initials(member.name);
  }

  // Figma `.node-card` style: floating card to the right of the dot, shows on
  // hover. Region eyebrow + name + city/country. Stays anchored to the dot
  // because globe.gl positions the parent at the marker's lat/lng each frame.
  const card = document.createElement('div');
  card.className = 'ibp-marker-card';

  const region = document.createElement('div');
  region.className = 'ibp-card-region';
  region.textContent = member.region;

  const name = document.createElement('div');
  name.className = 'ibp-card-name';
  name.textContent = member.name;

  const loc = document.createElement('div');
  loc.className = 'ibp-card-loc';
  loc.textContent = `${member.city}, ${member.country}`;

  // Traffic block — populated lazily from the dashboard resource via the
  // registry the parent component fills when useMemberRequests resolves.
  // Hidden by default so the card doesn't show an empty row before data
  // arrives.
  const traffic = document.createElement('div');
  traffic.className = 'ibp-card-traffic';
  traffic.style.display = 'none';

  const trafficRow = document.createElement('div');
  trafficRow.className = 'ibp-card-traffic-row';
  const num = document.createElement('span');
  num.className = 'ibp-card-traffic-num';
  const unit = document.createElement('span');
  unit.className = 'ibp-card-traffic-unit';
  unit.textContent = 'requests / 30 d';
  trafficRow.append(num, unit);

  const bar = document.createElement('div');
  bar.className = 'ibp-card-traffic-bar';
  const fill = document.createElement('span');
  fill.className = 'ibp-card-traffic-fill';
  bar.appendChild(fill);

  const share = document.createElement('div');
  share.className = 'ibp-card-traffic-share';

  traffic.append(trafficRow, bar, share);

  const cardHandle = { num, bar: fill, share, block: traffic };
  registry.set(member.name, cardHandle);
  // Populate immediately if the dashboard resource is already resolved by the
  // time globe.gl asks for this marker. Without this, the createEffect below
  // only catches the "data arrives after markers" case; if data arrives first
  // the effect runs over an empty registry and the cards stay blank.
  applyTraffic(cardHandle, member.name, initialTraffic);

  card.appendChild(region);
  card.appendChild(name);
  card.appendChild(loc);
  card.appendChild(traffic);

  wrap.appendChild(dot);
  wrap.appendChild(card);
  return wrap;
}

type CountryPoint = {
  code: string;
  name: string;
  requests: number;
  lat: number;
  lng: number;
  /** Pre-baked colour string (no per-frame string allocation). */
  color: string;
  /** Pre-baked altitude/radius so globe.gl doesn't re-invoke per frame. */
  altitude: number;
  radius: number;
};

function buildCountryPoints(
  rows: ReadonlyArray<{ code: string; name: string; requests: number }> | undefined,
  max: number | undefined,
): CountryPoint[] {
  // No top-N cap — render every country the 2D map shows. With pointResolution
  // at 4 and the streamed insert below, even ~90 pillars upload to the GPU
  // without a visible hitch.
  return buildCountryBubbles(rows, max).map((b) => ({
    code: b.code,
    name: b.name,
    requests: b.requests,
    lat: b.lat,
    lng: b.lng,
    // Pillar height tracks linear share so a 20× traffic gap is a 20× height
    // gap; pillar radius and colour use the gentler sqrt curve so smaller
    // countries stay visible/readable.
    altitude: 0.004 + b.sizeT * 0.12,
    radius: 0.22 + b.colorT * 0.4,
    color: bubbleColor(b.colorT, 0.85),
  }));
}

export default function Globe(props: {
  members: readonly Member[];
  /** Optional lookup of operator name → logo URL (from the canonical config). */
  logoByName?: Record<string, string>;
  /**
   * Rendered if WebGL is unavailable or globe.gl fails to initialise. The
   * parent supplies it (rather than this component importing a fallback
   * directly) so the fallback component isn't duplicated across both
   * the parent's main chunk and the lazy Globe chunk — Carniato-style
   * de-dup at the chunk boundary.
   */
  webglFallback?: JSX.Element;
}): JSX.Element {
  let host: HTMLDivElement | undefined;
  let mount: HTMLDivElement | undefined;
  const [error, setError] = createSignal<string | null>(null);
  const countryReqs = useCountryRequests();
  const memberReqs = useMemberRequests();
  const routing = useCountryRouting(() => props.members.map((m) => m.name));
  // Map keyed by canonical member name → DOM handles for that marker's
  // traffic block. Populated as globe.gl asks for marker elements; updated
  // when useMemberRequests resolves. Lives on the closure so the htmlElement
  // callback and the dashboard effect can both see it.
  const markerCards = new Map<string, MarkerCard>();

  // Captured synchronously while the component's reactive owner is still
  // on the stack. onMount's callback awaits a dynamic import + fetch;
  // after the first await Solid's owner context is gone, so any
  // createEffect/onCleanup created post-await would leak (the
  // "computations created outside a createRoot/render" warnings). We
  // re-enter this owner with runWithOwner so they dispose on unmount.
  const owner = getOwner();

  onMount(async () => {
    if (!host || !mount) return;
    try {
      // Kick off both fetches in parallel — globe.gl's module + the countries
      // GeoJSON. ResizeObserver-fit lands once both resolve.
      const [{ default: Globe }, countriesRes] = await Promise.all([
        import('globe.gl'),
        fetch(COUNTRIES_GEOJSON),
      ]);

      let features: any[] = [];
      try {
        const data = await countriesRes.json();
        features = Array.isArray(data?.features) ? data.features : [];
      } catch {
        /* fall through with empty land mask; ocean-only globe still works */
      }

      // Re-enter the captured reactive owner: everything below creates
      // createEffect/onCleanup, which must be owned so they dispose when
      // the user navigates away from /members (otherwise they leak).
      runWithOwner(owner, () => {
      const globe = new Globe(mount)
        .backgroundColor('rgba(0,0,0,0)')
        // No globeImageUrl — solid sphere only, continents rendered via hexPolygonsData below.
        .showGlobe(true)
        .showAtmosphere(true)
        .atmosphereColor('#2D7BFF')
        .atmosphereAltitude(0.18)
        .hexPolygonsData(features)
        .hexPolygonResolution(3)
        .hexPolygonMargin(0.4)
        .hexPolygonUseDots(true)
        .hexPolygonColor(() => 'rgba(45, 123, 255, 0.85)')
        // Country-traffic heat layer: pink/magenta short pillars at each
        // country centroid, height + colour scaling with 30-day request
        // volume. Pink palette to stay clear of the cyan operator markers.
        //
        // Perf:
        //   - String accessors instead of per-row callbacks so globe.gl
        //     looks up plain properties (no JS frame per cylinder).
        //   - pointResolution 4 (square cylinder) — at this size the user
        //     can't tell it from 8, and triangle count halves.
        //   - color / altitude / radius pre-baked into each row at build
        //     time so there's no `Math.log10` work in the render loop.
        //   - Top-40 cap (see buildCountryPoints) keeps the geometry budget
        //     bounded even if more countries get traffic.
        .pointsData([] as CountryPoint[])
        .pointLat('lat')
        .pointLng('lng')
        .pointColor('color')
        .pointAltitude('altitude')
        .pointRadius('radius')
        .pointResolution(4)
        .pointLabel(
          (d: any) =>
            `<div style="background:rgba(20,20,20,0.85);color:#fff;padding:6px 10px;border-radius:6px;font:500 12px/1.3 system-ui, -apple-system, sans-serif;border:1px solid rgba(255,64,159,0.4)">` +
            `<div style="text-transform:uppercase;letter-spacing:0.14em;font-size:10px;color:#bdbdbd">Country traffic · 30 d</div>` +
            `<div style="margin-top:3px"><b>${(d as CountryPoint).name}</b> · ${(d as CountryPoint).requests.toLocaleString()} reqs</div>` +
            `</div>`,
        )
        .htmlElementsData([...props.members])
        .htmlLat((d: any) => (d as Member).lat)
        .htmlLng((d: any) => (d as Member).lng)
        .htmlAltitude(0.02)
        .htmlElement((d: any) => {
          const m = d as Member;
          return markerEl(
            m,
            m.logoUrl ?? props.logoByName?.[m.name],
            markerCards,
            memberReqs(),
          );
        })
        // Country-to-operator traffic arcs. Empty initial, filled by the
        // `createEffect` below when `useCountryRouting()` resolves. Each arc
        // carries its own per-edge `stroke` and `dashTime` (hotter routes
        // pulse faster) — globe.gl accepts function accessors for both, so
        // each arc visually scales with its own volume share.
        .arcsData([] as Arc[])
        .arcColor('color')
        .arcDashLength(0.35)
        .arcDashGap(0.4)
        .arcDashAnimateTime((d: any) => (d as Arc).dashTime)
        .arcStroke((d: any) => (d as Arc).stroke)
        .arcAltitudeAutoScale(0.45);

      // Solid base sphere — near-black, faint blue tint for the "ocean".
      const sceneGlobe = (globe as any).globeMaterial?.();
      if (sceneGlobe) {
        sceneGlobe.color = { r: 0.02, g: 0.03, b: 0.06 } as any;
        sceneGlobe.emissive = { r: 0.02, g: 0.05, b: 0.12 } as any;
        sceneGlobe.shininess = 0.8;
      }

      // (Country heat-layer points are populated by the streaming effect
      //  below — see the BATCH-tick loop. There was a second
      //  createEffect here that bulk-set pointsData() in one shot; it
      //  fought the streamer (pop-in then reset-to-batch then stream-up)
      //  and burned a duplicate buildCountryPoints pass on every refresh.
      //  The streamer alone covers both first-paint and revalidation.)

      // Traffic arcs from country centroids to operator pins. Top 36 edges
      // by request volume; the visual carries the dominant routes (US →
      // Stake Plus, CN → Rotko, etc.) without drowning the globe in 700
      // hair-thin arcs.
      createEffect(() => {
        const r = routing();
        if (!r) return;
        globe.arcsData(buildTrafficArcs(r, props.members));
      });

      // Member traffic in marker cards — fill (or update) every registered
      // card whenever the dashboard resource resolves or refetches. Cards
      // created before the resource resolved get their first paint here;
      // cards created after already have data from markerEl's inline apply.
      createEffect(() => {
        const data = memberReqs();
        if (!data) return;
        for (const [name, card] of markerCards) applyTraffic(card, name, data);
      });

      // Stream country pillars in: rather than dumping all ~40 pillars on the
      // GPU in one frame (visible hitch when WebGL uploads the buffer), push
      // a small batch per idle tick. Effect re-runs only when the underlying
      // resource resolves; subsequent batches are scheduled inside.
      let streamTimer: ReturnType<typeof setTimeout> | null = null;
      let streamCancel = false;
      createEffect(() => {
        const r = countryReqs();
        if (!r) return;
        const full = buildCountryPoints(r.rows, r.max);
        if (streamTimer) clearTimeout(streamTimer);
        streamCancel = false;
        // Highest-traffic countries first so the most informative pillars
        // appear immediately; the long tail fills in behind.
        let i = 0;
        const BATCH = 4;
        const tick = () => {
          if (streamCancel) return;
          i = Math.min(full.length, i + BATCH);
          globe.pointsData(full.slice(0, i));
          if (i < full.length) {
            streamTimer = setTimeout(tick, 90);
          } else {
            streamTimer = null;
          }
        };
        tick();
      });
      onCleanup(() => {
        streamCancel = true;
        if (streamTimer) clearTimeout(streamTimer);
      });

      const controls = globe.controls();
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.35;
      controls.enableDamping = true;
      controls.dampingFactor = 0.6;
      controls.enableZoom = true;
      controls.minDistance = 200;
      controls.maxDistance = 600;

      globe.pointOfView({ lat: 20, lng: 0, altitude: 2.6 }, 0);

      const fit = () => {
        if (!host) return;
        const rect = host.getBoundingClientRect();
        globe.width(rect.width).height(rect.height);
      };
      fit();
      const resizeObs = new ResizeObserver(fit);
      resizeObs.observe(host);

      onCleanup(() => {
        resizeObs.disconnect();
        const destructor = (globe as any)._destructor;
        if (typeof destructor === 'function') destructor.call(globe);
      });
      }); // end runWithOwner
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  });

  return (
    <div ref={host} class="relative w-full h-full">
      <style>{`
        .ibp-marker { pointer-events: auto; cursor: pointer; transform: translate(-50%, -50%); }
        .ibp-marker-dot {
          width: 36px; height: 36px;
          display: flex; align-items: center; justify-content: center;
          /* Light background so the original-colour operator logos read
             cleanly. Dark-on-transparent and light-on-transparent both work. */
          background: rgba(255,255,255,0.96);
          color: #1a1a1a;
          font: 700 11px/1 system-ui, -apple-system, sans-serif;
          border: 1.5px solid rgba(255,255,255,0.6);
          border-radius: 50%;
          overflow: hidden;
          box-shadow:
            0 0 0 6px rgba(45,123,255,0.18),
            0 0 22px rgba(93,175,255,0.55),
            0 4px 16px rgba(0,0,0,0.5);
          transition: transform 200ms ease, box-shadow 200ms ease;
        }
        .ibp-marker-logo {
          width: 78%; height: 78%; object-fit: contain;
          /* No colour filter — render the operator's actual logo so visitors
             can recognise it. The white dot background reads well against any
             logo colour. */
        }
        .ibp-marker:hover .ibp-marker-dot {
          transform: scale(1.18);
          box-shadow:
            0 0 0 10px rgba(45,123,255,0.25),
            0 0 32px rgba(93,175,255,0.7),
            0 6px 22px rgba(0,0,0,0.6);
        }
        /* Figma .node-card — appears to the right of the marker dot on hover,
           vertically centred, with the cosmic gradient accent bar. */
        .ibp-marker-card {
          position: absolute; left: 100%; top: 50%;
          transform: translate(16px, -50%);
          width: 220px;
          padding: 14px 16px;
          background: rgba(20,20,20,0.78);
          backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          box-shadow: 0 14px 50px rgba(0,0,0,0.6);
          opacity: 0;
          pointer-events: none;
          transition: opacity 180ms ease, transform 200ms ease;
          z-index: 5;
        }
        .ibp-marker-card::before {
          content: ""; position: absolute; left: 0; top: 14px; bottom: 14px;
          width: 2px; border-radius: 2px;
          background: linear-gradient(135deg, #00d0ff, #f502ff);
        }
        .ibp-marker:hover .ibp-marker-card {
          opacity: 1;
          transform: translate(20px, -50%);
        }
        .ibp-card-region {
          font: 500 11px/1 system-ui, -apple-system, sans-serif;
          color: #bdbdbd;
          text-transform: uppercase;
          letter-spacing: 0.16em;
          margin-bottom: 6px;
        }
        .ibp-card-name {
          font: 500 16px/1.2 'Avenir Next', system-ui, -apple-system, sans-serif;
          color: #fff;
          margin-bottom: 4px;
        }
        .ibp-card-loc {
          font: 400 12px/1.3 system-ui, -apple-system, sans-serif;
          color: rgba(255,255,255,0.6);
        }
        .ibp-card-traffic {
          margin-top: 12px; padding-top: 10px;
          border-top: 1px solid rgba(255,255,255,0.08);
        }
        .ibp-card-traffic-row {
          display: flex; align-items: baseline; gap: 6px;
        }
        .ibp-card-traffic-num {
          font: 500 17px/1 system-ui, -apple-system, sans-serif;
          color: #fff; letter-spacing: -0.01em;
        }
        .ibp-card-traffic-unit {
          font: 400 11px/1 system-ui, -apple-system, sans-serif;
          color: rgba(255,255,255,0.55);
        }
        .ibp-card-traffic-bar {
          margin-top: 8px; height: 4px; border-radius: 2px;
          background: rgba(255,255,255,0.08); overflow: hidden;
        }
        .ibp-card-traffic-fill {
          display: block; height: 100%;
          background: linear-gradient(90deg, #FF409F 0%, #f502ff 100%);
          border-radius: 2px;
          width: 0%;
          transition: width 480ms ease-out;
        }
        .ibp-card-traffic-share {
          margin-top: 4px;
          font: 400 10px/1.2 system-ui, -apple-system, sans-serif;
          color: rgba(255,255,255,0.55);
          letter-spacing: 0.04em;
        }
      `}</style>
      <div ref={mount} class="absolute inset-0" />
      {error() && (
        <div class="absolute inset-0">
          {/* WebGL unavailable — render whatever fallback the parent passes.
              The parent already has its fallback component loaded for the
              "before user toggles 3D" state, so we reuse that bundle
              instead of importing a duplicate. */}
          {props.webglFallback}
        </div>
      )}
      {/* Hover card is rendered INSIDE each marker element (see markerEl)
          so it anchors to the dot's screen position via globe.gl projection.
          No top-corner floating card here anymore. */}
    </div>
  );
}
