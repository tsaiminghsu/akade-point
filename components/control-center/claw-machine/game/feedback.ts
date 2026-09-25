// Player-facing wording for why a round didn't pay out. Pure, so it's tested.

const cm = (m: number) => Math.round(Math.abs(m) * 100);

/**
 * Where the nearest plush was relative to the claw when it closed on nothing.
 * dx > 0: plush to the right. dz < 0: plush further in (away from the player).
 */
export function describeMiss(nearest: { dx: number; dz: number } | null): string {
  if (!nearest) return '沒夾到';
  const parts: string[] = [];
  if (cm(nearest.dx) >= 1) parts.push(`${nearest.dx > 0 ? '右' : '左'} ${cm(nearest.dx)} 公分`);
  if (cm(nearest.dz) >= 1) parts.push(`${nearest.dz < 0 ? '往裡' : '往外'} ${cm(nearest.dz)} 公分`);
  if (parts.length === 0) return '沒夾到';
  return `沒夾到：最近的娃娃在${parts.join('、')}`;
}

export function describeSlip(weak: boolean): string {
  return weak
    ? '爪力轉弱，娃娃滑落了（一般局）'
    : '沒抓穩，娃娃滑落了（夾偏或晃太大）';
}
