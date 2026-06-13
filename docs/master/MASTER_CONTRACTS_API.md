---
id: BT-MASTER-CONTRACTS-API-001
title: "BookTown Contracts and API Master Document"
status: active
authority_level: master
owner: api-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Contracts and API Master Document

## Purpose

This document is the Master Layer entry point for Contracts, shared types, callable boundaries, API parity, error envelopes, and client/backend authority. It summarizes authority and routes to lower-level sources without changing contract behavior.

For authority routing, start with [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md).

## Scope

In scope:

- Shared contracts.
- Callable wrappers.
- REST/export wrappers.
- Error codes and envelopes.
- Contract parity.
- Correlation and observability contracts.
- Client/backend boundary ownership.

Out of scope:

- New contract fields.
- New callable behavior.
- New API versioning policy.
- New validation rules.

## Runtime Authority

Runtime authority currently lives in:

- `contracts/*`
- `contracts/entityPlatform/*`
- `functions/src/contracts/*`
- `functions/src/contracts/shared/*`
- `functions/src/contracts/parity/checkSurfaceParity.ts`
- `lib/callable.ts`
- Domain callables in `functions/src/domains/*`

Shared contract files and backend wrappers own request/response shapes, error envelopes, callable wrapping, parity, and client/backend boundary behavior. Product clients consume contracts and do not redefine server authority.

## Documentation Authority

Primary authority documents:

- [PHASE_1_CONTRACTS.md](../architecture/PHASE_1_CONTRACTS.md)
- [WAVE_4_COMPLETION.md](../audits/evidence/completions/engineering/WAVE_4_COMPLETION.md)
- [T7_infrastructure_callable_edge_contract_stabilization_execution.md](../audits/evidence/audit/T7_infrastructure_callable_edge_contract_stabilization_execution.md)
- [CODEX_RULES.md](../engineering/CODEX_RULES.md)

Related authority:

- [MASTER_ENTITY_PLATFORM.md](MASTER_ENTITY_PLATFORM.md)
- [MASTER_OBSERVABILITY.md](MASTER_OBSERVABILITY.md)

## System Architecture

Contracts and API is BookTown's typed boundary layer between backend domains and clients. It defines shared DTOs, callable wrappers, error mapping, parity checks, versioning references, and consistent response envelopes.

The architecture separates:

- Shared type authority.
- Backend domain ownership.
- Callable wrapper behavior.
- Error mapping and envelopes.
- Surface parity checks.
- Client consumption and rendering.

## Core Components

| Component | Role |
|---|---|
| Shared contracts | Define cross-runtime request and response shapes. |
| Entity Platform contracts | Define literary entity refs, summaries, lifecycle, graph, and MatchMaker types. |
| Callable wrappers | Standardize callable behavior and error handling. |
| Error mapper | Converts runtime errors into stable client-facing errors. |
| Correlation | Supports request tracing and diagnostics. |
| Parity checker | Validates shared surface contract alignment. |
| Client callable layer | Consumes backend APIs through stable wrappers. |

## Data Authority

| Data | Authority |
|---|---|
| Contract definitions | Shared `contracts/*` and backend shared contract mirrors. |
| Backend writes | Owning backend domain, not contracts. |
| Error codes | Shared contract/error code authority. |
| Response envelopes | Callable wrapper authority. |
| Entity contract types | Entity Platform contracts. |
| Client local state | Client only; not API authority. |

## User-Facing Surfaces

Contracts are infrastructure, but they support:

- Search.
- Reader.
- Catalog.
- Social/Messaging.
- Writing/Publishing.
- Admin/Control Plane.
- Discovery/Home.
- AI/Intelligence.

## Operational Dependencies

- Domain backend callables.
- Client callable wrapper.
- Contract parity checks.
- Build/type validation.
- Observability/correlation.
- Error mapping.
- Documentation governance for behavior changes.

## Projection Dependencies

Contracts and API indirectly support all projection-producing domains. Direct projection dependencies include:

- Contract parity evidence for search and entity DTOs.
- Observability contracts for metrics and health.
- Domain-specific recovery reports where response shapes are exposed.

## Governance Rules

- Contracts describe boundaries; owning backend domains own business authority.
- Client code must not infer server truth beyond contract responses.
- Contract changes require explicit version/compatibility review.
- Error envelopes must remain predictable.
- Completion/audit files are evidence unless reflected in active contract authority.
- Entity Platform contract changes must route through Entity Platform authority.

## Current Maturity

Product maturity: Operational infrastructure.

Architecture maturity: Implemented.

Documentation maturity: Partial to Good after this Master document.

Readiness: Closed Beta Ready.

## Known Gaps

- Dedicated API/contract architecture authority is still needed.
- Contract versioning policy should be made explicit.
- Client/backend parity evidence should be easier to navigate.
- Some domain contracts remain implemented authority without dedicated docs.

## Related Documents

- [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md)
- [MASTER_SYSTEM_MAP.md](MASTER_SYSTEM_MAP.md)
- [MASTER_ENTITY_PLATFORM.md](MASTER_ENTITY_PLATFORM.md)
- [MASTER_OBSERVABILITY.md](MASTER_OBSERVABILITY.md)
- [PHASE_1_CONTRACTS.md](../architecture/PHASE_1_CONTRACTS.md)
- [CODEX_RULES.md](../engineering/CODEX_RULES.md)

## System Ownership Matrix

| System | Owner | Runtime Authority | Documentation Authority |
|---|---|---|---|
| Shared contracts | API Platform | `contracts/*` | This Master doc and Phase 1 contracts. |
| Callable wrappers | API Platform | `functions/src/contracts/*` | Wave 4/T7 evidence and runtime. |
| Error envelopes | API Platform | Error mapper and shared error codes | Contract runtime and engineering docs. |
| Entity contracts | Entity Platform | Entity contract files | Entity Platform Master. |

## Dependency Matrix

| Dependency | Direction | Reason |
|---|---|---|
| Backend domains | Upstream | Domain callables own business behavior. |
| Client apps | Downstream | Clients consume typed contracts. |
| Entity Platform | Upstream | Entity contracts are shared across systems. |
| Observability | Downstream | Correlation and errors support diagnostics. |
| Build/quality gates | Downstream | Type and parity checks verify boundary health. |

## Authority Routing

| Question | Route |
|---|---|
| Shared DTO shape | `contracts/*` and this document. |
| Backend business behavior | Owning domain Master document. |
| Callable wrapping | `functions/src/contracts/*` and T7 audit evidence. |
| Entity contract behavior | [MASTER_ENTITY_PLATFORM.md](MASTER_ENTITY_PLATFORM.md). |
| Error/correlation behavior | Contract runtime and [MASTER_OBSERVABILITY.md](MASTER_OBSERVABILITY.md). |

## Future Evolution

Future contract/API changes should be documented in dedicated contract/versioning authority and then reflected here as routing updates. This Master document must not introduce new contract behavior directly.
