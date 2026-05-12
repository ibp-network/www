import { createMemo, createSignal, For, Show } from 'solid-js';
import { useNetworkSnapshot, type Member } from '@/data/network';
import { useMemberLatencies } from '@/utils/latency';
import { compactNumber, useCountryRequests, useMemberRequests } from '@/data/dashboard';
import { bubbleColor } from '@/utils/country-color';
import { buildCountryBubbles, type CountryBubble as BaseBubble } from '@/utils/country-traffic';

/**
 * 2D service map — dot-mosaic continents + percent-positioned ping dots.
 *
 * Continents: `public/world-dots.svg` is generated at build time from the
 * natural-earth-vector 110m countries GeoJSON, rasterised onto a 120×60
 * grid (1339 land cells), shipped as a single CSS mask (~3.6 KB gz). The
 * coloured background underneath is what's visible through the mask.
 *
 * Pins: members come from members_professional.json (canonical config).
 * Positions are projected from Location.Latitude / Longitude via the same
 * clamped equirectangular projection used to bake the mask, so pin dots
 * align with their actual landmass. Per-pin latency comes from a
 * browser-side HTTPS probe against each member's ServiceIPv4 — see
 * src/utils/latency.ts.
 *
 * TODO: animate DNS query arrivals (poll ibdash member_traffic, emit a
 * brief pulse per resolution at the routed member's pin).
 *
 * No WebGL, no runtime dependencies beyond the live snapshot fetch.
 */

type Pin = Member & { x: number; y: number };

/**
 * Equirectangular projection — must match `scripts/generate-world-dots.ts`
 * exactly. Both layers map lon -180..180 → x 0..100% and lat 90..-90 → y
 * 0..100%. Full world span so Canada's northern territories and Greenland
 * are visible.
 */
function project(lat: number, lon: number): { x: number; y: number } {
  const x = ((lon + 180) / 360) * 100;
  const clamped = Math.max(-90, Math.min(90, lat));
  const y = ((90 - clamped) / 180) * 100; // 90° → 0%, 0° → 50%, -90° → 100%
  return { x: Math.max(2, Math.min(98, x)), y: Math.max(2, Math.min(98, y)) };
}

function formatLatency(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 5) return '< 5 ms';
  return `${Math.round(ms)} ms`;
}

type CountryBubble = BaseBubble & { x: number; y: number };

