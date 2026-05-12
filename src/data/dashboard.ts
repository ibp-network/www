/**
 * Live stats from the IBP GeoDNS dashboard API. Public endpoints — no auth.
 * Source of truth: ibdash.dotters.network. See dashboard /api source at
 * /steam/rotko/ibp/ibp-geodns-dashboard/src/components/ApiHelper/ApiHelper.js.
 *
 * Strategy: createResource singleton, 1-minute stale-while-revalidate.
 * Failures degrade silently — the home page renders proposal-derived fallbacks.
 */

import { createResource, type Resource } from 'solid-js';

// Same-origin proxy in front of `https://ibdash.dotters.network:9000/api`.
// Redbean's `OnHttpRequest` caches each `(path + query)` for one hour so a
// busy visit doesn't bombard ibdash. See `public/.init.lua → serveIbdashApi`.
// In dev (Vite middleware), the proxy isn't there — fall back to the direct
// upstream by sniffing the build mode.
const API_BASE = import.meta.env.DEV
  ? 'https://ibdash.dotters.network:9000/api'
  : '/api/ibdash';

export type RequestsSummary = {
  total_requests: number;
  unique_asns: number;
  unique_countries: number;
  unique_domains: number;
  unique_members: number;
  start_date: string;
  end_date: string;
};

export type ServicesSummary = {
  active_services: number;
  total_services: number;
  relay_chains: number;
  network_types: { Community: number; Relay: number; System: number };
  service_types: { RPC: number; ETHRPC: number };
  total_resources: {
    nodes: number;
    cores: number;
    memory: number;
    disk: number;
    bandwidth: number;
  };
};

export type DashboardStats = {
  last24h: RequestsSummary | null;
  last30d: RequestsSummary | null;
  services: ServicesSummary | null;
  fetchedAt: number;
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function fetchDashboardStats(): Promise<DashboardStats> {
  const today = new Date();
  const d1 = new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000);
  const d30 = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const settle = async <T>(p: Promise<T>): Promise<T | null> =>
    p.then((v) => v).catch(() => null);

  const [last24h, last30d, services] = await Promise.all([
    settle(fetchJson<RequestsSummary>(`${API_BASE}/requests/summary?start=${ymd(d1)}&end=${ymd(today)}`)),
    settle(fetchJson<RequestsSummary>(`${API_BASE}/requests/summary?start=${ymd(d30)}&end=${ymd(today)}`)),
    settle(fetchJson<ServicesSummary>(`${API_BASE}/services/summary`)),
  ]);

  return { last24h, last30d, services, fetchedAt: Date.now() };
}

let cached: Resource<DashboardStats> | null = null;

export function useDashboardStats(): Resource<DashboardStats> {
  if (!cached) {
    const [resource] = createResource(fetchDashboardStats);
    cached = resource;
  }
  return cached;
}

export type CountryRequestsRow = {
  /** ISO-3166 alpha-2 (e.g. "US"). */
  code: string;
  /** Pretty country name as returned by the API. */
  name: string;
  /** Aggregated request count over the window. */
  requests: number;
};

export type CountryRequests = {
  /** Sorted descending by request count. */
  rows: CountryRequestsRow[];
  /** Sum across all countries — useful for "% of total" computations. */
  grandTotal: number;
  /** Highest single-country total — useful for log/linear scale normalisation. */
  max: number;
  /** Window size used, in days. */
  windowDays: number;
};

type RawCountryRow = {
  date: string;
  country: string;
  country_name: string;
  requests: number;
};

async function fetchCountryRequests(days = 30): Promise<CountryRequests> {
  const today = new Date();
  const start = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
  const url = `${API_BASE}/requests/country?start=${ymd(start)}&end=${ymd(today)}`;
  const raw = await fetchJson<RawCountryRow[]>(url);
  const byCode = new Map<string, CountryRequestsRow>();
  let grandTotal = 0;
  for (const r of raw) {
    if (!r?.country || !Number.isFinite(r.requests)) continue;
    const existing = byCode.get(r.country);
    if (existing) existing.requests += r.requests;
    else byCode.set(r.country, { code: r.country, name: r.country_name, requests: r.requests });
    grandTotal += r.requests;
  }
  const rows = [...byCode.values()].sort((a, b) => b.requests - a.requests);
  const max = rows[0]?.requests ?? 0;
  return { rows, grandTotal, max, windowDays: days };
}

let cachedCountryRequests: Resource<CountryRequests> | null = null;

/**
 * 30-day per-country request totals. Singleton — shared across all views.
 * Aggregated client-side from the dashboard's daily breakdown so we can use
 * the same response for the country bubble layer on the service map.
 */
