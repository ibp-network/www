/**
 * Canonical IBP network data — fetched live from github.com/ibp-network/config.
 *
 * Why fetch instead of bundle: the config repo is the upstream source of truth
 * for chain coverage, RPC URLs, and bootnode addresses. Bundling would freeze
 * the site to whatever commit was current at build time. Operator changes
 * (new chain, member offboarding, new bootnode) need to be reflected without
 * a redeploy.
 *
 * Strategy: stale-while-revalidate via localStorage. On a return visit, the
 * cached snapshot renders synchronously; a background fetch updates it. On
 * first visit, the resource resolves once GitHub raw responds. If GitHub is
 * unreachable AND there's no cache, the page surfaces an empty state.
 */

import { createResource, type Resource } from 'solid-js';

/* ─────────────────── Types ─────────────────── */

export type NetworkType = 'Relay' | 'System' | 'Community';
export type ServiceType = 'RPC' | 'ETHRPC';
export type ProviderKey = 'Dotters' | 'Ibp';

export type ProviderUrls = {
  /** Primary subdomain URL, e.g. wss://asset-hub-polkadot.dotters.network */
  subdomain: string;
  /** Pool-routed subpath URL, e.g. wss://sys.dotters.network/asset-hub-polkadot. */
  subpath?: string;
};

export type Network = {
  id: string;
  commandId: string;
  displayName: string;
  description: string;
  logoUrl: string;
  websiteUrl: string;
  type: NetworkType;
  serviceType: ServiceType;
  relay: string;
  ecosystem: 'polkadot' | 'kusama' | 'paseo';
  providers: Record<ProviderKey, ProviderUrls>;
  /** GitHub web URL for the chain spec JSON, when available in paritytech/chainspecs. */
  chainSpecUrl?: string;
  /** Raw URL for the chain spec — what you'd pass to `--chain`. */
  chainSpecRawUrl?: string;
  /** Ecosystem app / docs site for chains where the canonical reference lives
   * outside Polkadot's main domain (e.g. Coretime → regionx.tech). */
  infoUrl?: string;
};

export type Bootnode = {
  member: string;
  multiaddr: string;
  transport: 'tcp' | 'wss';
};

export type Member = {
  name: string;
  level: number;
  website: string;
  logoUrl: string;
  /** Public ServiceIPv4 from the canonical config. Used for DoH A-record
   * matching AND as the target of the browser-side latency probe. */
  ipv4?: string;
  /** Public ServiceIPv6 from the canonical config — used to match DoH AAAA-records. */
  ipv6?: string;
  /** Geo position from the canonical config — used to project on the world map. */
  lat?: number;
  lon?: number;
  region?: string;
};

export type NetworkSnapshot = {
  networks: Network[];
  members: Member[];
  bootnodesByChain: Record<string, Bootnode[]>;
  fetchedAt: number;
};

/* ─────────────────── Constants ─────────────────── */

// Served same-origin by configMirrorPlugin (see vite.config.ts), which mirrors
// the canonical config from github.com/ibp-network/config at build time. No
// cross-origin TLS handshake on every visit; redbean caches it.
const CONFIG_BASE = '/data';

// Bumped cache key so any old 1h-cached snapshot on a returning visitor is
// invalidated immediately — last cycle's offboarded parachains were sticking
// around in stale snapshots after the config repo was updated.
const CACHE_KEY = 'ibp:network-snapshot:v2';
// 5 minutes. The canonical config repo is the source of truth; if an operator
// pushes Active=0 or an operator-set change there, the site should reflect it within
// minutes, not an hour. GitHub raw is cheap to hit twice per hour worst-case.
const CACHE_TTL_MS = 5 * 60 * 1000;

const memberKeyAliases: Record<string, string> = {
  amforc: 'Amforc',
  dwellir: 'Dwellir',
  gatotech: 'Gatotech',
  radiumblock: 'RadiumBlock',
  rotko: 'Rotko Networks',
  stakeplus: 'Stake Plus',
  turboflakes: 'Turboflakes',
};

