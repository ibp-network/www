---
sidebar_position: 3
title: Curators
---

# Curators

The IBP is held to its mandate by a **5-member curator multisig** that releases child-bounty payments after reviewing each cycle's operator reports. Curators are appointed via the on-chain bounty mechanism and sit **independently of the operator membership** — operators can't pay themselves.

## Current curators

| Curator | Affiliation | Role |
| --- | --- | --- |
| [anaelleltd](https://github.com/anaelleltd) | Parity | Non-executive |
| [bLd](https://github.com/bLd) | Astar | Non-executive |
| [CoinStudio](https://github.com/coinstudio) | Independent | **Executive** |
| [Otar](https://github.com/otar-akhobadze) | Parity | Non-executive |
| [will](https://github.com/willjpartrick) | Parity | Non-executive |

Affiliations are disclosed and intentional — the curator set spans Parity (oversight of the chain teams the IBP serves), Astar (downstream parachain perspective), and an independent executive curator handling accounting / disbursement. The 3-Parity / 1-Astar / 1-independent split keeps the ratifying body weighted toward ecosystem stakeholders without giving any one company unilateral control.

## Multisig structure

The bounty itself is on-chain; child-bounty releases require a **3-of-5 threshold** on the curator multisig. Non-executive curators review operator reports, sign off, and approve releases. The executive curator (CoinStudio) handles the operational mechanics: preparing the multisig calls, tracking outstanding child-bounties, reconciling against operator invoices, and posting the resulting on-chain extrinsics for the other curators to co-sign.

This separation matters: non-executive signatures are the policy gate (does this release reflect agreed work?); the executive role is logistical (does the multisig call carry the right amounts and recipients?). No single curator can move funds.

## Bounties under management

| Network | Bounty | Status |
| --- | --- | --- |
| Kusama | [Bounty 19](https://kusama.subscan.io/bounty/19) | Active since Dec 2022 (Ref 35) |
| Polkadot | [Bounty 50](https://polkadot.subscan.io/bounty/50) | Active since Apr 2024 (Ref 649) |

Both bounties feed into the same operator membership; the Kusama and Polkadot child-bounty multisigs are tracked separately at the chain level but operated by the same curator set.

## Curator compensation

The bounty allocates **$1,800 USD / month** for the curator set in total. The single payment is routed through the **executive curator** (CoinStudio), who distributes internally. The mechanism is one bounty-side payment per cycle rather than five per cycle — fewer on-chain calls, simpler accounting trail.

The compensation is for the work of running the multisig: reviewing reports, preparing on-chain calls, maintaining the audit history. Curators don't run infrastructure themselves; they ratify the work of operators who do.

## Records of payments

All child-bounty disbursements, multisig calls, billing sheets, and per-cycle operator service inventories are tracked in the public [`ibp-network/ChildBounties`](https://github.com/ibp-network/ChildBounties) repository. The README there is the canonical entry point and covers:

- **Polkadot Bounty 50 Services and IAAS Billing** — per-member, per-cycle billing detail for the Polkadot bounty.
- **Kusama Bounty 19 Services and IAAS Billing** — same shape for the Kusama bounty.
- **Multisig logs** — historical record of every child-bounty extrinsic, Kusama and Polkadot tracked separately.

Live operational data (per-member traffic, request volumes, service status, current billing window) is now centralised in the **IBP Portal data dashboard** at [`ibdash.dotters.network`](https://ibdash.dotters.network). The portal is the primary reference for current state; the GitHub repository continues as the verifiable historical record.

## Why this separation matters

A commercial RPC provider has a CEO who can sign for the company. The IBP is structurally the opposite: the operators are __IBP_MEMBER_COUNT__ legally separate businesses paid by a chain-treasury bounty, which is itself controlled by curators the operators don't control. There's no single entity that can be subpoenaed to filter requests, deplatform a member, or unilaterally reallocate funds.

That's why "treasury-funded, operator-run, curator-ratified" is the load-bearing description — each layer is held by a different party, and any unilateral action requires either a treasury referendum (operators can't initiate) or a 3-of-5 multisig (no single curator controls).
