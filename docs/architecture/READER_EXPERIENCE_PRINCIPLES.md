---
id: BT-DOCS-ARCHITECTURE-READER-EXPERIENCE-PRINCIPLES
title: "Reader Experience Principles"
status: active
authority_level: architecture
owner: architecture-governance
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Reader Experience Principles

Status: Phase B2 baseline.

## Calmness

Reader UI must preserve attention. Controls should appear only by clear user intent, move quickly, and avoid decorative motion. Loading states should feel like continuity restoration, not application reset.

## Continuity Trust

The reader must never imply that progress, highlights, or bookmarks are client-authoritative. Optimistic local feedback is acceptable only when replay remains deterministic and server reconciliation remains authoritative.

## Perceived Performance

First interaction readiness matters more than showing every secondary control immediately. Heavy runtime work should publish telemetry and degrade intentionally rather than freezing the reader without explanation.

Predictive warming is allowed only when it is idle-time, bounded, and skipped for constrained memory, data-saver, or degraded-network contexts. It must make the next reader operation feel immediate without stealing budget from the current reading session.

Annotation and continuity hydration should be progressive. Reopen and page-render paths must avoid large post-render DOM bursts that make the reader appear to rebuild itself after the text is already visible.

## Regression Signals

Experience quality is now measured alongside runtime budgets:

- Chrome visibility changes are emitted through `reader_chrome_visibility`.
- Runtime warming is emitted through `reader_runtime_prewarm`.
- Deferred hydration is emitted through `hydration_deferred` and `hydration_completed`.
- Layout instability is emitted through `layout_shift`.
- Long tasks remain tracked through `long_task`.
- Device-lab proxy reports include layout shift score, hydration delay, and prewarm count per scenario.

## Non-Goals

- No visual redesign.
- No new social, AI, or collaboration surfaces inside the reader.
- No hidden client-authoritative continuity writes.
- No feature additions that increase interruption pressure without an explicit reader SLO.