// Inverted alias map for member-name → config-key resolution. Pre-built
// at module load so the snapshot fetcher doesn't redo Object.entries +
// linear scan per member on every fresh load (was O(members × aliases),
// now O(1) lookup).
const memberNameToKey: Record<string, string> = Object.fromEntries(
  Object.entries(memberKeyAliases).map(([k, v]) => [v, k]),
);

// Chain-id-prefix → chainspec-repo-folder mapping. The `inRepo` field
// is which (ecosystem, parachain) pairs paritytech/chainspecs actually
// carries a JSON file for — Coretime-Polkadot and People-Polkadot are
// live chains we route to, but the chainspecs repo doesn't have their
// JSON yet, so we can't link to it (clicking would 404).
//
// Hoisted out of chainSpecPath() so the literal isn't reallocated on
// every parseNetworks iteration.
const CHAINSPEC_FOLDERS: Record<string, { folder: string; inRepo: Network['ecosystem'][] }> = {
  'asset-hub':  { folder: 'asset-hub',  inRepo: ['polkadot', 'kusama', 'paseo'] },
  'bridge-hub': { folder: 'bridge-hub', inRepo: ['polkadot', 'kusama', 'paseo'] },
  collectives:  { folder: 'collectives', inRepo: ['polkadot', 'paseo'] },
  coretime:     { folder: 'coretime',    inRepo: ['kusama', 'paseo'] },
  people:       { folder: 'people',      inRepo: ['kusama', 'paseo'] },
  encointer:    { folder: 'encointer',   inRepo: ['kusama'] },
  hydration:    { folder: 'hydradx',     inRepo: ['polkadot'] }, // repo uses old name
};
const CHAINSPEC_KEYS = Object.keys(CHAINSPEC_FOLDERS);

/* ─────────────────── Parsers ─────────────────── */

type RawMember = {
  Details: { Name: string; Website: string; Logo: string };
  Membership: { MemberLevel: number };
  Service: {
    Active: 0 | 1;
    ServiceIPv4?: string;
    ServiceIPv6?: string;
    MonitorUrl?: string;
  };
  Location?: { Region?: string; Latitude?: number; Longitude?: number };
};

type RawNetwork = {
  Configuration: {
    Name: string;
    ServiceType: string;
    Active: 0 | 1;
    NetworkType: NetworkType;
    RelayNetwork: string;
    DisplayName: string;
    Description: string;
    WebsiteURL: string;
    LogoURL: string;
  };
  Providers: Partial<Record<ProviderKey, { RpcUrls: string[] }>>;
};

type RawBootnodeChain = {
  commandId: string;
  members: Record<string, string[]>;
};

function parseMembers(raw: Record<string, RawMember>): Member[] {
  return Object.values(raw)
    .filter((m) => m?.Service?.Active === 1)
    .map((m) => ({
      name: m.Details.Name,
      level: m.Membership.MemberLevel,
      website: m.Details.Website,
      logoUrl: m.Details.Logo,
      ipv4: m.Service.ServiceIPv4 || undefined,
      ipv6: m.Service.ServiceIPv6 || undefined,
      lat: m.Location?.Latitude,
      lon: m.Location?.Longitude,
      region: m.Location?.Region,
    }));
}

function splitProviderUrls(rpcUrls: string[] | undefined): ProviderUrls {
  if (!rpcUrls || rpcUrls.length === 0) return { subdomain: '' };
  // Subdomain URL: chain id as the *first* host label.
  const subdomain =
    rpcUrls.find((u) =>
      /^[a-z]+s?:\/\/[a-z0-9-]+\.(dotters|ibp)\.network\/?$/i.test(u),
    ) ?? rpcUrls[0];
  // Subpath URL: routed through rpc.* / sys.* / para.*.
  const subpath = rpcUrls.find((u) =>
    /\/(rpc|sys|para)\.(dotters|ibp)\.network\//i.test(u),
  );
  return { subdomain, ...(subpath ? { subpath } : {}) };
}

