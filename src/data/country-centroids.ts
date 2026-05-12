/**
 * ISO-3166 alpha-2 → geographic centroid (rough city-anchor lat/lng).
 *
 * Used by ServiceMap2D to position per-country request-volume bubbles on the
 * dot-mosaic world map. Source is the same equirectangular projection used
 * for operator pins, so bubbles align with continents.
 *
 * Coverage: every country that has shown up in the IBP `/requests/country`
 * endpoint over the last several months. If a request lands from an ISO
 * code we don't have here, the bubble silently drops (we don't fabricate a
 * position). Adding a new code is a one-line change.
 */

export const countryCentroid: Record<string, { lat: number; lng: number }> = {
  // Americas
  US: { lat: 39.8, lng: -98.6 },
  CA: { lat: 56.1, lng: -106.3 },
  MX: { lat: 23.6, lng: -102.5 },
  BR: { lat: -14.2, lng: -51.9 },
  AR: { lat: -38.4, lng: -63.6 },
  CL: { lat: -35.7, lng: -71.5 },
  CO: { lat: 4.6, lng: -74.3 },
  PE: { lat: -9.2, lng: -75.0 },
  VE: { lat: 6.4, lng: -66.6 },
  EC: { lat: -1.8, lng: -78.2 },
  UY: { lat: -32.5, lng: -55.8 },
  CR: { lat: 9.7, lng: -83.8 },
  PA: { lat: 8.5, lng: -80.8 },
  PR: { lat: 18.2, lng: -66.6 },

  // Europe
  GB: { lat: 55.4, lng: -3.4 },
  IE: { lat: 53.1, lng: -8.2 },
  FR: { lat: 46.2, lng: 2.2 },
  DE: { lat: 51.2, lng: 10.4 },
  NL: { lat: 52.1, lng: 5.3 },
  BE: { lat: 50.5, lng: 4.5 },
  LU: { lat: 49.8, lng: 6.1 },
  CH: { lat: 46.8, lng: 8.2 },
  AT: { lat: 47.5, lng: 14.6 },
  IT: { lat: 41.9, lng: 12.6 },
  ES: { lat: 40.5, lng: -3.7 },
  PT: { lat: 39.4, lng: -8.2 },
  DK: { lat: 56.3, lng: 9.5 },
  SE: { lat: 60.1, lng: 18.6 },
  NO: { lat: 60.5, lng: 8.5 },
  FI: { lat: 61.9, lng: 25.7 },
  IS: { lat: 64.9, lng: -19.0 },
  PL: { lat: 51.9, lng: 19.1 },
  CZ: { lat: 49.8, lng: 15.5 },
  SK: { lat: 48.7, lng: 19.7 },
  HU: { lat: 47.2, lng: 19.5 },
  RO: { lat: 45.9, lng: 25.0 },
  BG: { lat: 42.7, lng: 25.5 },
  GR: { lat: 39.1, lng: 21.8 },
  HR: { lat: 45.1, lng: 15.2 },
  RS: { lat: 44.0, lng: 21.0 },
  SI: { lat: 46.2, lng: 14.8 },
  EE: { lat: 58.6, lng: 25.0 },
  LV: { lat: 56.9, lng: 24.6 },
  LT: { lat: 55.2, lng: 23.9 },
  UA: { lat: 48.4, lng: 31.2 },
  BY: { lat: 53.7, lng: 27.9 },
  RU: { lat: 61.5, lng: 105.3 },
  MD: { lat: 47.4, lng: 28.4 },
  TR: { lat: 39.0, lng: 35.2 },
  MT: { lat: 35.9, lng: 14.4 },
  CY: { lat: 35.1, lng: 33.4 },

  // Asia
  CN: { lat: 35.9, lng: 104.2 },
  HK: { lat: 22.3, lng: 114.2 },
  TW: { lat: 23.7, lng: 121.0 },
  JP: { lat: 36.2, lng: 138.3 },
  KR: { lat: 35.9, lng: 127.8 },
  IN: { lat: 20.6, lng: 78.9 },
  PK: { lat: 30.4, lng: 69.3 },
  BD: { lat: 23.7, lng: 90.4 },
  LK: { lat: 7.9, lng: 80.8 },
  NP: { lat: 28.4, lng: 84.1 },
  TH: { lat: 15.9, lng: 100.9 },
  VN: { lat: 14.1, lng: 108.3 },
  MY: { lat: 4.2, lng: 101.9 },
  SG: { lat: 1.4, lng: 103.8 },
  ID: { lat: -0.8, lng: 113.9 },
  PH: { lat: 12.9, lng: 121.8 },
  KH: { lat: 12.6, lng: 104.9 },
  LA: { lat: 19.9, lng: 102.5 },
  MM: { lat: 21.9, lng: 95.9 },
  KZ: { lat: 48.0, lng: 66.9 },
  UZ: { lat: 41.4, lng: 64.6 },
  AE: { lat: 23.4, lng: 53.8 },
  SA: { lat: 23.9, lng: 45.1 },
  IL: { lat: 31.0, lng: 34.9 },
  IR: { lat: 32.4, lng: 53.7 },
  IQ: { lat: 33.2, lng: 43.7 },

  // Africa
  ZA: { lat: -30.6, lng: 22.9 },
  EG: { lat: 26.8, lng: 30.8 },
  MA: { lat: 31.8, lng: -7.1 },
  NG: { lat: 9.1, lng: 8.7 },
  KE: { lat: -0.0, lng: 37.9 },
  GH: { lat: 7.9, lng: -1.0 },
  TN: { lat: 33.9, lng: 9.5 },
  DZ: { lat: 28.0, lng: 1.7 },
  ET: { lat: 9.1, lng: 40.5 },
  UG: { lat: 1.4, lng: 32.3 },

  // Oceania
  AU: { lat: -25.3, lng: 133.8 },
  NZ: { lat: -40.9, lng: 174.9 },
};
