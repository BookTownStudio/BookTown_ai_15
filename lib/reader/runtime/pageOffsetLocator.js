/**
 * Build a sorted page offset index from rendered page nodes.
 * Missing nodes are skipped; caller should ensure index completeness before strict use.
 *
 * @param {Array<HTMLElement | null>} pageRefs
 * @param {number} numPages
 * @returns {number[]}
 */
export function buildPageOffsetIndex(pageRefs, numPages) {
  const safePages = Number.isFinite(numPages) ? Math.max(0, Math.trunc(numPages)) : 0;
  const offsets = [];

  for (let index = 0; index < safePages; index += 1) {
    const node = pageRefs[index];
    if (!node) continue;
    offsets.push(Math.max(0, Math.trunc(node.offsetTop)));
  }

  return offsets;
}

/**
 * Locate the 1-based page number for a given scroll anchor using binary search.
 *
 * @param {readonly number[]} pageOffsets
 * @param {number} anchorOffset
 * @returns {number}
 */
export function findPageForAnchor(pageOffsets, anchorOffset) {
  if (!Array.isArray(pageOffsets) || pageOffsets.length === 0) return 1;

  const anchor = Number.isFinite(anchorOffset) ? anchorOffset : 0;
  let low = 0;
  let high = pageOffsets.length - 1;
  let best = 0;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const value = pageOffsets[mid];

    if (value <= anchor) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best + 1;
}
