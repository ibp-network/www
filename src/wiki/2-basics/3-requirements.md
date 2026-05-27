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
| Storage | Enterprise NVMe, PCIe 4.0 or newer, data-centre endurance class, ≥ 2 TB usable per node. **Per-host minimum is parity-protected redundancy** — RAIDZ (ZFS), or equivalent RAID 5/6/10 on hardware-RAID or mdraid. Single-disk and RAID 0 are out. |
| Network | **10 GbE port for transit, multihomed** across two independent transit providers via separate cross-connects, so a single carrier outage or congestion event cannot isolate the node. **1 Gbit/s committed information rate** (CIR) as the baseline operating contract, billed on the standard **95th-percentile** model — the top 5 % of 5-minute samples are discarded, so brief bursts above commit aren't penalised and burst headroom into the remainder of the 10 GbE absorbs peak demand without renegotiating with the carrier. |
| Management | IPMI / BMC out-of-band on every server. |

## Datacentre

- **Member-owned hardware** in **member-contracted** colocation. No cloud rentals in the production RPC path.
- **A+B power.** Every dual-PSU appliance pulls one feed from each side; single-PSU appliances are paired across feeds.
- **Two independent ISPs** via separate physical paths and separate networking gear.
- **Renewable energy** or carbon offset for the datacentre.
- **Rack-distributed quorum.** HA cluster members spread across racks (and rows where possible) so a single PDU, switch, or cooling-zone failure cannot kill a majority.

## Architecture

The three diagrams below — carried over from the original IBP member-deployment design — document how the Datacentre requirements above are wired together. Every active member's site implements this pattern.

### Power Redundancy

<figure style="background:#f4f4f4;border-radius:8px;padding:1rem;margin:1.5rem 0;max-width:760px">
  <img src="/img/design/power-redundancy.png" alt="Power redundancy diagram: utility feeds A and B from independent substations feed dual UPS banks; each rack is fed by both lines A and B; dual-PSU servers pull one cord from each, single-PSU appliances are paired across the two feeds." style="display:block;width:100%;height:auto" />
  <figcaption style="font-size:0.875rem;color:rgba(0,0,0,0.65);margin-top:0.6rem;text-align:center">A + B power feeds — independent up to and including the rack. Dual-PSU servers pull one cord from each side; single-PSU appliances are paired across feeds.</figcaption>
</figure>

### Internet Resiliency

<figure style="background:#f4f4f4;border-radius:8px;padding:1rem;margin:1.5rem 0;max-width:760px">
  <img src="/img/design/internet-resiliency.png" alt="Internet resiliency diagram: two independent ISPs land in the datacentre over physically separate fibre paths into separate networking gear; member edge routers are dual-homed; BGP balances and fails over between the two." style="display:block;width:100%;height:auto" />
  <figcaption style="font-size:0.875rem;color:rgba(0,0,0,0.65);margin-top:0.6rem;text-align:center">Multihomed transit — two independent ISPs over separate cross-connects + separate networking gear. The 10 GbE port + 1 Gbit/s 95th-percentile commit above sit on this fabric.</figcaption>
</figure>

### Rack distribution

<figure style="background:#f4f4f4;border-radius:8px;padding:1rem;margin:1.5rem 0;max-width:760px">
  <img src="/img/design/rack-distribution.png" alt="Rack distribution diagram: HA cluster nodes spread across multiple racks (and rows where possible), each rack fed by independent power and networking, so loss of any one rack does not break cluster quorum." style="display:block;width:100%;height:auto" />
  <figcaption style="font-size:0.875rem;color:rgba(0,0,0,0.65);margin-top:0.6rem;text-align:center">Rack-distributed quorum — cluster members spread across racks so a single PDU, switch, or cooling-zone failure cannot down a majority.</figcaption>
</figure>

## Software stack

| Layer | Default |
| --- | --- |
| Hypervisor | Proxmox VE (KVM-based), dominant across our deployments. VMware and plain libvirt/KVM also acceptable. |
| Storage | **ZFS** on local NVMe (RAIDZ) or **Ceph** (cluster-replicated, typically 3 copies) — per-site tradeoff. ZFS keeps the full IOPS of the underlying NVMe, which matters for the chain database's sustained random reads; host failure means that node is briefly down until rebuild. Ceph + Proxmox HA transitions VMs to a surviving host on the replicated volume so per-site availability is near-continuous, at the cost of meaningful IOPS reduction (network replication + write amplification across replicas). The federation's 99.99 % global uptime comes from GeoDNS rotation across __IBP_MEMBER_COUNT__ members, not host-level HA at any single site. |
| Guest OS | Ubuntu LTS. Debian, AlmaLinux, NixOS also acceptable. |
| Reverse proxy + TLS | HAProxy + Let's Encrypt (or operator-owned cert). |
| Monitoring | Prometheus exporters + Grafana, exposed to the IBP shared dashboards. |
| Configuration | Per-operator; most run Ansible or Nix for reproducible deploys. |

All software in the production path is open source. No licence lock-in.

## SLA

The base SLA that applies to every rank:

| Metric | Target |
| --- | --- |
| Hardware | Hosted in colocation on owned hardware with NVMe (Gen 4.0 or newer) disks |
| Per-colocation uptime | **99%** |
| Global service uptime | **99.99%** |
| Polling cadence | every 5 minutes |

The two uptime numbers measure different things and should not be confused. **Per-colocation** is the per-member target — about 7 hours of unplanned downtime per month per site is tolerated, because hardware fails, ISPs reroute, and datacentres do maintenance. **Global service** is what users actually see: the __IBP_MEMBER_COUNT__-member GeoDNS rotation absorbs single-operator outages by routing to the next-nearest healthy member within one DNS TTL, so the aggregate observed availability across the federation lands at four nines (≈ 4.4 minutes of user-visible downtime per month). Polling is curator-side: every multiaddr and RPC endpoint is checked on a 5-minute cadence, results feed [ibdash](https://ibdash.dotters.network).

## Services every member runs

By default each member operates, at every active chain:

- **Public RPC endpoints** (WSS and HTTPS) for the chain assignment list.
- **Bootnodes**, both TCP and WSS variants (the WSS variant is what makes smoldot light-client work in browsers).
- **Archive nodes** where the chain assignment requires them.
- **Relay-chain validators** as part of the Polkadot/Kusama validator set.
- **Collators** for any parachain that funds continued IBP service (currently Hydration).
- **Per-member Prometheus exporters** scraped into the shared IBP dashboards, so curators can verify uptime independently.

The full per-chain assignment matrix is in the canonical config at [ibp-network/config](https://github.com/ibp-network/config); the live snapshot is at [/endpoints](/endpoints).

## Security posture

- **No public SSH** on production hosts. Operators connect via VPN or out-of-band BMC only.
- **Firewalled egress.** RPC ports are the only public-facing service.
- **Operator-managed TLS certs** with automated renewal. No shared wildcard certificate across the membership.
- **Independent legal entity** per member: operators are individually incorporated businesses, not contractors of a parent.

## Jurisdictional diversity

The __IBP_MEMBER_COUNT__ active operators are incorporated in __IBP_MEMBER_COUNTRY_COUNT__ different jurisdictions: __IBP_MEMBER_COUNTRIES__. No two members share a colocation provider. No single regulator can take down the public-RPC layer of Polkadot through one of its members.

## Audit cadence

Curators audit member uptime, response time, and incident-attendance on a regular cadence (typically quarterly). Aggregate live telemetry (per-operator and per-chain) is on [ibdash](https://ibdash.dotters.network). Members are paid via child-bounties once the cycle's report is signed off by the curator multisig.