export function useCountryRequests(): Resource<CountryRequests> {
  if (!cachedCountryRequests) {
    const [resource] = createResource(() => fetchCountryRequests(30));
    cachedCountryRequests = resource;
  }
  return cachedCountryRequests;
}

export type MemberRequests = {
  /** Per-member 30-day totals, keyed by canonical member name. */
  totals: Map<string, number>;
  /** Sum across members — convenient for "share of total" computations. */
  grandTotal: number;
  /** Highest single-member total — useful for relative-bar visualisations. */
  max: number;
  windowDays: number;
};

type RawMemberRow = { date: string; member: string; requests: number };

async function fetchMemberRequests(days = 30): Promise<MemberRequests> {
  const today = new Date();
  const start = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
  const url = `${API_BASE}/requests/member?start=${ymd(start)}&end=${ymd(today)}`;
  const rows = await fetchJson<RawMemberRow[]>(url);
  const totals = new Map<string, number>();
  let grandTotal = 0;
  let max = 0;
  for (const r of rows) {
    if (!r?.member || !Number.isFinite(r.requests)) continue;
    const next = (totals.get(r.member) ?? 0) + r.requests;
    totals.set(r.member, next);
    grandTotal += r.requests;
    if (next > max) max = next;
  }
  return { totals, grandTotal, max, windowDays: days };
}

let cachedMemberRequests: Resource<MemberRequests> | null = null;

/**
 * 30-day per-member request totals. Singleton — shared across all views.
 * Surfaced inside the service-map node-card so a visitor hovering a pin sees
 * not just where the operator is but how much of the IBP traffic it's
 * actually serving over the past month.
 */
export function useMemberRequests(): Resource<MemberRequests> {
  if (!cachedMemberRequests) {
    const [resource] = createResource(() => fetchMemberRequests(30));
    cachedMemberRequests = resource;
  }
  return cachedMemberRequests;
}

export type RouteEdge = {
  country: string;     // ISO-3166 alpha-2
  countryName: string;
  member: string;      // canonical member name
  requests: number;
};

export type CountryRouting = {
  edges: RouteEdge[];  // sorted descending by request count
  max: number;
  windowDays: number;
};

/**
 * (country × member) request volumes for the past `days`. Built from
 * the cross-tabbed `/api/requests/country?member=X` endpoint, one call per
 * known operator. The ibdash dashboard's public helper doesn't surface this
 * cross-tab; we discovered it by probing the query-param surface.
 *
 * Used by the globe traffic-flow animation: each edge becomes one arc from
 * the country centroid to the operator pin, stroke / brightness scaled to
 * the request count.
 */
async function fetchCountryRouting(members: readonly string[], days = 30): Promise<CountryRouting> {
  const today = new Date();
  const start = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
  const startStr = ymd(start);
  const endStr = ymd(today);
  const fetchOne = async (member: string): Promise<RouteEdge[]> => {
    const url = `${API_BASE}/requests/country?start=${startStr}&end=${endStr}&member=${encodeURIComponent(member)}`;
    let raw: RawCountryRow[];
    try {
      raw = await fetchJson<RawCountryRow[]>(url);
    } catch {
      return [];
    }
    const totals = new Map<string, RouteEdge>();
    for (const r of raw) {
      if (!r?.country || !Number.isFinite(r.requests)) continue;
      const e = totals.get(r.country);
      if (e) e.requests += r.requests;
      else totals.set(r.country, { country: r.country, countryName: r.country_name, member, requests: r.requests });
    }
    return [...totals.values()];
  };
  const lists = await Promise.all(members.map(fetchOne));
  const edges = lists.flat().sort((a, b) => b.requests - a.requests);
  const max = edges[0]?.requests ?? 0;
  return { edges, max, windowDays: days };
}

let cachedCountryRouting: Resource<CountryRouting> | null = null;

/**
 * GeoDNS routing snapshot for the last 30 days, as a list of (country →
 * member) edges with request counts. Singleton; shared across views.
 *
 * `members` argument should be a stable list — we use it to fan out one
 * API call per operator. Pass the live snapshot's member names if you want
 * to follow roster changes automatically.
 */
export function useCountryRouting(members: () => readonly string[]): Resource<CountryRouting> {
  if (!cachedCountryRouting) {
    const [resource] = createResource(
      () => {
        const list = members();
        return list.length ? list.slice().sort() : null;
      },
      (list) => fetchCountryRouting(list ?? [], 30),
    );
    cachedCountryRouting = resource;
  }
  return cachedCountryRouting;
}

/** Compact number formatter — 14_703_879 → "14.7M". */
export function compactNumber(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (abs >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}
