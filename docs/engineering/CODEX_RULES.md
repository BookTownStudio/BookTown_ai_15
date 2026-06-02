# Codex Engineering Rules

These rules are mandatory for future Codex sessions in this repository.

## Firestore

Do not introduce unbounded Firestore reads.

Do not write:

- `db.collection(...).get()` without an approved safety wrapper.
- `db.collectionGroup(...).get()` without an approved safety wrapper.
- `getDocs(query(collection(...)))` without `limit(...)`.
- direct `firebase-admin` script initialization for production maintenance scripts.

Large reads must use `functions/src/core/firestoreSafety`.

Maintenance scripts must default to dry run and require explicit production confirmation.

Any Firestore read path that can exceed 50,000 reads/day is a release-blocking defect unless it has an approved budget, alert, and runbook.

## Architecture

Keep business logic on the backend. Keep UI logic on the client. Do not make client code responsible for cost or security enforcement.

## Review Requirement

If Codex adds or modifies Firestore access, it must run:

```bash
npm run firestore:safety
```

Any failure must be fixed before handoff.

