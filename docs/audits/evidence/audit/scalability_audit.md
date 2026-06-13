---
id: BT-AUDIT-SCALABILITY-AUDIT
title: "Scalability Audit - BookTown"
status: locked
authority_level: audit
owner: audit-governance
last_audited: 2026-06-13
source_of_truth: false
supersedes: []
superseded_by: null
ai_read: false
migrated_from: audit/scalability_audit.md
---

# Scalability Audit - BookTown

**Date**: May 3, 2026  
**Scope**: Firestore bottlenecks, hot document risks, indexing strategy, growth trajectory

---

## 1. Firestore Write Throughput - Single Document Bottleneck

**Severity**: HIGH

**Finding**: Critical collections likely suffer from hot document anti-pattern, limiting throughput.

**Probable Hot Documents**:
- User library documents (daily updates from many users)
- Author/book popularity counters
- Admin operation audit log

**Evidence**:
- user_library_books updated frequently
- Likely counter fields (readCount, favoriteCount)
- No sharding visible

**Firestore Limits**:
- 1 write/second per document (soft limit ~10x with careful design)
- With 100,000 users, user library updates alone exceed capacity

**Impact**:
- Write errors during peak usage
- Throttling of update operations
- User experience degradation

**Formula**:
```
Daily active users: 10,000
Write operations per user per day: 10 (mark as read, add to shelf, etc)
Total writes per day: 100,000
Writes per second: 100,000 / 86,400 = 1.16 ops/sec
Available capacity: 1 op/sec per document
Conclusion: EXCEEDS CAPACITY at scale
```

**Fix Direction**:
1. Implement counter sharding for frequently updated fields
2. Use batch writes to consolidate updates
3. Move counters to separate collection
4. Implement cache-through pattern with Cloud Tasks
5. Archive old audit logs to separate collection

---

## 2. Firestore Read Throughput - Query Performance Degradation

**Severity**: HIGH

**Finding**: Complex queries on growing collections will degrade as data grows.

**Probable Slow Queries**:
```typescript
db.collection("quotes")
  .where("bookId", "==", bookId)
  .where("visibility", "==", "public")
  .orderBy("createdAt", "desc")
  .limit(100)
```

**Scaling Issues**:
- Each user's library queries become slower
- Search across all books becomes expensive
- Join-like operations (author + books) require multiple round trips

**Impact**:
- Search latency increases linearly with collection size
- Read costs scale superlinearly
- User experience degrades as data grows

**Fix Direction**:
1. Implement query result caching (Redis)
2. Pre-compute common queries (denormalization)
3. Archive historical data to separate collections
4. Implement pagination with cursors
5. Consider Firestore Search (Algolia/Typesense integration)

---

## 3. Firestore Storage Growth - Document Size Limits

**Severity**: MEDIUM

**Finding**: Books and authors documents may grow beyond optimal size as features accumulate.

**Probable Growth Path**:
- Initial: {title, author, description, coverUrl}
- Later: {+ canonicalKey, + titleAliases, + searchTokens, + metadata}
- Full: {+ reviews, + ratings, + readingHistory, + userNotes}

**Issue**: Embedding related data in book document:
```typescript
{
  id: "book123",
  title: "...",
  reviews: [{...}, {...}, {...}],  // Unbounded array!
  ratings: [{...}, {...}],           // Unbounded array!
  readingHistory: [{...}]            // Unbounded array!
}
```

**Firestore Limits**:
- Document size limit: 1MB
- With 100 reviews × 10KB each = 1MB already

**Impact**:
- Cannot fetch book + all reviews in single query
- Document becomes too large to index
- Updates slow down as document grows

**Fix Direction**:
1. Keep reviews in separate collection (already done - good)
2. Implement document size monitoring
3. Move large fields to subcollections if needed
4. Set array size limits (max 100 items)
5. Implement pagination for embedded arrays

---

## 4. Firebase Storage - Media Scaling

**Severity**: MEDIUM

**Finding**: Book covers stored in Firebase Storage may scale to terabytes.

**Metrics**:
- Estimated book catalog: 1 million books
- Average cover size: 500KB (compressed JPEG)
- Total storage: 500GB

**Costs**:
- Storage: $0.018/GB/month = $9,000/month
- Downloads: $0.12/GB × 500GB = $60,000/month
- Transfer out: May exceed budget quickly

**Issues**:
- No visible image optimization
- No CDN for fast delivery
- No image expiration/cleanup

**Impact**:
- Storage costs spiral
- Slow image delivery from Storage
- Scalability hit

