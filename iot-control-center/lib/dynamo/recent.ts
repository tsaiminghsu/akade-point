/**
 * Merges several already-descending lists (one per DynamoDB partition Query)
 * into a single newest-first list, capped at `limit`.
 *
 * `tieBreak` keeps the order total and stable when two records share a
 * timestamp — the live simulation stamps every event in one tick with the same
 * `Date.now()`, so ties are common and an unstable sort would reshuffle rows
 * between identical requests.
 */
export function mergeRecent<T>(
  lists: T[][],
  sortKey: (item: T) => number,
  limit: number,
  tieBreak?: (item: T) => string
): T[] {
  const merged = lists.flat();
  merged.sort((a, b) => {
    const diff = sortKey(b) - sortKey(a);
    if (diff !== 0) return diff;
    if (!tieBreak) return 0;
    const ka = tieBreak(a);
    const kb = tieBreak(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  return merged.slice(0, limit);
}