/**
 * Map a chain id to its path inside paritytech/chainspecs. Returns null when
 * the repo doesn't have a spec for that chain yet (e.g. Polkadot Coretime /
 * People — newer chains not yet in the repo).
 */
function chainSpecPath(id: string, ecosystem: Network['ecosystem'], type: NetworkType): string | null {
  // Relay chains use the same file name across ecosystems.
  if (type === 'Relay') return `${ecosystem}/relaychain/chainspec.json`;

  // For everything else we map by chain-name prefix.
  // The repo uses dash-less, snake-style folder names ("asset-hub", "bridge-hub",
  // "people", "coretime", "encointer", "collectives", "hydradx").
  const base = `${ecosystem}/parachain`;
  const lc = id.toLowerCase();

  for (const key of CHAINSPEC_KEYS) {
    if (lc.startsWith(key)) {
      const entry = CHAINSPEC_FOLDERS[key];
      if (!entry.inRepo.includes(ecosystem)) return null;
      return `${base}/${entry.folder}/chainspec.json`;
    }
  }
  return null;
}

function ecosystemOf(raw: RawNetwork, id: string): Network['ecosystem'] {
  const relay = raw.Configuration.RelayNetwork || raw.Configuration.Name;
  const r = relay.toLowerCase();
  if (r.includes('kusama')) return 'kusama';
  if (r.includes('paseo')) return 'paseo';
  if (r.includes('polkadot') || id.toLowerCase().includes('polkadot'))
    return 'polkadot';
  return 'polkadot';
}

/**
 * Chain-specific short blurbs that override the canonical config's
 * boilerplate (which copies the same Polkadot summary onto every chain).
 * Keys match the id from services_rpc.json.
 */
const chainBlurb: Record<string, string> = {
  'Asset-Hub-Polkadot':   'The Polkadot consumer chain. Balances, native assets, NFTs, and DOT/USDT/USDC live here.',
  'Asset-Hub-Kusama':     'Kusama Asset Hub. Native assets, NFTs, KSM balances.',
  'Asset-Hub-Paseo':      'Asset Hub on the Paseo testnet.',
  'Polkadot':             'Polkadot relay chain. Validators and cross-chain consensus only; most user flows happen on Asset Hub.',
  'Kusama':               "Polkadot's canary relay chain. Validators and cross-chain consensus only.",
  'Paseo':                'Community-run Polkadot testnet. Relay chain.',
  'Bridge-Hub-Polkadot':  'Cross-chain bridge messages on Polkadot.',
  'Bridge-Hub-Kusama':    'Cross-chain bridge messages on Kusama.',
  'Bridge-Hub-Paseo':     'Bridge hub on the Paseo testnet.',
  'Collectives-Polkadot': 'Fellowship, Ambassadors and other on-chain collectives.',
  'Collectives-Paseo':    'Collectives on the Paseo testnet.',
  'Coretime-Polkadot':    'Coretime sales and assignments. RegionX is the canonical ecosystem app for buying, splitting, and reassigning cores.',
  'Coretime-Kusama':      'Coretime on Kusama. RegionX covers Kusama too.',
  'Coretime-Paseo':       'Coretime on the Paseo testnet.',
  'People-Polkadot':      'On-chain identity registry for Polkadot.',
  'People-Kusama':        'On-chain identity registry for Kusama.',
  'People-Paseo':         'On-chain identity on the Paseo testnet.',
  'Encointer-Kusama':     "Local communities and people's currencies.",
  'ETH-Asset-Hub-Polkadot': 'EVM-compatible RPC on Asset Hub Polkadot. Works with MetaMask, viem, ethers.js — anything that speaks Ethereum JSON-RPC.',
  'ETH-Asset-Hub-Kusama':   'EVM-compatible RPC on Asset Hub Kusama. Works with MetaMask, viem, ethers.js.',
  'ETH-Asset-Hub-Paseo':    'EVM-compatible RPC on Asset Hub Paseo (testnet). Works with MetaMask, viem, ethers.js.',
  'ETH-PAsset-Hub-Paseo':   'EVM-compatible parachain RPC on Paseo.',
  'ETH-Statemine':          'EVM-compatible RPC on Statemine (Kusama Asset Hub legacy).',
  'ETH-RPC':                'Public EVM-compatible RPC entry point.',
  'ETH-Passet-Hub':         'EVM-compatible parachain RPC.',
  'PAsset-Hub-Paseo':       'Parachain Asset Hub on Paseo.',
  // Community parachains — leave the canonical description.
};