**Fix Direction**:
1. Use Cloudinary/Imgix for image delivery (CDN included)
2. Generate multiple sizes (thumbnail, medium, hero)
3. Implement image expiration for deleted books
4. Add image format negotiation (WebP)
5. Monitor storage usage and set alerts

---

## 5. Database Indexes - Manual Maintenance Required

**Severity**: MEDIUM

**Finding**: Firestore indexes created manually, likely incomplete or missing as queries evolve.

**Evidence**:
- firestore.indexes.json has 19,496 bytes
- 188 index rules visible
- Likely missing indexes for new query patterns

**Issues**:
- New features require index creation
- Composite indexes delay launches
- Manual index management error-prone

**Impact**:
- Slow queries until index created
- User experience degradation for hours/days
- Feature launches blocked by indexing

**Fix Direction**:
1. Automate index creation via Terraform/Infrastructure as Code
2. Implement automatic index suggestions
3. Monitor query performance for missing indexes
4. Create index naming convention
5. Archive unused indexes

---

## 6. Function Scaling - Cold Starts

**Severity**: MEDIUM

**Finding**: Cloud Functions have cold start latency for rarely-used endpoints.

**Issues**:
- 131 endpoints means ~20% unused at any time
- Initializing Firebase, database, logging on each cold start
- Dependencies (zod, lodash) loaded on each function

**Impact**:
- Admin operations slow on first call after idle period
- User-facing operations may timeout
- Unpredictable latency

**Metrics**:
- Firebase initialization: ~100ms
- Code parsing/execution: ~50ms
- Total cold start: ~150-300ms

**Fix Direction**:
1. Group related functions into single file to share initialization
2. Implement request warming (periodic ping)
3. Use Cloud Functions 2nd gen for faster cold starts
4. Move heavy dependencies to bundled layers
5. Monitor cold start frequency

---

## 7. Real-time Database - Document Listener Limits

**Severity**: MEDIUM

**Finding**: Real-time listeners on user libraries will accumulate with active users.

**Issues**:
```typescript
const unsubscribe = db.collection("user_library_books")
  .doc(userId)
  .onSnapshot(handleUpdate);  // One per user = 10,000 listeners
```

**Firestore Limits**:
- No hard limit on listeners, but Firebase SDK/browser limits ~100 per client
- Each listener consumes bandwidth and memory
- Stale listeners accumulate if not cleaned up

**Impact**:
- Memory leaks in frontend
- Stale listeners consuming bandwidth
- Real-time updates stop after 100 listeners

**Fix Direction**:
1. Implement listener cleanup on unmount
2. Use pooled listeners instead of per-component
3. Consider polling instead of listeners for less critical data
4. Implement listener limit enforcement
5. Monitor listener count and memory usage

---

## 8. Collection Growth Projections

**Severity**: MEDIUM

**Finding**: No visible growth monitoring or capacity planning.

**Projected Growth** (5-year):
| Collection | Year 1 | Year 2 | Year 3 | Year 4 | Year 5 |
|-----------|---------|---------|---------|---------|---------|
| books | 100k | 300k | 1M | 3M | 10M |
| authors | 10k | 30k | 100k | 300k | 1M |
| quotes | 500k | 2M | 10M | 50M | 200M |
| users | 10k | 100k | 1M | 10M | 100M |
| user_library | 100k | 1M | 10M | 100M | 1B |

**Issues**:
- Quotes collection at 200M documents becomes slow
- user_library at 1B documents may exceed Firestore limits
- Index count will exceed 500+
- Read/write costs spiral

**Impact**:
- Eventual migration required (to BigQuery, Spanner, or other)
- Cannot scale indefinitely in Firestore
- Business model sustainability questioned

**Fix Direction**:
1. Implement growth monitoring dashboard
2. Create capacity utilization alerts
3. Plan database migration strategy early
4. Consider BigQuery for analytics
5. Implement data archival strategy

---

## 9. Search Scaling - Index Limitations

**Severity**: HIGH

**Finding**: Current search implementation (full collection scans with filtering) won't scale to millions of books.

**Current Approach**:
```typescript
db.collection("books")
  .where("searchPrefixes", "array-contains", query)
  .limit(1000)
  .get()
```

**Issues**:
- 1M books → scans all matching documents
- With 10 matching documents per query → 10 reads
- With 100,000 daily searches → 1M reads/day

**Costs**:
- Firestore read cost: $0.06 per 100K reads
- 1M reads = $600/month just for search

