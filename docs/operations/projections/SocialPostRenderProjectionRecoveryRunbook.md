# Social Post Render Projection Recovery Runbook

Status: Phase 8A production recovery runbook
Projection: `social_post_render_projection`

## Authority Source

Canonical authority:

- `posts`
- `books`
- `authors`
- `social_quote_projection`
- `shelves`

`posts.renderProjection` is never authority. It is an embedded feed rendering optimization.

## Projection Target

- `posts/{postId}.renderProjection`
- attachment snapshot fields embedded in the render projection

## Dry Run Command

```json
{
  "mode": "dry_run",
  "scope": "collection_page",
  "batchSize": 100,
  "reason": "Phase 8A render projection verification"
}
```

## Write Command

```json
{
  "mode": "write",
  "reconciliationMode": "repair",
  "scope": "collection_page",
  "batchSize": 100,
  "reason": "Repair social render projection drift after dry-run verification"
}
```

## Verification Query

Verifier reads bounded pages from `posts`, rebuilds expected render projection from post content and attached entity authority, and compares against `posts.renderProjection`.

Detected drift:

- missing render projection
- stale render projection
- unresolved attached entity snapshot

## Failure Modes

- missing attached entity authority
- malformed post attachment data
- stale embedded snapshot
- required index missing
- write failure

## Operator Steps

1. Run dry-run.
2. Review verification report and failure ledger.
3. Repair with explicit write mode if drift is bounded.
4. Confirm projection health is `healthy`.

## Escalation Criteria

Escalate if verification success rate is below `0.995`, attached entity authorities are missing, or repair produces critical failure ledger records.
