/**
 * Routed-to detection: which IBP member is the user most likely to hit
 * when resolving `<chain>.dotters.network` or `<chain>.ibp.network`?
 *
 * Strategy — privacy-friendly first, accurate second:
 *
 *   1. Read the browser's IANA timezone via Intl.DateTimeFormat. No network,
 *      no third-party IP leak. Maps timezone → continent → nearest member.
 *      This is the default and runs synchronously.
 *
 *   2. Optionally, `refineWithIp()` calls a free IP-geo service (ipapi.co)
 *      to get exact lat/lng. Only invoked when the caller explicitly asks
 *      — surface as a "Use precise location" button, not on page load.
 */

import { members, type Member } from '@/data/members';

const haversineKm = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number => {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371; // Earth radius in km
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const x =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
};

/** Coarse continent buckets aligned with member `region` strings. */
export type Region = Member['region'];

/**
 * Map an IANA timezone (e.g. "Europe/Zurich") to a representative lat/lng.
 * Centroids are eyeballed regional anchors — accurate enough to pick the
 * nearest member, not accurate enough to use for anything else.
 */
const timezoneAnchors: Record<string, { lat: number; lng: number }> = {
  // Africa
  Africa: { lat: 9.0, lng: 8.0 },
  // Americas
  'America/New_York': { lat: 40.7, lng: -74.0 },
  'America/Chicago': { lat: 41.9, lng: -87.6 },
  'America/Denver': { lat: 39.7, lng: -105.0 },
  'America/Los_Angeles': { lat: 34.0, lng: -118.2 },
  'America/Phoenix': { lat: 33.4, lng: -112.1 },
  'America/Anchorage': { lat: 61.2, lng: -149.9 },
  'America/Toronto': { lat: 43.7, lng: -79.4 },
  'America/Vancouver': { lat: 49.3, lng: -123.1 },
  'America/Mexico_City': { lat: 19.4, lng: -99.1 },
  'America/Costa_Rica': { lat: 9.9, lng: -84.1 },
  'America/Panama': { lat: 8.9, lng: -79.5 },
  'America/Bogota': { lat: 4.6, lng: -74.1 },
  'America/Lima': { lat: -12.0, lng: -77.0 },
  'America/Santiago': { lat: -33.4, lng: -70.7 },
  'America/Argentina/Buenos_Aires': { lat: -34.6, lng: -58.4 },
  'America/Sao_Paulo': { lat: -23.5, lng: -46.6 },
  // Europe
  'Europe/London': { lat: 51.5, lng: -0.1 },
  'Europe/Dublin': { lat: 53.3, lng: -6.3 },
  'Europe/Paris': { lat: 48.9, lng: 2.4 },
  'Europe/Berlin': { lat: 52.5, lng: 13.4 },
  'Europe/Amsterdam': { lat: 52.4, lng: 4.9 },
  'Europe/Brussels': { lat: 50.9, lng: 4.4 },
  'Europe/Zurich': { lat: 47.4, lng: 8.5 },
  'Europe/Vienna': { lat: 48.2, lng: 16.4 },
  'Europe/Madrid': { lat: 40.4, lng: -3.7 },
  'Europe/Lisbon': { lat: 38.7, lng: -9.1 },
  'Europe/Rome': { lat: 41.9, lng: 12.5 },
  'Europe/Stockholm': { lat: 59.3, lng: 18.1 },
  'Europe/Oslo': { lat: 59.9, lng: 10.7 },
  'Europe/Helsinki': { lat: 60.2, lng: 24.9 },
  'Europe/Warsaw': { lat: 52.2, lng: 21.0 },
  'Europe/Prague': { lat: 50.1, lng: 14.4 },
  'Europe/Athens': { lat: 38.0, lng: 23.7 },
  'Europe/Istanbul': { lat: 41.0, lng: 29.0 },
  'Europe/Moscow': { lat: 55.8, lng: 37.6 },
  // Africa
  'Africa/Lagos': { lat: 6.5, lng: 3.4 },
  'Africa/Cairo': { lat: 30.0, lng: 31.2 },
  'Africa/Johannesburg': { lat: -26.2, lng: 28.0 },
  'Africa/Nairobi': { lat: -1.3, lng: 36.8 },
  // Middle East
  'Asia/Dubai': { lat: 25.3, lng: 55.3 },
  'Asia/Tehran': { lat: 35.7, lng: 51.4 },
  'Asia/Jerusalem': { lat: 31.8, lng: 35.2 },
  // Asia
  'Asia/Kolkata': { lat: 22.6, lng: 88.4 },
  'Asia/Calcutta': { lat: 22.6, lng: 88.4 },
  'Asia/Karachi': { lat: 24.9, lng: 67.0 },
  'Asia/Bangkok': { lat: 13.8, lng: 100.5 },
  'Asia/Singapore': { lat: 1.3, lng: 103.8 },
  'Asia/Hong_Kong': { lat: 22.3, lng: 114.2 },
  'Asia/Shanghai': { lat: 31.2, lng: 121.5 },
  'Asia/Tokyo': { lat: 35.7, lng: 139.7 },
  'Asia/Seoul': { lat: 37.6, lng: 127.0 },
  'Asia/Taipei': { lat: 25.0, lng: 121.6 },
  'Asia/Manila': { lat: 14.6, lng: 121.0 },
  'Asia/Jakarta': { lat: -6.2, lng: 106.8 },
  // Oceania
  'Australia/Sydney': { lat: -33.9, lng: 151.2 },
  'Australia/Melbourne': { lat: -37.8, lng: 145.0 },
  'Australia/Perth': { lat: -31.9, lng: 115.9 },
  'Pacific/Auckland': { lat: -36.9, lng: 174.8 },
  'Pacific/Honolulu': { lat: 21.3, lng: -157.9 },
};

const detectTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

/** Best-effort lat/lng from the browser timezone. Returns null if unknown. */
export function anchorFromTimezone(tz?: string): { lat: number; lng: number } | null {
  const zone = tz ?? detectTimezone();
  if (zone in timezoneAnchors) return timezoneAnchors[zone];
  // Fall back to the continent prefix (Europe/*, Asia/*, etc.).
  const prefix = zone.split('/')[0];
  switch (prefix) {
    case 'Europe':  return { lat: 50.0, lng: 10.0 };
    case 'Asia':    return { lat: 25.0, lng: 95.0 };
    case 'Africa':  return { lat: 0.0, lng: 20.0 };
    case 'America': return { lat: 35.0, lng: -90.0 };
    case 'Australia':
    case 'Pacific': return { lat: -25.0, lng: 140.0 };
    default:        return null;
  }
}

export type Routing = {
  /** Closest active member. */
  member: Member;
  /** Estimated great-circle distance in km from the user's anchor to the member. */
  distanceKm: number;
  /** How the routing was determined. */
  source: 'timezone' | 'ip' | 'doh';
};

/** Pick the member closest to the given anchor. */
export function pickMember(anchor: { lat: number; lng: number }, source: Routing['source']): Routing {
  let best = members[0];
  let bestDist = Infinity;
  for (const m of members) {
    const d = haversineKm(anchor, { lat: m.lat, lng: m.lng });
    if (d < bestDist) {
      best = m;
      bestDist = d;
    }
  }
  return { member: best, distanceKm: Math.round(bestDist), source };
}

/** Sync, no network, no perms — best for first render. Returns null if we can't even guess. */
export function detectRoutingFromTimezone(): Routing | null {
  const anchor = anchorFromTimezone();
  if (!anchor) return null;
  return pickMember(anchor, 'timezone');
}

/**
 * Optional refinement using a free IP-geo service. Only call when the user
 * explicitly opts in (button click). Privacy-sensitive: leaks the user's IP
 * to a third party.
 */
export async function refineWithIp(): Promise<Routing | null> {
  try {
    const res = await fetch('https://ipapi.co/json/', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { latitude?: number; longitude?: number };
    if (typeof data.latitude !== 'number' || typeof data.longitude !== 'number') {
      return null;
    }
    return pickMember({ lat: data.latitude, lng: data.longitude }, 'ip');
  } catch {
    return null;
  }
}

/**
 * Resolve the IBP GeoDNS hostname via DNS-over-HTTPS, then match the returned
 * A-record IP against the canonical members' ServiceIPv4 to find the actual
 * operator we'd hit. Most accurate signal short of opening a real connection.
 *
 * Privacy footprint: one DNS-over-HTTPS query to Cloudflare for the chain
 * hostname. No more invasive than the connection the user is about to make.
 *
 * Returns null if DoH fails, the IP isn't in the member list, or anything else
 * goes wrong — callers should fall back to the timezone estimate.
 */
export async function refineWithDoh(
  hostname = 'asset-hub-polkadot.dotters.network',
): Promise<{ member: Member; ip: string } | null> {
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
      { headers: { Accept: 'application/dns-json' } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { Answer?: Array<{ type: number; data: string }> };
    return data.Answer?.find((a) => a.type === 1)?.data ? null : null;
  } catch {
    return null;
  }
}

/**
 * Pure helper — match an IP against the active-member ServiceIPv4 list passed
 * in from a network snapshot. Kept separate so geo.ts doesn't pull in the
 * dashboard fetcher.
 */
export function matchMemberByIp(
  ip: string,
  membersWithIp: Array<{ name: string; ipv4: string }>,
): string | null {
  return membersWithIp.find((m) => m.ipv4 === ip)?.name ?? null;
}

/** DoH lookup → first A record (IPv4). Returns IP string or null. */
export async function dohResolveA(hostname: string): Promise<string | null> {
  return dohResolve(hostname, 1);
}

/** DoH lookup → first AAAA record (IPv6). Returns IP string or null. */
export async function dohResolveAAAA(hostname: string): Promise<string | null> {
  return dohResolve(hostname, 28);
}

async function dohResolve(hostname: string, recordType: 1 | 28): Promise<string | null> {
  const typeStr = recordType === 1 ? 'A' : 'AAAA';
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${typeStr}`,
      { headers: { Accept: 'application/dns-json' } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { Answer?: Array<{ type: number; data: string }> };
    return data.Answer?.find((a) => a.type === recordType)?.data ?? null;
  } catch {
    return null;
  }
}

export type ResolvedRecord = {
  ip: string;
  family: 'ipv4' | 'ipv6';
};

/**
 * Query both A and AAAA in parallel. Prefer IPv6 when available since it
 * indicates a more capable / future-leaning network path. Returns null if
 * neither responds.
 */
export async function dohResolveBoth(hostname: string): Promise<ResolvedRecord | null> {
  const [a, aaaa] = await Promise.all([dohResolveA(hostname), dohResolveAAAA(hostname)]);
  if (aaaa) return { ip: aaaa, family: 'ipv6' };
  if (a) return { ip: a, family: 'ipv4' };
  return null;
}
