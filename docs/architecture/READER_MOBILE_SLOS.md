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
- PDF scroll mode rendered page window: <= 5 live pages.
- PDF first interaction p95: <= 2200 ms for benchmark fixture.
- Scroll FPS p95: >= 50 fps on mid-tier mobile during continuous scroll.
- Dropped-frame burst: <= 5 dropped frames per 1-second sample.
- Layout shift score: <= 0.10 per reader device-lab scenario.
- Deferred hydration delay: <= 1200 ms per reader device-lab scenario.
- Reader chrome visibility transition: <= 180 ms.
- Offline replay p95: <= 30 seconds from reconnect to convergence.
- Offline integrity: cached files with SHA-256 checksums must verify before trusted reuse.

## Reliability SLOs
- Reader session init success: >= 99.5%.
- Resume accuracy (exact location restore): >= 99.9%.
- Sync convergence (offline -> online) within 30 seconds p95.
- Crash-free reader sessions: >= 99.8%.

## Release Gates
- Fail release if any reader p95 budget regresses by > 10%.
- Fail release if crash-free sessions drop below SLO for two consecutive windows.
- Fail release if sync error rate exceeds 1% for reader operations.

## CI-Enforced Proxy Gates
- Pipeline: `npm run ci:reader:perf`.
- Stabilization pipeline: `npm run ci:reader:stabilization`.
- Hard-fail if reader shell no longer lazy-loads engine modules.
- Hard-fail if PDF scroll-page mapping no longer uses indexed lookup helpers.
- Cold-open proxy budgets (build artifacts):
  - Reader shell JS raw: <= 260 KB.
  - Reader shell JS gzip: <= 80 KB.
  - PDF engine JS raw: <= 400 KB.
  - PDF engine JS gzip: <= 120 KB.
  - EPUB engine JS raw: <= 30 KB.
  - EPUB engine JS gzip: <= 12 KB.
  - PDF engine CSS raw: <= 14 KB.
- Page-turn proxy budgets (deterministic benchmark on 5,000-page synthetic index):
  - Lookup p95: <= 0.04 ms.
  - Lookup average: <= 0.02 ms.
- Stress corpus gate:
  - Every A5 EPUB/PDF stress case must be represented in `public/fixtures/reader-corpus/manifest.json`.
  - Every generated corpus asset must exist before the gate passes.
  - Every case must declare runtime pressure, expected behavior, and latency/FPS/heap budgets.

## CI-Enforced Browser Timing Gate
- Pipeline: `npm run ci:reader:browser-perf`.
- Runtime: Playwright Chromium against `vite preview`.
- Controlled fixture: `/public/fixtures/reader-benchmark.pdf`.
- Scenario: load `/?readerBenchmark=1` and capture in-browser timings from reader runtime callbacks.
- Hard-fail budgets (p95 over 7 measured runs, 1 warmup run discarded):
  - Cold-open p95: <= 1500 ms.
  - First-page-render p95: <= 2200 ms.

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

## Required Runtime Telemetry Metrics
- `reader_open_start`
- `manifest_loaded`
- `signed_url_received`
- `epub_runtime_ready`
- `pdf_runtime_ready`
- `first_page_rendered`
- `first_interaction_ready`
- `reader_chrome_visibility`
- `reader_runtime_prewarm`
- `hydration_deferred`
- `hydration_completed`
- `epub_locations_cache_hit`
- `epub_locations_cache_miss`
- `epub_locations_generate_time`
- `epub_canonical_locations_loaded`
- `epub_canonical_locations_fallback`
- `page_turn_latency`
- `scroll_fps`
- `dropped_frames`
- `long_task`
- `layout_shift`
- `memory_usage`
- `highlight_creation_latency`
- `offline_queue_size`
- `offline_flush_time`
- `sync_failure_rate`
- `render_crashes`
