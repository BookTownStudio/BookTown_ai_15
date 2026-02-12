// functions/src/library/search/filtering/filterByCapability.ts

export type CapabilityFlags = {
  hasEbook: boolean;
  downloadable?: boolean;
  publicDomain?: boolean;
};

export type CapabilityFilterContext = {
  requireEbook?: boolean;
  requireReadable?: boolean;
  requirePublicDomain?: boolean;
};

/**
 * Capability-aware filtering.
 *
 * Rules (LOCKED):
 * - Filters are AND-combined
 * - No soft fallbacks
 * - No mutation of input objects
 */
export function filterByCapability<T extends CapabilityFlags>(
  results: T[],
  ctx: CapabilityFilterContext
): T[] {
  return results.filter((r) => {
    if (ctx.requireEbook && !r.hasEbook) return false;

    // Readable === ebook with server-mediated access
    if (ctx.requireReadable && !r.hasEbook) return false;

    if (ctx.requirePublicDomain && !r.publicDomain) return false;

    return true;
  });
}
