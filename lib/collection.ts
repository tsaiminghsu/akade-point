import { getUserRegistrations, type Registration } from "./dynamo/registrations";
import { getUserRewards, type RewardTier } from "./dynamo/rewards";

export interface CollectionStatus {
  nCount: number;
  rCount: number;
  srCount: number;
  cards: Registration[];
  claimedTiers: RewardTier[];
  eligibleTiers: RewardTier[];
}

const TIER_REQUIREMENTS: Record<RewardTier, (s: CollectionStatus) => boolean> = {
  SMALL: (s) => s.nCount >= 2,
  MEDIUM: (s) => s.nCount >= 2 && s.rCount >= 1,
  LARGE: (s) => s.nCount >= 2 && s.rCount >= 2 && s.srCount >= 1,
  SSR_COMPLETE: (s) => s.nCount >= 2 && s.rCount >= 2 && s.srCount >= 1,
};

export async function getCollectionStatus(userId: string): Promise<CollectionStatus> {
  const [registrations, claimedRewards] = await Promise.all([
    getUserRegistrations(userId),
    getUserRewards(userId),
  ]);

  const nCount = registrations.filter((r) => r.rarity === "N").length;
  const rCount = registrations.filter((r) => r.rarity === "R").length;
  const srCount = registrations.filter((r) => r.rarity === "SR").length;
  const claimedTiers = claimedRewards.map((r) => r.tier);

  const status: CollectionStatus = {
    nCount,
    rCount,
    srCount,
    cards: registrations,
    claimedTiers,
    eligibleTiers: [],
  };

  const allTiers: RewardTier[] = ["SMALL", "MEDIUM", "LARGE", "SSR_COMPLETE"];
  status.eligibleTiers = allTiers.filter(
    (tier) => !claimedTiers.includes(tier) && TIER_REQUIREMENTS[tier](status)
  );

  return status;
}
