# Firestore Safety

Firestore is budget-critical infrastructure for BookTown beta. The production target is approximately $5/month, so read paths must be bounded by design.

## Rules

Unbounded Firestore reads are prohibited.

Collection scans require:

- Pagination by document id or another stable indexed cursor.
- Explicit `limit`.
- Explicit `maxReads`.
- Explicit `pageSize`.
- Explicit `operationName`.
- Explicit `riskClass`.
- Dry-run support for maintenance workflows.
- Structured logs before and after execution.

Production maintenance scripts require:

- `--project-id`
- `--confirm-production`
- `--max-docs`
- `--page-size`
- explicit override or approval flag

Violations are release-blocking defects.

## Approved Pattern

Use `functions/src/core/firestoreSafety`.

```ts
import { readFirestoreCollectionPage } from "../core/firestoreSafety/FirestoreSafety";

await readFirestoreCollectionPage(db.collection("books"), {
  operationName: "canonicalRepair.page",
  riskClass: "high",
  environment: "production",
  maxReads: 500,
  pageSize: 100,
  mode: "dryRun",
  requestedBy: uid,
  reason: "approved incident repair",
});
```

## Prohibited Patterns

```ts
await db.collection("books").get();
await db.collectionGroup("likes").get();
await getDocs(query(collection(db, "reports"), orderBy("createdAt", "desc")));
```

## Risk Classes

- Low: fixed document reads or queries limited to 100 reads.
- Medium: bounded operational queries limited to 1,000 reads.
- High: approved maintenance pages limited to 5,000 reads.
- Critical: any unbounded production scan or destructive global operation. Critical scans are prohibited.

