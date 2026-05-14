---
sidebar_position: 2
title: Operations
---

# Operations

The programme is funded by Polkadot and Kusama treasury bounties and run by a curator multisig.

## Funding

| Funded by | Proposal | Year |
| --- | --- | --- |
| Kusama treasury | [Referendum 35](https://kusama.polkassembly.io/referenda/35) | 2022 |
| Polkadot treasury | [Referendum 649](https://polkadot.polkassembly.io/referenda/649) | 2024 |
| Polkadot top-up | [Referendum 1516](https://polkadot.subsquare.io/referenda/1516) | 2025 |
| Polkadot top-up (in discussion) | [Subsquare #443](https://polkadot.subsquare.io/posts/443) | 2026 |

Bounty funds flow to members as **child-bounties**, one per member per period. The curator multisig is a 3-of-5 that signs each release after reviewing operator reports.

## Governance

- **Curator multisig (3-of-5)** approves child-bounty releases. **The curators are not the operators**; they're appointed via the on-chain bounty mechanism and sit independently of the membership. This separation is the trust-model load-bearing piece: operators can't pay themselves.
- **Members propose, curators ratify.** Operators bring proposals (membership changes, funding cycles, service rotation) to the curators once internal consensus has formed in the members' meeting. The multisig signs releases only after the prior cycle's report passes review.
- **Curators rotate**; the active set is maintained on-chain via the bounty's curator slot.
- **No staged tier of membership.** All active members operate at the same service level. Earlier "milestone" progressions used during the 2022-2023 cycle are no longer in use.

## Members

__IBP_MEMBER_COUNT__ active operators: __IBP_MEMBERS_WITH_COUNTRY__. Matrix handles, per-chain assignments, and public ServiceIPv4/IPv6 lookups live in [`ibp-network/config/members_professional.json`](https://github.com/ibp-network/config/blob/main/members_professional.json), which this page renders from at build time.

## DNS infrastructure

The two GeoDNS pools take different approaches to their authoritative DNS, and that's deliberate — keeping the routing layer itself unconcentrated is part of the design.

| Pool | Authoritative NS | Operator |
| --- | --- | --- |
| `ibp.network` | `gns21-24.cloudns.net` | Gatotech, via [ClouDNS](https://www.cloudns.net/) (commercial GeoDNS-as-a-service) |
| `dotters.network` | `dns-01..05.dotters.network` | Stake Plus, in-house — five member-operated authoritative nameservers, no third-party DNS dependency |

A client resolving `asset-hub-polkadot.dotters.network` hits one of five Stake-Plus-operated authoritative servers directly; resolving the `ibp.network` equivalent goes through ClouDNS's anycast network. Same chain, same WSS endpoints behind the names — but the path that *gets you to the IP* is genuinely independent in each pool. If ClouDNS has an incident or changes its policy, `dotters.network` is unaffected; if the Dotters cluster has a maintenance window, `ibp.network` is unaffected.

## Reporting

Members meet on a regular cadence; recordings are published to the [IBP YouTube channel](https://www.youtube.com/@ibp.network). Treasury reporting is handled via the bounty curators.

## Ongoing changes

The 2026 top-up proposal (currently in discussion at [Subsquare #443](https://polkadot.subsquare.io/posts/443), pre-referendum) reshapes the rotation: external parachain coverage moves to a treasury-of-parachain funding model (Hydration is the first), six external parachains exit the public-bounty rotation, and Paseo testnet coverage moves to a reduced member subset. See the blog post [A leaner IBP](/blog/leaner) for the full picture.

## Common questions

### Who runs IBP?

__IBP_MEMBER_COUNT__ independent businesses (__IBP_MEMBERS_WITH_COUNTRY__), each separately incorporated in a different jurisdiction. Each operator owns their own hardware and contracts their own datacentre directly. There's no central IBP entity that owns the infrastructure or pays the operators' wages.

**Members don't control the funding multisig.** A separate **curator multisig (3-of-5)** sits on-chain, appointed via the treasury-bounty mechanism, and signs every child-bounty release. Operators propose changes (to the membership, the funding cycle, the service rotation) when internal consensus forms in the members' meeting, but the curators are the independent ratifying body and can refuse a release if the operators' reports don't hold up. The multisig is what makes "operator-run public infrastructure" credibly different from "a self-paying cartel of operators".

### How is IBP funded?

By the **Polkadot and Kusama treasuries**, via on-chain referenda. Three referenda are currently load-bearing: Kusama Referendum 35 (2022, original Kusama cycle), Polkadot Referendum 649 (2024, extension onto Polkadot), and Polkadot Referendum 1516 (2025, top-up of the 2024 bounty). A further top-up for 2026 is in discussion on [Subsquare #443](https://polkadot.subsquare.io/posts/443). Funds reach members as **child-bounties**, one per member per period, released by the curator multisig after operator reports are signed off.

### How does IBP differ from a commercial RPC provider?

A commercial provider (Infura, Alchemy, QuickNode) is one company, with one legal entity, that can be subpoenaed, deplatformed, or asked to filter requests. IBP is a federation: independent operators in different jurisdictions, each running their own bare-metal hardware, paid directly from the on-chain treasury rather than by Series-A VCs. There are no API keys, no per-query billing, and no central account dashboard. The endpoint is genuinely public infrastructure in the public-good sense.

### How are members audited?

Curators monitor uptime, response time, and incident attendance on a regular cadence (typically quarterly). Aggregate live telemetry (per-operator and per-chain) is published openly on [ibdash](https://ibdash.dotters.network). Members are paid the next cycle's child-bounty only after the curators sign off on the prior period's report; the multisig is the gating mechanism.

### Can I become a member?

Not in the current top-up cycle. The 2026 proposal lands at the current membership and explicitly retires the staged "milestone" onboarding tier used during 2022–2023. If you're an operator interested in future cycles, the place to surface that is the public [Matrix room](https://matrix.to/#/!tNVRcjndUHhSDzCKFF:matrix.org).