/**
 * Within each ecosystem, surface Asset Hub before other system chains, then
 * community parachains, and put the relay chain last — consumers almost
 * never want the relay directly; it's only for validators. The relay-chain
 * card carries a "Validators only" badge and is separated in the UI.
 */
function sortOrder(n: Network): number {
  if (n.id.startsWith('Asset-Hub')) return 0;
  if (n.id.startsWith('ETH-Asset-Hub')) return 1;
  if (n.type === 'System') return 2;
  if (n.type === 'Community') return 3;
  if (n.type === 'Relay') return 4;
  return 5;
}

/**
 * Per-chain ecosystem-app links. Surfaced as "Learn more →" on the endpoint
 * card so consumers can reach the canonical reference for a chain that lives
 * outside Polkadot's main domain.
 */
const ecosystemApp: Record<string, string> = {
  'Coretime-Polkadot': 'https://www.regionx.tech/',
  'Coretime-Kusama':   'https://www.regionx.tech/',
};

function parseNetworks(raw: Record<string, RawNetwork>): Network[] {
  return Object.entries(raw)
    .filter(([, n]) => n.Configuration.Active === 1)
    .map(([id, n]): Network => {
      const eco = ecosystemOf(n, id);
      const specPath = chainSpecPath(id, eco, n.Configuration.NetworkType);
      return {
        id,
        commandId: id.toLowerCase(),
        displayName: n.Configuration.DisplayName,
        description: chainBlurb[id] ?? n.Configuration.Description,
        logoUrl: n.Configuration.LogoURL,
        websiteUrl: n.Configuration.WebsiteURL,
        type: n.Configuration.NetworkType,
        serviceType:
          n.Configuration.ServiceType === 'ETHRPC' ? 'ETHRPC' : 'RPC',
        relay: n.Configuration.RelayNetwork,
        ecosystem: eco,
        providers: {
          Dotters: splitProviderUrls(n.Providers.Dotters?.RpcUrls),
          Ibp: splitProviderUrls(n.Providers.Ibp?.RpcUrls),
        },
        infoUrl: ecosystemApp[id],
        chainSpecUrl: specPath
          ? `https://github.com/paritytech/chainspecs/blob/main/${specPath}`
          : undefined,
        chainSpecRawUrl: specPath
          ? `https://raw.githubusercontent.com/paritytech/chainspecs/main/${specPath}`
          : undefined,
      };
    })
    .sort((a, b) => {
      const ord = sortOrder(a) - sortOrder(b);
      if (ord !== 0) return ord;
      return a.displayName.localeCompare(b.displayName);
    });
}

function transportOf(m: string): 'tcp' | 'wss' {
  return m.includes('/wss/') ? 'wss' : 'tcp';
}

