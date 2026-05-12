---
sidebar_position: 3
title: Minimum requirements
---

# Minimum requirements

Every active IBP member meets the spec on this page. It is the operating contract: members who fall below it for an extended period are flagged by curator audit and either restored or exited.

## Hardware (per site)

| Class | Minimum |
| --- | --- |
| CPU | Current-generation AMD EPYC or Intel Xeon (server-class). No desktop / consumer parts. |
| RAM | ECC, ≥ 128 GB per production host. Hosts running the full system-chain set plus collators sit comfortably at 256 GB. |
| Storage | Enterprise NVMe, PCIe 4.0 or newer, data-centre endurance class, ≥ 2 TB usable per node. RAID or Ceph for redundancy. |
| Network | 10 GbE minimum on the operator's egress. Two independent ISPs via separate cross-connects. |
| Management | IPMI / BMC out-of-band on every server. |

## Datacentre

- **Member-owned hardware** in **member-contracted** colocation. No cloud rentals in the production RPC path.
- **A+B power.** Every dual-PSU appliance pulls one feed from each side; single-PSU appliances are paired across feeds.
- **Two independent ISPs** via separate physical paths and separate networking gear.
- **Renewable energy** or carbon offset for the datacentre.
- **Rack-distributed quorum.** HA cluster members spread across racks (and rows where possible) so a single PDU, switch, or cooling-zone failure cannot kill a majority.

## Software stack

| Layer | Default |
| --- | --- |
| Hypervisor | Proxmox VE (KVM-based), dominant across the roster. VMware and plain libvirt/KVM also acceptable. |
| Storage | Ceph (block + object), replicated across the cluster. |
| Guest OS | Ubuntu LTS. Debian, AlmaLinux, NixOS also acceptable. |
| Reverse proxy + TLS | HAProxy + Let's Encrypt (or operator-owned cert). |
| Monitoring | Prometheus exporters + Grafana, exposed to the IBP shared dashboards. |
| Configuration | Per-operator; most run Ansible or Nix for reproducible deploys. |

All software in the production path is open source. No licence lock-in.

## Availability target

**99.9% per site**: about 43 minutes of unplanned downtime per month per member (≈ 8.76 hours per year). Hardware fails, ISPs reroute, datacentres do maintenance; the per-member target leaves honest room for it.

What matters publicly is the **aggregate**, not the per-member number. The seven-member GeoDNS rotation absorbs single-operator outages: if one member goes hard-down, requests route to the next-nearest healthy operator within a single DNS TTL, and the user-visible failure window is short. Aggregate observed availability across the rotation is consequently substantially higher than any one member's individual figure.

## Services every member runs

By default each member operates, at every active chain:

- **Public RPC endpoints** (WSS and HTTPS) for the chain assignment list.
- **Bootnodes**, both TCP and WSS variants (the WSS variant is what makes smoldot light-client work in browsers).
- **Archive nodes** where the chain assignment requires them.
- **Relay-chain validators** as part of the Polkadot/Kusama validator set, and **Bulletin-chain validators** as part of the new mandate.
- **Collators** for any parachain that funds continued IBP service (currently Hydration).
- **Per-member Prometheus exporters** scraped into the shared IBP dashboards, so curators can verify uptime independently.

The full per-chain assignment matrix is in the canonical config at [ibp-network/config](https://github.com/ibp-network/config); the live snapshot is at [/endpoints](/endpoints).

## Security posture

- **No public SSH** on production hosts. Operators connect via VPN or out-of-band BMC only.
- **Firewalled egress.** RPC ports are the only public-facing service.
- **Operator-managed TLS certs** with automated renewal. No shared wildcard certificate across the roster.
- **Independent legal entity** per member: operators are individually incorporated businesses, not contractors of a parent.

## Jurisdictional diversity

The seven operators are incorporated in seven different jurisdictions: Switzerland, Nigeria, Costa Rica, India, Thailand, United States, Portugal. No two members share a colocation provider. No single regulator can take down the public-RPC layer of Polkadot through one of its members.

## Audit cadence

Curators audit member uptime, response time, and incident-attendance on a regular cadence (typically quarterly). Aggregate live telemetry (per-operator and per-chain) is on [ibdash](https://ibdash.dotters.network). Members are paid via child-bounties once the cycle's report is signed off by the curator multisig.
