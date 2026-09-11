/** Splits `items` into consecutive slices of at most `size` (the last one may
 *  be shorter). Used for DynamoDB BatchWrite's 25-item ceiling and for capping
 *  how many records one API request carries. */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error(`chunk: size must be >= 1, got ${size}`);
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** Max records one /events/batch or /alerts/batch request may carry. */
export const MAX_BATCH_ITEMS = 100;
