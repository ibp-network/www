/**
 * Coordinate map for the home/map Globe component.
 *
 * Names + active status are the canonical source — `~/rotko/config/members_professional.json`
 * (fetched live by src/data/network.ts). Coordinates are NOT in the canonical
 * config (only IPv4 addresses are), so we keep a small local mapping here.
 *
 * When the upstream operator set changes, sync the list below to the active members
 * in members_professional.json. Names must match the `Details.Name` field
 * exactly so the Globe can join against canonical data if needed.
 */

export type Member = {
  name: string;
  region: string;
  country: string;
  city: string;
  lat: number;
  lng: number;
  website?: string;
  /** Static logo URL from the canonical config repo. Mirrored here so the
   * Globe markers can render their operator logo on initial mount without
   * waiting on the snapshot fetch. */
  logoUrl: string;
};

const L = 'https://raw.githubusercontent.com/ibp-network/config/main/assets/member-logos';

// Active IBP professional members (canonical config, May 2026 — n=7).
// `region` uses cloud-region-style codes (`asia-southeast`, `us-east`, etc.)
// rather than continent labels — terser, more operator-grade, and avoids the
// "is Ashburn North America or US East?" framing problem.
export const members: readonly Member[] = [
  { name: 'Amforc',         region: 'europe-west',     country: 'Switzerland', city: 'Zurich',    lat: 47.38, lng:   8.54, website: 'https://amforc.com',      logoUrl: `${L}/amforc.png` },
  { name: 'Dwellir',        region: 'africa-west',     country: 'Nigeria',     city: 'Lagos',     lat:  6.52, lng:   3.38, website: 'https://dwellir.com',     logoUrl: `${L}/dwellir.png` },
  { name: 'Gatotech',       region: 'america-central', country: 'Costa Rica',  city: 'San José',  lat:  9.93, lng: -84.08, website: 'https://gatotech.uk',     logoUrl: `${L}/gatotech.png` },
  { name: 'RadiumBlock',    region: 'asia-south',      country: 'India',       city: 'Bengaluru', lat: 12.97, lng:  77.59, website: 'https://radiumblock.com', logoUrl: `${L}/radiumblock.png` },
  { name: 'Rotko Networks', region: 'asia-southeast',  country: 'Thailand',    city: 'Bangkok',   lat: 13.76, lng: 100.50, website: 'https://rotko.net',       logoUrl: `${L}/rotko.png` },
  { name: 'Stake Plus',     region: 'us-east',         country: 'USA',         city: 'Ashburn',   lat: 39.04, lng: -77.49, website: 'https://stake.plus',      logoUrl: `${L}/stakeplus.png` },
  { name: 'Turboflakes',    region: 'europe-southwest',country: 'Portugal',    city: 'Lisbon',    lat: 38.72, lng:  -9.14, website: 'https://turboflakes.io',  logoUrl: `${L}/turboflakes.png` },
];

// Map a cloud-region-style code to a *real* continent. The old version
// did `region.split('-')[0]`, which counted `us-east` as a continent
// "us" separate from `america-central` → "america" — so an operator set that
// physically spans 4 continents (Europe, Africa, Asia, the Americas)
// over-reported as 5. We collapse every Americas code into one bucket
// so the "Continents" stat matches the map and reality.
const CONTINENT_BY_PREFIX: Record<string, string> = {
  europe: 'Europe',
  africa: 'Africa',
  asia: 'Asia',
  america: 'Americas',
  us: 'Americas',
  na: 'Americas',
  sa: 'Americas',
  oceania: 'Oceania',
  au: 'Oceania',
  antarctica: 'Antarctica',
};
const continentOf = (region: string): string => {
  const prefix = region.split('-')[0];
  return CONTINENT_BY_PREFIX[prefix] ?? prefix;
};

export const memberStats = {
  count: members.length,
  continents: new Set(members.map((m) => continentOf(m.region))).size,
  // Note: live request volume comes from the dashboard API (see useDashboardStats).
} as const;
