---
sidebar_position: 1
title: Introduction
---

# Introduction

The Infrastructure Builders' Programme (IBP) is a Polkadot/Kusama treasury-funded effort to run public RPC, bootnode, and archive infrastructure for the Polkadot ecosystem. It is operated by **seven independent businesses**, each running their own bare-metal servers in colocation facilities they contract directly.

Public endpoints aggregate behind two GeoDNS namespaces: `ibp.network` (administered by Gatotech) and `dotters.network` (administered by Stake Plus). The live endpoint inventory is at [/endpoints](/endpoints).

## What is GeoDNS routing?

GeoDNS is DNS that returns a different IP address depending on where the query came from. When a client in Bangkok asks `asset-hub-polkadot.dotters.network`, the resolver returns Rotko Networks' IP (in Bangkok). When a client in Zurich asks the same name, it gets Amforc's IP (in Zurich). The protocol is plain DNS, with no Anycast trickery and no client-side library.

Two practical consequences:

- **Latency is what you'd expect.** Whichever member is geographically closest to the client is what serves the connection. Typical round-trip from anywhere in the world to its nearest IBP operator is under 50 ms.
- **A single-operator outage doesn't take down the hostname.** If one member's health check fails, the GeoDNS layer stops returning that operator's IP for new queries within a single DNS TTL. New connections land at the next-nearest healthy operator. The hostname itself stays up.

Both pools (`ibp.network` and `dotters.network`) are independent GeoDNS deployments run by different members, so the routing layer itself isn't a single point of failure either.

## What is a bootnode?

A bootnode is a peer that a Substrate node contacts when it first joins the network, in order to learn the addresses of other peers. Once it has a peer set, the bootnode is no longer special; the node gossips with the wider peer set directly.

Two things to know:

- **Bootnodes are entry points, not trust anchors.** They don't sign blocks, don't decide what's finalised, don't serve historical state. A misbehaving bootnode can introduce a node to a bad peer set, but the finality proofs that follow either match the genesis hash + GRANDPA validator set or they don't; the bootnode can't lie its way past that.
- **Why WSS bootnodes specifically.** Browsers can't open raw TCP sockets, so an in-browser smoldot light client needs `wss://`-flavoured bootnodes. The IBP runs a WSS variant of every bootnode in addition to the TCP one, which is what makes in-browser light clients work without a hosted RPC in the path.

The full bootnode list (TCP + WSS per chain) is at [/endpoints](/endpoints), under the **Trustless access** disclosure on each chain card.

## Why this exists

A handful of for-profit RPC providers carry most of Polkadot's public traffic today. That concentration is a liveness risk (one provider's outage takes down a meaningful share of dApps) and a centralisation risk: any single operator can be compelled to filter, rate-limit, or lie about chain state. The IBP exists to provide a parallel, member-owned, treasury-funded alternative that has none of those single points.

The endpoint isn't the only path to chain state. Polkadot is one of the few networks where running a **light client inside the browser** is realistic: smoldot syncs from genesis (or a checkpoint) and verifies blocks against the relay's finality proofs directly, with no RPC operator in the trust path. The two layers are complementary, and most production dApps benefit from running them in a **hybrid model**:

- **Public RPC for the cold start.** First call is one round-trip; the page renders. We host the bootnodes that smoldot uses to find peers, so this path is also what gets the light client onto the network.
- **Light client for ongoing reads.** Once smoldot has synced (a few seconds in the background), the dApp switches its reads to the in-browser client. From that point forward chain state is verified locally; the RPC layer is no longer in the trust path, and a compromised endpoint can't lie to the user.

We run the infrastructure for both halves of that hybrid: the public RPC that bootstraps fast, and the bootnodes and chain-spec hosting that make the smoldot handoff possible.

## What every member runs

The seven members differ in city, hardware vendor, and ISPs. What they share is the **minimum spec each site must meet**:

- **Member-owned hardware** in member-contracted colocation. No cloud rentals in the production path.
- **Current-generation server class**: EPYC or Xeon CPUs, ECC RAM, PCIe 4.0+ NVMe, IPMI-managed BMCs.
- **High-availability at the site**: clustered hypervisor, replicated storage, dual power feeds, dual ISPs, rack-distributed quorum.
- **99.9% per-site target** (≈ 43 minutes of unplanned downtime per month per member). The seven-member GeoDNS rotation absorbs single-operator outages, so aggregate availability across the rotation is materially higher than any single member's figure.
- **Open-source stack**: Proxmox, Ceph, HAProxy, Ubuntu, Prometheus, Grafana. No licence lock-in.
- **Renewable power** or carbon offsets at the datacentre.

Full requirement detail on [Minimum requirements](/operations/basics/requirements).

## What this section covers

- [Operations](/operations/basics/operations): governance, treasury funding, the curator multisig, current roster.
- [Minimum requirements](/operations/basics/requirements): the spec every member meets.
- [Members](/operations/auditors/members): the seven active operators, with location and contact handle.
- [Progress](/operations/auditors/progress): programme history and funding cycles.
