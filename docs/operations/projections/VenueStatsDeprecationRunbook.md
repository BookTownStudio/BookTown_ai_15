# Venue Stats Deprecation Runbook

Status: Phase 8A.19 deprecated compatibility runbook
Surface: `venue_stats`

## Classification

`venue_stats` is a legacy derivative admin artifact. It is excluded from Phase 8A production certification.

## Historical Authority

Historical authority was `venues/{venueId}/reviews`.

## Historical Purpose

The legacy `backfillDerivedStats` admin job counted venue reviews and wrote `venue_stats/{venueId}.reviews` for compatibility reads.

## Reason For Exclusion

No active runtime maintainer or production recovery family was found for `venue_stats`. It is not part of the executable Phase 8A projection registry and must not be promoted to `production_ready`.

## Operator Policy

- Do not certify `venue_stats`.
- Do not create new runtime writers.
- Do not treat `venue_stats` as authority.
- Keep client writes denied.
- Preserve existing documents until product ownership confirms removal.

## Retirement Path

1. Confirm there are no live product consumers.
2. Freeze writes outside approved admin maintenance.
3. Remove read dependencies if any are discovered.
4. Archive or delete stale documents through an approved data-retention process.
5. Keep the Phase 8A registry exclusion intact.
