
# BookTown — Phase 1 Code Reality vs Contracts

This document compares implementation reality against Phase 1 Contracts.

Legend:
✅ Enforced
⚠️ Partially Enforced
❌ Violated

---

## Search Result Contract
Status: ⚠️

- Results treated as transient ✔️
- Reader occasionally reachable before ingestion ❌

---

## Ingestion Contract
Status: ⚠️

- Canonical book creation exists ✔️
- Frontend does not always wait for READY state ❌

---

## Ebook Capability Contract
Status: ❌

- Capability flags exist partially
- Readability inferred in places
- Offline capability undefined

---

## Storage Contract
Status: ⚠️

- Storage exists ✔️
- No checksum validation ❌
- URLs may persist too long ❌

---

## Offline Contract
Status: ❌

- No deterministic offline guarantee
- No explicit download lifecycle
- Cache invalidation undefined

---

## Authority Contract
Status: ⚠️

- Backend authoritative by design ✔️
- Frontend still assumes visibility = existence ❌

---

## Summary

Architecture direction is correct.
Contracts are not yet fully enforced.
Phase 1 must focus on hardening, not expansion.
