/**
 * Response shapes for the app's own JSON API.
 *
 * These mirror what the route handlers actually return today, so client
 * components can drop `any`. When the DTO layer lands (leaderboard/profile
 * field whitelisting), these are the types that change — which is exactly the
 * point: the compiler will then find every consumer of a removed field.
 */
import type { CollectionStatus } from "@/lib/collection";
import type { User } from "@/lib/dynamo/users";
import type { GameSession } from "@/lib/dynamo/sessions";

/** GET /api/user/profile */
export interface ProfileResponse {
  profile: User | null;
  sessions: GameSession[];
}

/** GET /api/collection */
export type CollectionResponse = CollectionStatus;

/** Every route handler's failure shape: NextResponse.json({ error }, { status }). */
export interface ApiErrorBody {
  error: string;
}
