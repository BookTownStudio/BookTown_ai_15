# Reader Stress Corpus

Status: Phase A5 stabilization baseline.

## Canonical Manifest

The reusable corpus contract lives at:

- `public/fixtures/reader-corpus/manifest.json`

The manifest is the authority for fixture IDs, format, asset path, runtime pressure, expected behavior, and SLO-style budgets. The corpus intentionally uses generated, license-safe synthetic assets so regression gates can run without commercial book rights or private user files.

## Fixture Generation

Run:

```bash
npm run fixtures:reader-corpus
```

This generates EPUB and PDF assets under `public/fixtures/reader-corpus/` for:

| Format | Cases |
|---|---|
| EPUB | small clean, large scaled, RTL Arabic, mixed RTL/LTR, image-heavy, malformed spine, broken TOC, footnote-dense, annotation-heavy |
| PDF | small, large scaled, academic, scanned-style, Arabic, image-heavy, corrupt negative, huge pagecount scaled |

Generated scaled fixtures are CI-safe proxies. They validate architecture, windowing, cache behavior, error handling, and regression wiring. They do not replace device-lab validation with real licensed large books.

## Regression Gate

Run:

```bash
npm run perf:reader:corpus-gate
```

The gate verifies that every required A5 corpus case exists, has a repo-local asset, declares runtime pressure, declares expected behavior, and has numeric budgets for open latency, first-page latency, FPS, and heap ceiling.

The consolidated stabilization workflow is:

```bash
npm run ci:reader:stabilization
```

## Device-Lab Proxy Run

Run after `npm run build`:

```bash
npm run perf:reader:device-lab
```

This starts `vite preview`, opens the benchmark route against selected corpus fixtures, applies mobile viewport constraints, CPU throttling, optional route delay, interaction loops, heap sampling, long-task telemetry, and writes:

- `reports/reader-device-lab/latest.json`
- `reports/reader-device-lab/latest.md`

This is an empirical local proxy for weak-device/runtime heatmap analysis. It is not physical device evidence.

## Evidence Boundary

The corpus can prove:

- Required fixture coverage is permanent and versioned.
- Negative cases are represented for controlled failure behavior.
- Runtime expectations are explicit and regression-gateable.
- EPUB/PDF stress cases can be reproduced without external assets.

The corpus cannot prove:

- Real weak-device memory ceilings.
- Multi-hour battery impact.
- Arabic typography quality against commercial typography engines.
- True 1,000+ page production PDF behavior.
- Full offline reopen behavior across mobile OS eviction.
- Battery pressure, thermal slowdown, and mobile OS background eviction behavior.

Those require device-lab runs and should be recorded separately as empirical QA evidence.
