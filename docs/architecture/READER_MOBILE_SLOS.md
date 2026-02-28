# Reader Mobile-First SLOs (Execution Baseline)

## Decision (Locked)
- Reader business logic remains backend-authoritative.
- Client reader runtime is offline-first with server sync.
- Manifest-driven open path is the canonical flow.

## Performance Budgets
- Cold open p95: <= 1500 ms on mid-tier mobile.
- Page turn p95: <= 100 ms.
- Search-in-book p95: <= 150 ms.
- Memory ceiling: per-device-tier budget tracked in release gate.

## Reliability SLOs
- Reader session init success: >= 99.5%.
- Resume accuracy (exact location restore): >= 99.9%.
- Sync convergence (offline -> online) within 30 seconds p95.
- Crash-free reader sessions: >= 99.8%.

## Release Gates
- Fail release if any reader p95 budget regresses by > 10%.
- Fail release if crash-free sessions drop below SLO for two consecutive windows.
- Fail release if sync error rate exceeds 1% for reader operations.

## Required Telemetry Events
- `[READER][SESSION_INIT_REQUEST]`
- `[READER][SESSION_READY]`
- `[READER][SESSION_INIT_FAILED]`
- `[READER][MANIFEST_REQUEST]`
- `[READER][MANIFEST_READY]`
- `[READER][MANIFEST_FAILED]`
- `[READER][PROGRESS_WRITE_REQUEST]`
- `[READER][PROGRESS_WRITE_OK]`
- `[READER][PROGRESS_WRITE_FAILED]`
- `[READER][SYNC_OPS_REQUEST]`
- `[READER][SYNC_OPS_RESULT]`
