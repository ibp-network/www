export const site = {
  name: 'IBP',
  fullName: "Infrastructure Builders' Programme",
  tagline: 'Decentralised, resilient, sustainable infrastructure for Polkadot and Kusama.',
  description:
    "Free public RPC for Polkadot: Asset Hub Polkadot first, then every parachain. Member-run, GeoDNS-routed, no API keys.",
  url: 'https://ibp.network',
  links: {
    wiki: 'https://wiki.ibp.network',
    github: 'https://github.com/ibp-network',
    matrix: 'https://matrix.to/#/!tNVRcjndUHhSDzCKFF:matrix.org',
    twitter: 'https://x.com/IBP_DOT',
    config: 'https://github.com/ibp-network/config',
    polkadotDocs: 'https://docs.polkadot.com',
    ibdash: 'https://ibdash.dotters.network',
  },
} as const;

/** Primary nav: every page reachable from the header. */
export const nav = [
  { label: 'Endpoints', href: '/endpoints' },
  { label: 'Build', href: '/build' },
  { label: 'Members', href: '/members' },
  { label: 'Operations', href: '/operations' },
  { label: 'Blog', href: '/blog' },
  { label: 'Contact', href: '/contact' },
] as const;

export const pillars = [
  {
    icon: 'i-mdi-earth',
    title: 'Decentralised',
    body: 'Operators on five continents. No single point of failure, no single jurisdiction.',
  },
  {
    icon: 'i-mdi-shield-check',
    title: 'Resilient',
    body: 'Redundant power, networking, and storage. Hardware owned by the operators who run it.',
  },
  {
    icon: 'i-mdi-leaf',
    title: 'Sustainable',
    body: 'Renewable-powered datacentres. Transparent, accountable, member-run.',
  },
] as const;
