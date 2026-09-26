/** Sort key for a vehicle STATUSTEXT message: zero-padded time, then the
 *  companion's sequence number. Lexical order is time order, same-millisecond
 *  messages stay distinct, and the same message arriving over the cloud and
 *  the direct link gets the same key. Shared by the server (events table) and
 *  the ground station (de-duplication). */
export function eventSortKey(t: number, seq: number): string {
  return `${String(Math.max(0, Math.floor(t))).padStart(15, "0")}#${String(seq).padStart(9, "0")}`;
}
