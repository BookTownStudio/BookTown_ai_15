---
id: BT-DOCS-OPERATIONS-PROJECTIONS-EVENTSTATSRECOVERYRUNBOOK
title: "Event Stats Recovery Runbook"
status: active
authority_level: operations
owner: operations-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Event Stats Recovery Runbook

Status: Phase 8A.19 production recovery runbook
Projection: `event_stats`

## Authority

Canonical authority is `events/{eventId}/rsvps/{userId}`.

The certified canonical projection is `event_stats/{eventId}` with:

- `rsvps`: exact RSVP document count
- `rsvpsCount`: compatibility count field for existing readers
- `counters.rsvps`: compatibility nested counter field for existing readers
- `updatedAt`: projection update timestamp
- `lastUpdatedAt`: compatibility update timestamp

Operational marker fields such as `lastRecoveredAt` and `lastBackfilledAt` may exist and must be preserved. Runtime triggers, admin backfill, and recovery repair must all emit the canonical required fields above.

## Non-Authority

- `event_stats/{eventId}` is not authority.
- Historical backfill output is not authority.
- Client-supplied event counters are not authority.

## Dry Run Command

```json
{ "projectionName": "event_stats", "mode": "dry_run", "scope": "collection_page", "batchSize": 100, "reason": "Phase 8A.19 event stats verification" }
```

## Single Event Command

```json
{ "projectionName": "event_stats", "mode": "dry_run", "scope": "single_event", "eventId": "event-id", "reason": "Verify one event stats document" }
```

## Checkpointed Full Command

```json
{ "projectionName": "event_stats", "mode": "dry_run", "scope": "checkpointed_full", "batchSize": 100, "reason": "Checkpointed event stats verification" }
```

## Write Repair Command

```json
{ "projectionName": "event_stats", "mode": "write", "reconciliationMode": "repair", "scope": "checkpointed_full", "batchSize": 100, "reason": "Approved exact event stats repair" }
```

## Verification

Verification recomputes exact RSVP counts from `events/{eventId}/rsvps/{userId}` and compares them to `event_stats/{eventId}`.

Detected failure classes:

- `missing_event_stats`
- `rsvp_count_drift`
- `orphan_event_stats`
- missing `updatedAt`

Reported counters include success rate, missing count, stale count, mismatch count, and extra count.

## Repair Rules

Repair is idempotent and exact-count only.

- Never use increment repair.
- Never trust client data.
- Never delete compatibility fields.
- Only write in `mode: "write"` with `reconciliationMode: "repair"`.
- Maximum batch size is `100`.

## Health And Failure Ledger

Every run uses the Phase 8A recovery run manager. Verification writes projection verification reports, updates projection health, and records failures in the projection failure ledger.

## Escalation Criteria

Escalate if orphan `event_stats` documents remain after event deletion policy is confirmed, or if RSVP count drift recurs after a successful exact repair.
