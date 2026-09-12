/**
 * Response DTOs.
 *
 * These are the security boundary between the DynamoDB row shape and what goes
 * over the wire. Handlers must map through one of these rather than returning
 * a stored item directly — several rows (users, game sessions) carry fields
 * that must never reach a client.
 */
import type { User } from "@/lib/dynamo/users";

export interface LeaderboardEntry {
  userId: string;
  displayName: string | null;
  lineImage: string | null;
  totalPoints: number;
}

/** Drops email, isAdmin, inventory, questionnaireData, ticketCount, timestamps. */
export function toLeaderboardEntry(user: User): LeaderboardEntry {
  return {
    userId: user.userId,
    displayName: user.displayName ?? null,
    lineImage: user.lineImage ?? null,
    totalPoints: user.totalPoints ?? 0,
  };
}
