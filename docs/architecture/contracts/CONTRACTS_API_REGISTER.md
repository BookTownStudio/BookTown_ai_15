---
id: BT-ARCH-CONTRACTS-API-REGISTER-001
title: "Contracts and API Architecture Register"
status: active
authority_level: architecture
owner: api-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Contracts and API Architecture Register

## Purpose

This register routes shared contracts, DTO authority, callable boundaries, client/backend type ownership, sync/parity checks, and known gaps without changing contract behavior.

## Runtime Authority

Runtime authority currently lives in:

- `contracts/*`
- `contracts/entityPlatform/*`
- `functions/src/contracts/*`
- `functions/src/contracts/shared/*`
- `functions/src/contracts/parity/checkSurfaceParity.ts`
- `lib/callable.ts`
- Domain callables in `functions/src/domains/*`

## Documentation Authority

Primary routing starts at [MASTER_CONTRACTS_API.md](../../master/MASTER_CONTRACTS_API.md), then this register. Domain behavior routes to the owning domain Master document.

## Authority Areas

| Area | Authority |
|---|---|
| Shared DTOs | `contracts/*` and mirrored backend contract files. |
| Entity DTOs | Entity Platform contracts and Entity Platform Master. |
| Callable boundaries | Backend callable wrappers and owning domain runtime. |
| Client type consumption | Shared contracts and client callable wrapper. |
| Backend validation | Owning backend domain. |
| Error envelopes | API Platform contract/runtime authority. |
| Sync/parity checks | Contract parity checker and build gates. |

## Governance Rules

- Contracts describe boundaries; backend domains own business authority.
- Client code must not infer server truth beyond returned contracts.
- DTO changes require compatibility review and routed documentation updates.
- Parity failures are release-blocking evidence until resolved.
- Audit/completion records remain evidence unless routed here or through Master.

## Known Gaps

- Versioning policy remains a dedicated future authority need.
- Some domain DTOs remain runtime-led and should be routed through their owning domain docs.
- Parity evidence should be easier to locate from this register as tooling matures.
