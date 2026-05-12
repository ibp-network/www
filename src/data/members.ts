/**
 * Coordinate map for the home/map Globe component.
 *
 * Names + active status are the canonical source — `~/rotko/config/members_professional.json`
 * (fetched live by src/data/network.ts). Coordinates are NOT in the canonical
 * config (only IPv4 addresses are), so we keep a small local mapping here.
 *
 * When the upstream roster changes, sync the list below to the active members
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
  { name: 'RadiumBlock',    region: 'asia-south',      country: 'India',       city: 'Bangalore', lat: 12.97, lng:  77.59, website: 'https://radiumblock.com', logoUrl: `${L}/radiumblock.png` },
  { name: 'Rotko Networks', region: 'asia-southeast',  country: 'Thailand',    city: 'Bangkok',   lat: 13.76, lng: 100.50, website: 'https://rotko.net',       logoUrl: `${L}/rotko.png` },
  { name: 'Stake Plus',     region: 'us-east',         country: 'USA',         city: 'Ashburn',   lat: 39.04, lng: -77.49, website: 'https://stake.plus',      logoUrl: `${L}/stakeplus.png` },
  { name: 'Turboflakes',    region: 'europe-southwest',country: 'Portugal',    city: 'Lisbon',    lat: 38.72, lng:  -9.14, website: 'https://turboflakes.io',  logoUrl: `${L}/turboflakes.png` },
];

// Continent count derives from the region-code prefix (`europe-west` →
// `europe`) so the "Continents" stat still reads 5, not 7-distinct-codes.
const continentOf = (region: string): string => region.split('-')[0];

export const memberStats = {
  count: members.length,
  continents: new Set(members.map((m) => continentOf(m.region))).size,
  // Note: live request volume comes from the dashboard API (see useDashboardStats).
} as const;
