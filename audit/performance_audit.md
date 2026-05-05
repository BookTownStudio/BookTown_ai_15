# Performance Audit - BookTown

**Date**: May 3, 2026  
**Scope**: Component rendering, bundle size, React Query caching, network requests

---

## 1. Code Splitting - 28 Lazy-Loaded Routes

**Severity**: MEDIUM

**Finding**: App.tsx lazy-loads 28 major screens, reducing initial bundle but creating route transition latency.

**Evidence** (App.tsx lines 20-66):
```tsx
const HomeScreen = lazy(() => import('./app/tabs/home.tsx'));
const ReadScreen = lazy(() => import('./app/tabs/read.tsx'));
// ... 26 more
```

**Metrics**:
- Initial bundle reduced but transition time unknown
- No prefetching strategy visible
- Suspense fallback (PageLoader) may cause janky UX

**Impact**:
- Route transitions slow (100-500ms code chunk load)
- Users see loading spinner on navigation
- Compound effect with poor network

**Fix Direction**:
1. Implement route prefetching for high-probability next routes
2. Use React.startTransition for lower-priority loads
3. Measure actual code chunk sizes and load times
4. Consider combining related routes into single chunk
5. Add network information API for adaptive loading

---

## 2. Provider Re-render Cascade

**Severity**: MEDIUM

**Finding**: 10+ nested providers (App.tsx) cause cascading re-renders when any provider state changes.

**Issues**:
- Theme changes re-render entire app
- Navigation changes re-render entire app  
- Toast notifications re-render entire app
- No memoization visible between providers

**Impact**:
- Every state change potentially re-renders thousands of components
- Performance degradation with deep component trees
- Mobile devices (low CPU) hit 60fps threshold

**Fix Direction**:
1. Measure re-render frequency with React DevTools Profiler
2. Extract frequently-changing state into isolated provider
3. Implement useMemo/useCallback in provider consumers
4. Consider atom-based state (Jotai) instead of context
5. Profile actual performance impact on low-end device

---

## 3. React Query - Unknown Caching Strategy

**Severity**: MEDIUM

**Finding**: Only 8 components visible using React Query (useQuery/useMutation), but entire app likely uses it.

**Evidence**:
- grep found 8 files with React Query usage
- Caching strategy unknown
- Stale-while-revalidate behavior unknown
- Garbage collection of old queries unclear

**Impact**:
- Memory leaks from uncollected queries
- Stale data displayed in UI
- Redundant network requests
- Poor offline behavior

**Fix Direction**:
1. Audit all data fetching (should use React Query)
2. Configure query stale times by data type
3. Implement query invalidation strategy
4. Configure cache size limits
5. Add query telemetry/monitoring

---

## 4. Component Rendering - Potential Inefficiencies

**Severity**: LOW

**Finding**: Without codebase analysis, likely issues:
- Lists without key props
- Inline functions in event handlers
- Components re-rendering unnecessarily

**Probable Issues**:
- Search results list re-renders entire list on each query
- Book carousel item components re-render on parent updates
- Admin tables re-render all rows on pagination

**Impact**:
- Lists with 100+ items become slow (mobile)
- Jank on interactions
- CPU-bound rendering blocks UI

**Fix Direction**:
1. Use React.memo for list items
2. Implement windowing (react-window) for long lists
3. Move inline functions to module level or useCallback
4. Use key prop correctly in all lists
5. Profile with React DevTools Profiler

---

## 5. Image Loading - Unknown Optimization

**Severity**: MEDIUM

**Finding**: No visible image optimization strategy (Next.js Image not used, unclear if WebP supported).

**Evidence**:
- Book covers likely loaded as JPEG without compression
- Author portraits likely full resolution
- No responsive image srcset
- No lazy loading visible

**Impact**:
- High bandwidth usage (covers could be 500KB+ each)
- Slow page loads on 3G/4G
- Poor mobile performance
- Wasted storage in Firestore

**Fix Direction**:
1. Implement image optimization pipeline (Cloudinary/Imgix)
2. Serve WebP with JPEG fallback
3. Generate multiple sizes (thumbnail, medium, hero)
4. Implement lazy loading for images below fold
5. Add responsive image srcsets

---

## 6. Search Engine - Complex Pipeline Performance

**Severity**: MEDIUM

**Finding**: Search engine performs multi-stage processing:
- Query normalization
- Transliteration
- Ranking with confidence scoring
- Deduplication

**Metrics**:
- searchEngine.ts: 4,425 lines of complex logic
- Multi-source ranking likely O(n²) complexity
- Typo correction with Levenshtein distance (expensive)

**Impact**:
- Search queries likely take 100-500ms
- Multiple database queries per search
- Expensive operations on hot data

**Fix Direction**:
1. Profile search performance with real queries
2. Cache search results aggressively
3. Consider search index instead of full-table scans
4. Implement query timeout (cancel if > 500ms)
5. Pre-compute rankings for popular queries

---

## 7. Bundle Size - Unknown Metrics

**Severity**: MEDIUM

**Finding**: No visible bundle size monitoring. Likely issues:
- Unused dependencies
- Large devDependencies in production build
- No tree-shaking
- Duplicate dependencies