**Impact**:
- Search becomes prohibitively expensive
- Latency increases as collection grows
- Cannot afford to search at scale

**Fix Direction**:
1. Implement Algolia/Typesense full-text search
2. Create search index from Firestore via scheduled job
3. Move search queries to external service
4. Keep Firestore for canonical data only
5. Implement search analytics and telemetry

---

## 10. Admin Operations - Quadratic Complexity

**Severity**: MEDIUM

**Finding**: Merge and delete operations iterate through all related documents, creating O(n²) complexity.

**Evidence** (adminMergeCanonicalBooks):
```typescript
// For each source book:
// Find all editions
// Find all quotes
// Find all shelves
// Delete all references
// = 4+ queries per merge

// Worst case: 1000 editions × 1000 quotes = 1M delete operations
```

**Issues**:
- Merging books with many relations becomes slow
- Deleting popular books exceeds transaction limits
- Cannot handle large-scale operations

**Impact**:
- Admin operations timeout
- Cannot clean up duplicates at scale
- Manual intervention required

**Fix Direction**:
1. Implement async operation queue (Cloud Tasks)
2. Break operations into smaller batches
3. Implement progress tracking and resumable operations
4. Add operation timeout and failure recovery
5. Monitor operation performance

---

## 11. Cost Scaling - Read/Write Explosion

**Severity**: HIGH

**Finding**: Current architecture has unbounded read/write growth with user base.

**Estimated Costs** (Year 1):
| Operation | Volume | Cost |
|-----------|--------|------|
| Reads | 10M/month | $6,000 |
| Writes | 1M/month | $50 |
| Storage | 100GB | $18 |
| **Total** | | **$6,068/month** |

**Year 3 Projection**:
- Reads: 1B/month = $600,000
- Writes: 100M/month = $5,000
- Storage: 10TB = $180,000
- **Total: $785,000/month**

**Impact**:
- Business model unsustainable
- Must monetize heavily to break even
- Investors will question scalability

**Fix Direction**:
1. Implement caching aggressively (Redis, CDN)
2. Batch operations to reduce write count
3. Archive old data to BigQuery (cheaper)
4. Implement tiered read access
5. Plan for alternative database at scale

---

## 12. Monitoring & Observability - Missing Infrastructure

**Severity**: MEDIUM

**Finding**: No visible monitoring for scaling metrics:
- Collection size growth
- Query performance degradation
- Cost tracking
- Index health
- Real-time listener count

**Impact**:
- Cannot detect bottlenecks until users complain
- No early warning of scalability issues
- Cost overruns undetected

**Fix Direction**:
1. Set up Cloud Monitoring dashboards
2. Create alerts for metric thresholds
3. Implement cost alerts ($X/month threshold)
4. Track collection size growth
5. Monitor query latency percentiles

---

## Scalability Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Hot document writes | HIGH | CRITICAL | Counter sharding |
| Search cost explosion | HIGH | CRITICAL | Full-text search service |
| Collection size limits | MEDIUM | CRITICAL | Data archival |
| Cold start latency | MEDIUM | HIGH | Function optimization |
| Storage cost growth | MEDIUM | HIGH | Image optimization + CDN |
| Listener memory leaks | MEDIUM | MEDIUM | Listener cleanup |
| Index maintenance burden | LOW | MEDIUM | IaC for indexes |
| Admin operation timeouts | MEDIUM | MEDIUM | Async operations |

---

## Roadmap to Production Scale

**Months 1-3**:
- Implement search index (Algolia/Typesense)
- Add counter sharding
- Set up monitoring dashboard

**Months 4-6**:
- Archive historical data
- Implement image CDN
- Add listener pooling

**Months 7-12**:
- Plan BigQuery migration
- Implement async operations
- Build cost dashboard

**Year 2+**:
- Migrate analytics to BigQuery
- Consider Spanner for horizontal scaling
- Implement multi-region architecture

---

## Key Metrics to Track

1. **Collection Sizes** (weekly):
   - books, authors, quotes, user_library
   - Alert at 80% of next scaling limit

2. **Query Performance** (daily):
   - Search latency p50, p95, p99
   - Alert if p95 > 200ms

3. **Costs** (daily):
   - Reads, writes, storage, data transfer
   - Alert if >20% over budget

4. **Listener Count** (realtime):
   - Active listeners per user
   - Alert if > 50 per client

5. **Function Performance** (continuous):
   - Cold start frequency
   - Query duration distribution
   - Error rates
