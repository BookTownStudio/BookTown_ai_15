# Projection Recovery Runbook: Follow Graph

## Projection Names

```text
social_user_stats
public_profile_counters
```

## Certification Status

- Current: `production_ready`
- Required: `production_ready`

## Authority Source

```text
users/{targetUid}/followers/{followerUid}
users/{followerUid}/following/{targetUid}
```

Canonical schema:

```json
{
  "followerUid": "string",
  "targetUid": "string",
  "createdAt": "Timestamp"
}
```

The legacy `uid` field is compatibility-only and is not canonical.

## Projection Collections

```text
user_stats.followers
user_stats.following
public_profiles.followerCount
public_profiles.followingCount
```

## Maintainer

```text
Normal path: followUser / unfollowUser plus onUserFollowCreated / onUserFollowDeleted
Recovery path: recoverFollowGraph
```

## Expected Indexes

```text
users ordered by __name__
users/{uid}/followers ordered by __name__
users/{uid}/following ordered by __name__
user_stats by __name__
public_profiles by __name__
```

## Max Safe Batch Size

- Default batch size: `100`
- Hard max batch size: `100`

## Dry Run Command

Dry run is mandatory before write mode.

```json
{
  "scope": "single_user",
  "uid": "<uid>",
  "mode": "dry_run",
  "batchSize": 100,
  "verify": true,
  "reason": "Inspect follow graph drift"
}
```

## Write Command

```json
{
  "scope": "single_user",
  "uid": "<uid>",
  "mode": "write",
  "reconciliationMode": "repair",
  "batchSize": 100,
  "verify": true,
  "reason": "Repair follow graph drift after dry-run confirmation"
}
```

## Single Edge Command

```json
{
  "scope": "single_edge",
  "followerUid": "<followerUid>",
  "targetUid": "<targetUid>",
  "mode": "dry_run",
  "verify": true,
  "reason": "Inspect one follow edge"
}
```

## Checkpointed Full Recovery

```json
{
  "scope": "checkpointed_full",
  "mode": "dry_run",
  "batchSize": 100,
  "verify": true,
  "reason": "Checkpointed follow graph verification"
}
```

Repeat with the returned `nextCursor` or checkpoint until `nextCursor` is `null`. Use write mode only after dry-run counts match the incident scope.

## Verification Query

```text
Authority: users/*/followers and users/*/following mirror docs
Expected social_user_stats: user_stats followers/following equal authority counts
Expected public_profile_counters: public_profiles followerCount/followingCount equal authority counts
Expected mirror schema: followerUid and targetUid match path segments on both mirror docs
```

Verification reports `missingProjectionCount`, `staleProjectionCount`, `mismatchCount`, `extraProjectionCount`, and `verificationSuccessRate`.

## Failure Modes

```text
orphan follower doc
orphan following doc
path/field mismatch
createdAt mismatch
public profile counter drift
missing public profile document
user_stats compatibility counter drift
```

Failures are recorded in `projection_failure_ledger` with canonical edge ids in the form:

```text
follow_<followerUid>_<targetUid>
```

## Operator Steps

1. Run `single_edge` or `single_user` in `dry_run`.
2. Review verification report and failure ledger sample failures.
3. If the drift is bounded and understood, rerun the same scope with `mode: "write"` and `reconciliationMode: "repair"`.
4. For broad drift, run `checkpointed_full` in `dry_run` until complete before any write-mode pass.
5. Confirm `projection_health/social_user_stats` and `projection_health/public_profile_counters` return to `healthy`.

## Escalation Criteria

Escalate before write mode if:

- orphan mirror counts are broad or increasing;
- createdAt mismatches indicate data import corruption;
- public profile documents are missing for active users;
- checkpointed dry-run repeatedly records failures for the same edge;
- verification success rate is below 99.9% outside a known incident window.