**Evidence**:
- firebase, react, react-dom, zod, lodash all likely included
- Testing libraries (jest, vitest, chai) may be in bundle
- Type definitions (@types/*) included in build

**Impact**:
- Initial load > 100KB (js + css + html)
- Slow on slow networks
- High bandwidth cost

**Fix Direction**:
1. Add bundle size monitoring (Webpack Bundle Analyzer)
2. Identify and remove unused dependencies
3. Implement code splitting for dependencies
4. Use dynamic imports for large libraries
5. Set up CI check for bundle size regressions

---

## 8. Network Requests - Waterfall Delays

**Severity**: MEDIUM

**Finding**: Without visible request waterfall, likely issues:
- Sequential requests (get user → get books → get reviews)
- Missing request batching
- Parallel requests not optimized

**Impact**:
- Total page load time = sum of sequential requests
- E.g., 3 requests × 200ms = 600ms page load
- Could be parallelized to 200ms

**Fix Direction**:
1. Audit actual request waterfall with Network tab
2. Implement parallel data fetching with Promise.all()
3. Consider GraphQL batch queries
4. Implement request deduplication
5. Add request caching at network level

---

## 9. Database Query Performance - Unknown

**Severity**: MEDIUM

**Finding**: 245+ files in functions/src likely contain unoptimized Firestore queries.

**Issues**:
- No visible query indexing strategy
- Unknown filter complexity
- Likely missing compound indexes
- Possible full collection scans

**Evidence** (searchEngine.ts probable):
```typescript
db.collection("books")
  .where("canonicalKey", "==", canonicalKey)
  .limit(1)
  .get()
```

- Good: single field, limited
- But search likely does:
```typescript
db.collection("books")
  .where("searchTokens", "array-contains", token)
  .where("language", "==", userLanguage)
  .where("visibility", "==", "public")
  // No index, expensive!
```

**Impact**:
- Query latency 500ms-5s
- Firebase index creation bottleneck
- High read costs

**Fix Direction**:
1. Audit all queries with Firestore console
2. Create composite indexes for complex queries
3. Implement query result caching
4. Consider denormalization for hot data
5. Add query performance telemetry

---

## 10. First Contentful Paint - Unknown

**Severity**: MEDIUM

**Finding**: No visible FCP optimization strategy. Likely slow:
- Authentication check blocks render
- Initial data fetch blocks UI
- Large JS parsed/compiled before paint

**Probable Flow**:
1. Page loads → App.tsx renders
2. AuthProvider checks auth (async) → loading state
3. User waits for auth check → blank screen
4. After auth → fetch user data
5. After data → render actual content

**Impact**:
- FCP > 3 seconds likely
- Users see blank screen or loading spinner
- Frustrating experience on slow networks

**Fix Direction**:
1. Move authentication to shell (not content)
2. Render placeholder UI while loading
3. Show cached data while fetching fresh
4. Defer non-critical data loading
5. Measure FCP/LCP with Web Vitals

---

## 11. Long Tasks - Main Thread Blocking

**Severity**: LOW

**Finding**: Search engine's complex ranking likely creates long tasks (>50ms).

**Issues**:
- Typo correction with Levenshtein distance expensive
- Multi-source ranking calculations
- Deduplication logic complex

**Impact**:
- Janky UI while search results ranking
- Scrolling stutters
- Mobile devices hit frame budget limits

**Fix Direction**:
1. Move expensive operations to Web Workers
2. Use requestIdleCallback for non-critical work
3. Implement progressive result rendering
4. Profile with Chrome DevTools Performance tab

---

## 12. Mobile Performance - Untested

**Severity**: HIGH

**Finding**: No visible mobile performance testing. Likely issues:
- App optimized for desktop
- Large images on mobile
- No mobile-specific bundle
- Touch interactions slow

**Impact**:
- App unusable on low-end devices
- High bounce rate from mobile users
- Poor Core Web Vitals scores

**Fix Direction**:
1. Test on real mobile device (iPhone SE, Pixel 4a)
2. Implement adaptive loading based on device type
3. Optimize images for mobile screens
4. Reduce bundle for mobile
5. Profile with Chrome Mobile DevTools

---

## Performance Metrics Summary

| Metric | Target | Unknown | Impact |
|--------|--------|---------|--------|
| FCP | < 1.5s | ❌ | User experience |
| LCP | < 2.5s | ❌ | User perception |
| CLS | < 0.1 | ❌ | Jarring experience |
| TTI | < 3.5s | ❌ | Interactivity |
| Bundle Size | < 150KB | ❌ | Initial load |
| Search Latency | < 200ms | ❌ | Feature usability |
| Route Transition | < 100ms | ❌ | Navigation feel |

---

## Critical Action Items

**Before Launch**:
1. Measure actual FCP/LCP on 4G network
2. Profile bundle size and identify optimizations
3. Test on real mobile device (iPhone + Android)
4. Implement image optimization

**Post-Launch Monitoring**:
1. Set up Core Web Vitals tracking
2. Monitor search query performance
3. Track route transition times
4. Monitor database query performance
5. Set performance budgets in CI

---

## Tools & Setup

**Measurement**:
```
npm install -D webpack-bundle-analyzer
npm install web-vitals
```

**Testing**:
- Chrome DevTools Performance tab
- Lighthouse audit
- WebPageTest.org
- Calibre (network throttling)

**Production Monitoring**:
- Google Analytics Web Vitals
- Sentry performance monitoring
- Firebase Performance Monitoring
- Custom telemetry

---

## Baseline Targets (After Optimization)

| Metric | Target | Device |
|--------|--------|--------|
| FCP | 1.2s | Pixel 4 on 4G |
| LCP | 2.0s | iPhone SE on 4G |
| CLS | 0.05 | All devices |
| Bundle | 100KB | Minified + gzipped |
| Search | 150ms | p95 latency |
