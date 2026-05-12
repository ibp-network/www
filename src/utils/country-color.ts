/**
 * Shared colour ramp for the country-traffic heat layer used on both the 2D
 * service map and the 3D globe. Pink → magenta gradient — deliberately warm
 * to keep the country layer visually distinct from the cyan-leaning operator
 * pins.
 */
export function bubbleColor(t: number, alpha: number): string {
  const stops = [
    { at: 0,   r: 200, g: 150, b: 180 },
    { at: 0.5, r: 255, g: 64,  b: 159 },
    { at: 1,   r: 245, g: 2,   b: 255 },
  ];
  const u = Math.max(0, Math.min(1, t));
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (u >= stops[i].at && u <= stops[i + 1].at) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }
  const span = hi.at - lo.at || 1;
  const k = (u - lo.at) / span;
  const r = Math.round(lo.r + (hi.r - lo.r) * k);
  const g = Math.round(lo.g + (hi.g - lo.g) * k);
  const b = Math.round(lo.b + (hi.b - lo.b) * k);
  return `rgba(${r},${g},${b},${alpha})`;
}