export default function ServiceMap2D() {
  const snap = useNetworkSnapshot();
  // Members rarely change within a page session, so memoise the filtered list
  // — every downstream subscriber (pins, latency probe, activePin lookup)
  // shares one result per snapshot tick instead of refiltering on each read.
  const members = createMemo(
    () => snap()?.members.filter((m) => m.lat != null && m.lon != null) ?? [],
  );
  const latencies = useMemberLatencies(members);
  const countryReqs = useCountryRequests();
  const memberReqs = useMemberRequests();

  // Memo: projection is deterministic in (lat, lon); only recompute when the
  // member list changes (rare). The For below was sampling pins() through the
  // activePin() lookup AND through the rendering pass, doubling the project
  // work each tick.
  const pins = createMemo<Pin[]>(() =>
    members().map((m) => ({ ...m, ...project(m.lat!, m.lon!) })),
  );

  // No default-active pin: on touch devices there's no hover, so any default
  // pin would render its node-card on top of the map permanently with no way
  // to dismiss it. Card only shows after the user actively hovers (desktop)
  // or taps (mobile). Tap toggles, and tapping the map background clears.
  const [active, setActive] = createSignal<string | null>(null);
  const activePin = createMemo(() => {
    const name = active();
    if (!name) return null;
    return pins().find((p) => p.name === name) ?? null;
  });

  // Bubbles come from the shared `buildCountryBubbles` helper so the 2D map
  // and the 3D globe stay in sync (same scale, same set, same colour curve).
  // We just project lat/lng → x/y here for the percent-positioned overlay.
  const bubbles = createMemo<CountryBubble[]>(() => {
    const data = countryReqs();
    return buildCountryBubbles(data?.rows, data?.max).map((b) => {
      const { x, y } = project(b.lat, b.lng);
      return { ...b, x, y };
    });
  });

  return (
    <div
      class="relative aspect-[4/3] sm:aspect-[5/3] md:aspect-[2/1] rounded-2xl overflow-hidden border border-ink-600 bg-ink-950 service-map"
      onClick={() => setActive(null)}
    >
      <style>{`
        /* Deep-space backdrop:
           - tiny starfield pinpricks (eight, baked into the gradient stack)
           - atmospheric blue glow at the centre
           - magenta hint bottom-left, cyan hint top-right (brand tilt)
           - vignette to fade the edges to black
           Folded into one background-image stack so absolute children
           layer cleanly on top with no pseudo-element stacking issues. */
        .service-map {
          background:
            radial-gradient(1px 1px at 12% 18%, rgba(255,255,255,0.7), transparent 60%),
            radial-gradient(1px 1px at 78% 22%, rgba(180,210,255,0.6), transparent 60%),
            radial-gradient(1px 1px at 38% 8%, rgba(255,255,255,0.5), transparent 60%),
            radial-gradient(1px 1px at 62% 88%, rgba(200,180,255,0.55), transparent 60%),
            radial-gradient(1px 1px at 88% 64%, rgba(255,255,255,0.65), transparent 60%),
            radial-gradient(1px 1px at 22% 76%, rgba(180,210,255,0.5), transparent 60%),
            radial-gradient(1px 1px at 5% 50%, rgba(255,255,255,0.45), transparent 60%),
            radial-gradient(1px 1px at 95% 42%, rgba(255,255,255,0.55), transparent 60%),
            radial-gradient(ellipse 100% 90% at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%),
            radial-gradient(ellipse 30% 60% at 0% 100%, rgba(245, 2, 255, 0.08), transparent 60%),
            radial-gradient(ellipse 30% 60% at 100% 0%, rgba(0, 208, 255, 0.06), transparent 60%),
            radial-gradient(ellipse 80% 60% at 50% 50%, rgba(30, 60, 120, 0.30) 0%, rgba(8, 12, 24, 0.55) 50%, #000 90%);
          background-color: #000;
        }
        /* Real continent geometry, baked at build time from natural-earth-vector
           110m countries GeoJSON into a 120×60 dot mosaic (1339 dots,
           ~3.6 KB gzipped). The SVG is used as a CSS mask — the visible
           colour comes from the background, the SVG cuts it into the mosaic. */
        .service-map .continents {
          position: absolute; inset: 0; pointer-events: none;
          background:
            radial-gradient(ellipse 70% 50% at 50% 50%, rgba(140, 200, 255, 0.55), rgba(70, 140, 240, 0.22) 60%, rgba(0, 0, 0, 0) 90%);
          -webkit-mask: url('/world-dots.svg') center / 100% 100% no-repeat;
                  mask: url('/world-dots.svg') center / 100% 100% no-repeat;
          filter: drop-shadow(0 0 6px rgba(45, 123, 255, 0.25));
        }

        .service-map .country-bubble {
          position: absolute; border-radius: 50%;
          transform: translate(-50%, -50%) scale(0.6);
          opacity: 0;
          pointer-events: auto; cursor: default;
          /* lighten keeps the brightest pixel of overlapping bubbles instead
             of summing, so a tight cluster of small European countries doesn't
             paint as one hot blob the way screen did. */
          mix-blend-mode: lighten;
          animation: bubble-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          transition: filter .15s ease-out, transform .15s ease-out;
        }
        @keyframes bubble-in {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1);   }
        }
        .service-map .country-bubble:hover {
          filter: brightness(1.25);
          transform: translate(-50%, -50%) scale(1.15);
          z-index: 4;
        }
        @media (prefers-reduced-motion: reduce) {
          .service-map .country-bubble {
            animation-duration: 0.001s;
            animation-delay: 0s !important;
          }
        }
        /* Hover label — country name + 30 d request total, attached via
           data attributes on each bubble. Pseudo-element keeps the DOM
           flat (no per-bubble label children). Mix-blend stays off the
           label so it reads clearly above the heat layer. */
        .service-map .country-bubble::after {
          content: attr(data-name) ' · ' attr(data-reqs);
          position: absolute; left: 50%; top: 100%;
          transform: translate(-50%, 8px);
          padding: 4px 8px; border-radius: 4px;
          background: rgba(20, 20, 20, 0.92);
          border: 1px solid rgba(255, 64, 159, 0.4);
          color: #fff;
          font: 500 11px/1.2 system-ui, -apple-system, sans-serif;
          letter-spacing: 0.01em;
          white-space: nowrap;
          mix-blend-mode: normal;
          opacity: 0; pointer-events: none;
          transition: opacity .12s ease-out;
        }
        .service-map .country-bubble:hover::after { opacity: 1; }

        .service-map .ping {
          position: absolute; width: 14px; height: 14px; border-radius: 50%;
          background: linear-gradient(135deg, #00d0ff, #f502ff);
          box-shadow: 0 0 0 0 rgba(0, 208, 255, 0.6);
          animation: ping-glow 2.4s ease-out infinite;
          transform: translate(-50%, -50%);
          cursor: pointer; border: 0; padding: 0;
        }
        .service-map .ping::before {
          content: ""; position: absolute; inset: -6px; border-radius: 50%;
          border: 1px solid rgba(255, 255, 255, 0.7);
          animation: ping-ring 2.4s ease-out infinite;
        }
        .service-map .ping::after {
          content: ""; position: absolute; inset: -14px; border-radius: 50%;
          border: 1px solid rgba(255, 255, 255, 0.35);
          animation: ping-ring 2.4s ease-out .4s infinite;
        }
        .service-map .ping.active { box-shadow: 0 0 0 4px rgba(245,2,255,0.35), 0 0 30px rgba(0,208,255,0.7); }

        @keyframes ping-glow {
          0%   { box-shadow: 0 0 0 0 rgba(0, 208, 255, 0.55); }
          70%  { box-shadow: 0 0 0 22px rgba(0, 208, 255, 0); }
          100% { box-shadow: 0 0 0 0 rgba(0, 208, 255, 0); }
        }
        @keyframes ping-ring {
          0%   { transform: scale(0.7); opacity: 0.9; }
          100% { transform: scale(2.2); opacity: 0; }
        }

        .service-map .node-card {
          position: absolute; width: 240px; border-radius: 12px;
          background: rgba(20, 20, 20, 0.78);
          backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 14px 16px;
          transform: translate(20px, -50%);
          box-shadow: 0 14px 50px rgba(0, 0, 0, 0.6);
          pointer-events: none;
        }
        .service-map .node-card::before {
          content: ""; position: absolute; left: 0; top: 14px; bottom: 14px;
          width: 2px; border-radius: 2px;
          background: linear-gradient(135deg, #00d0ff, #f502ff);
        }
        .service-map .node-card .region {
          font-size: 11px; color: #bdbdbd; text-transform: uppercase;
          letter-spacing: 0.16em; margin-bottom: 6px;
        }
        .service-map .node-card .name { font-size: 18px; color: #fff; margin-bottom: 10px; }
        .service-map .node-card .traffic {
          margin-top: 12px; padding-top: 10px;
          border-top: 1px solid rgba(255,255,255,0.08);
        }
        .service-map .node-card .traffic .row {
          display: flex; align-items: baseline; gap: 6px;
        }
        .service-map .node-card .traffic .num {
          font: 500 17px/1 system-ui, -apple-system, sans-serif;
          color: #fff; letter-spacing: -0.01em;
        }
        .service-map .node-card .traffic .unit {
          font: 400 11px/1 system-ui, -apple-system, sans-serif;
          color: rgba(255,255,255,0.55);
        }
        .service-map .node-card .traffic .bar {
          margin-top: 8px; height: 4px; border-radius: 2px;
          background: rgba(255,255,255,0.08);
          overflow: hidden;
        }
        .service-map .node-card .traffic .bar .fill {
          display: block; height: 100%;
          background: linear-gradient(90deg, #FF409F 0%, #f502ff 100%);
          border-radius: 2px;
        }
        .service-map .node-card .traffic .share {
          margin-top: 4px;
          font: 400 10px/1.2 system-ui, -apple-system, sans-serif;
          color: rgba(255,255,255,0.55);
          letter-spacing: 0.04em;
        }

        .service-map .node-card .ping-btn {
          display: inline-flex; align-items: center; gap: 8px;
          height: 30px; padding: 0 12px; border-radius: 6px;
          background: rgba(217, 217, 217, 0.10); font-size: 11px; color: #fff;
        }
        .service-map .node-card .led {
          width: 6px; height: 6px; border-radius: 50%; background: #3CFF8E;
          box-shadow: 0 0 10px #3CFF8E;
        }
        .service-map .node-card .led.dim { background: #7e7e7e; box-shadow: none; }

        .service-map .map-pill {
          position: absolute; left: 50%; bottom: 22px;
          transform: translateX(-50%);
          padding: 6px 14px; border-radius: 6px;
          background: rgba(217, 217, 217, 0.10);
          backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #fff; font-size: 11px; letter-spacing: 0.02em;
          max-width: calc(100% - 24px);
          text-align: center;
        }

        /* Phone layout. The 240-px node-card pinned to the side of a pin
           overflows narrow screens; convert to a bottom-anchored card that
           spans the map width. The map-pill shrinks; the country-bubble
           tooltip widens to two short lines so the long country names
           don't run off the side of the canvas. */
        @media (max-width: 640px) {
          .service-map .node-card {
            position: absolute;
            left: 8px !important;
            right: 8px;
            top: auto !important;
            bottom: 8px;
            width: auto;
            transform: none;
            padding: 10px 12px;
          }
          .service-map .node-card .name { font-size: 16px; margin-bottom: 6px; }
          .service-map .map-pill {
            font-size: 10px; padding: 4px 10px; bottom: 8px;
          }
          /* On mobile, hide the bottom pill while a node-card is visible
             (we don't want two badges fighting for the same band). */
          .service-map:has(.node-card) .map-pill { display: none; }
          .service-map .country-bubble::after {
            font-size: 10px; padding: 3px 6px;
          }
        }
      `}</style>

      <div class="continents" aria-hidden />

      {/* Country-traffic heat layer — IBP-palette bubbles sized + coloured by
          30-day request volume. Sits between continents and operator pins so
          the operator dots stay on top and the labels in the node-card win. */}
      <For each={bubbles()}>
        {(b, i) => {
          // Diameter is linear in share so US-vs-CA paints as a 20× area gap.
          // Colour uses sqrt-compressed share so low-traffic bubbles still
          // have a visible pink tint instead of fading to invisible.
          const size = 4 + b.sizeT * 56;
          const fill = bubbleColor(b.colorT, 0.55);
          const glow = bubbleColor(b.colorT, 0.32);
          // Staggered fade-in: bubbles arrive top-traffic first (rows are
          // pre-sorted by request count in `buildCountryBubbles`). 25 ms
          // per bubble means the whole field of ~80 lands inside 2 s. CSS
          // animation is GPU-cheap; no JS bookkeeping required.
          return (
            <div
              class="country-bubble"
              style={{
                left: `${b.x}%`,
                top: `${b.y}%`,
                width: `${size}px`,
                height: `${size}px`,
                background: `radial-gradient(circle, ${fill} 0%, ${glow} 55%, transparent 80%)`,
                'animation-delay': `${i() * 25}ms`,
              }}
              data-name={b.name}
              data-reqs={`${b.requests.toLocaleString()} reqs / 30 d`}
              aria-label={`${b.name}: ${b.requests.toLocaleString()} requests in last 30 days`}
            />
          );
        }}
      </For>

      <For each={pins()}>
        {(p) => (
          <button
            class="ping"
            classList={{ active: active() === p.name }}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            aria-label={`${p.name} · ${p.region ?? ''} · ${formatLatency(latencies()?.get(p.name))}`}
            onMouseEnter={() => setActive(p.name)}
            onClick={(e) => {
              // Tap toggles on mobile (where there's no hover). Stop the
              // event so the map-background click handler below doesn't
              // immediately clear it.
              e.stopPropagation();
              setActive((cur) => (cur === p.name ? null : p.name));
            }}
          />
        )}
      </For>

      <Show when={activePin()}>
        {(p) => {
          const lat = () => latencies()?.get(p().name);
          const reqs = () => memberReqs()?.totals.get(p().name) ?? null;
          const share = () => {
            const m = memberReqs();
            const v = m?.totals.get(p().name);
            if (!m || !v || !m.grandTotal) return null;
            return v / m.grandTotal;
          };
          return (
            <div class="node-card" style={{ left: `${p().x}%`, top: `${p().y}%` }}>
              <div class="region">{p().region ?? ''}</div>
              <div class="name">{p().name}</div>
              <span class="ping-btn">
                <span class="led" classList={{ dim: lat() == null }} />
                {lat() == null ? 'Probing…' : `Your latency · ${formatLatency(lat())}`}
              </span>
              <Show when={reqs() != null}>
                <div class="traffic">
                  <div class="row">
                    <span class="num">{compactNumber(reqs()!)}</span>
                    <span class="unit">requests / 30 d</span>
                  </div>
                  <Show when={share() != null}>
                    <div class="bar" aria-hidden>
                      <span class="fill" style={{ width: `${Math.min(100, share()! * 100)}%` }} />
                    </div>
                    <div class="share">
                      {(share()! * 100).toFixed(1)}% of total IBP traffic
                    </div>
                  </Show>
                </div>
              </Show>
            </div>
          );
        }}
      </Show>

      <div class="map-pill">
        {pins().length} active operators
        <Show when={countryReqs()?.grandTotal}>
          <span> · {compactNumber(countryReqs()!.grandTotal)} requests in last 30 d</span>
        </Show>
      </div>
    </div>
  );
}