function memberDisplayName(key: string): string {
  return memberKeyAliases[key] ?? key.replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseBootnodes(
  raw: Record<string, RawBootnodeChain>,
  activeMemberKeys: Set<string>,
): Record<string, Bootnode[]> {
  const out: Record<string, Bootnode[]> = {};
  for (const [chain, entry] of Object.entries(raw)) {
    if (!entry?.members) continue;
    const list: Bootnode[] = [];
    for (const [key, addrs] of Object.entries(entry.members)) {
      if (!activeMemberKeys.has(key)) continue;
      for (const raw of addrs) {
        const multiaddr = raw.startsWith('/') ? raw : `/${raw}`;
        list.push({
          member: memberDisplayName(key),
          multiaddr,
          transport: transportOf(multiaddr),
        });
      }
    }
    list.sort(
      (a, b) =>
        a.member.localeCompare(b.member) || a.transport.localeCompare(b.transport),
    );
    out[chain] = list;
  }
  return out;
}

/* ─────────────────── Fetcher ─────────────────── */

async function fetchSnapshot(): Promise<NetworkSnapshot> {
  const [servicesRaw, bootnodesRaw, membersRaw] = await Promise.all([
    fetch(`${CONFIG_BASE}/services_rpc.json`).then((r) => {
      if (!r.ok) throw new Error(`services_rpc.json: ${r.status}`);
      return r.json();
    }),
    fetch(`${CONFIG_BASE}/bootnodes.json`).then((r) => {
      if (!r.ok) throw new Error(`bootnodes.json: ${r.status}`);
      return r.json();
    }),
    fetch(`${CONFIG_BASE}/members_professional.json`).then((r) => {
      if (!r.ok) throw new Error(`members_professional.json: ${r.status}`);
      return r.json();
    }),
  ]);

  const members = parseMembers(membersRaw);
  const networks = parseNetworks(servicesRaw);

  const activeMemberKeys = new Set(
    members.map(
      (m) => memberNameToKey[m.name] ?? m.name.toLowerCase().replace(/\s+/g, ''),
    ),
  );

  const bootnodesByChain = parseBootnodes(bootnodesRaw, activeMemberKeys);

  return { networks, members, bootnodesByChain, fetchedAt: Date.now() };
}

/* ─────────────────── Cache ─────────────────── */

function readCache(): NetworkSnapshot | null {
  try {
    const raw = typeof localStorage !== 'undefined' && localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NetworkSnapshot;
    if (!parsed?.networks || !parsed?.fetchedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(snap: NetworkSnapshot): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(CACHE_KEY, JSON.stringify(snap));
  } catch {
    /* quota, etc. — non-fatal */
  }
}

/* ─────────────────── Resource ─────────────────── */

// Captured at first use of the resource. The stale-while-revalidate path
// calls this with the fresh snapshot so subscribers re-render with the new
// data instead of being stuck on whatever was in localStorage at page load.
let mutateSnapshot: ((s: NetworkSnapshot) => void) | null = null;

async function loadSnapshot(): Promise<NetworkSnapshot> {
  const cached = readCache();
  const fresh = cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS;
  if (fresh) {
    void fetchSnapshot()
      .then((snap) => {
        writeCache(snap);
        mutateSnapshot?.(snap);
      })
      .catch(() => {});
    return cached;
  }
  try {
    const snap = await fetchSnapshot();
    writeCache(snap);
    return snap;
  } catch (e) {
    if (cached) return cached;
    throw e;
  }
}

let cachedResource: Resource<NetworkSnapshot> | null = null;

/** Solid resource for the live network snapshot. Singleton — shared across pages. */
export function useNetworkSnapshot(): Resource<NetworkSnapshot> {
  if (!cachedResource) {
    const [resource, { mutate }] = createResource(loadSnapshot);
    mutateSnapshot = mutate;
    cachedResource = resource;
  }
  return cachedResource;
}

/* ─────────────────── Display helpers ─────────────────── */

export const ecosystemLabel: Record<Network['ecosystem'], string> = {
  polkadot: 'Polkadot',
  kusama: 'Kusama',
  paseo: 'Paseo (testnet)',
};

export const typeLabel: Record<NetworkType, string> = {
  Relay: 'Relay chain',
  System: 'System chain',
  Community: 'Community parachain',
};
