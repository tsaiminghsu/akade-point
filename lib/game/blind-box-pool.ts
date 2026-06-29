export interface BlindBoxReward {
  name: string;
  rarity: "UR" | "SSR" | "SR" | "R";
  desc: string;
  image?: string;
}

export const BLIND_BOX_POOL: BlindBoxReward[] = [
  // UR
  {
    name: "【實體閃卡】第一彈經典卡包兌換券",
    rarity: "UR",
    desc: "極其稀有！可於合作活動實體櫃檯兌換『第一彈：創世核心』實體閃卡包一套（內含隨機三張閃卡）。",
  },
  // SSR
  {
    name: "【實體周邊】第一彈紀念胸章兌換券",
    rarity: "SSR",
    desc: "憑此券至 Akade Cafe 實體門市即可兌換『第一彈：創世核心』限量紀念胸章乙個！",
  },
  {
    name: "【限定特權】戰隊專屬動態頭像框解鎖",
    rarity: "SSR",
    desc: "解鎖限定的星河動態頭像框，彰顯您在機器人宇宙中的尊貴地位。",
  },
  // SR
  {
    name: "【特約店家】Akade Cafe 飲品買一送一券",
    rarity: "SR",
    desc: "於特約店家 Akade Cafe 消費飲品享買一送一優惠，限兌換乙次。",
  },
  {
    name: "【限定外觀】探索者一號 - 曜石黑塗裝",
    rarity: "SR",
    desc: "解鎖探索者一號的專屬曜石黑限定外觀，讓您的收藏圖鑑更加炫酷！",
  },
  {
    name: "【限定外觀】守護者三號 - 翡翠綠塗裝",
    rarity: "SR",
    desc: "解鎖守護者三號的專屬翡翠綠限定外觀，散發綠色能量光輝！",
  },
  // R
  {
    name: "【特約店家】星際主題鬆餅折價券 50 元",
    rarity: "R",
    desc: "於特約店消費星際主題鬆餅可享現折 50 元優惠。",
  },
  {
    name: "【探勘徽章】超重力跳躍推進器",
    rarity: "R",
    desc: "虛擬個人榮譽徽章，展示於個人檔案頁面，象徵您完成了深空星系探勘。",
  },
  {
    name: "【探勘徽章】量子偏振力場儀",
    rarity: "R",
    desc: "虛擬個人榮譽徽章，展示於個人檔案頁面，象徵您掌握了量子躍遷科技。",
  }
];

/**
 * Draw a random item based on game performance (combos) and a random roll
 */
export function drawBlindBoxItem(combos: number): BlindBoxReward {
  // Higher combos give better chances for higher rarities!
  const roll = Math.random() * 100;
  
  let pool: BlindBoxReward[] = [];
  
  if (combos >= 7) {
    // 7+ Combo: UR (15%), SSR (45%), SR (40%)
    if (roll < 15) {
      pool = BLIND_BOX_POOL.filter(item => item.rarity === "UR");
    } else if (roll < 60) {
      pool = BLIND_BOX_POOL.filter(item => item.rarity === "SSR");
    } else {
      pool = BLIND_BOX_POOL.filter(item => item.rarity === "SR");
    }
  } else if (combos >= 4) {
    // 4-6 Combo: SSR (10%), SR (60%), R (30%)
    if (roll < 10) {
      pool = BLIND_BOX_POOL.filter(item => item.rarity === "SSR");
    } else if (roll < 70) {
      pool = BLIND_BOX_POOL.filter(item => item.rarity === "SR");
    } else {
      pool = BLIND_BOX_POOL.filter(item => item.rarity === "R");
    }
  } else {
    // 1-3 Combo: SR (20%), R (80%)
    if (roll < 20) {
      pool = BLIND_BOX_POOL.filter(item => item.rarity === "SR");
    } else {
      pool = BLIND_BOX_POOL.filter(item => item.rarity === "R");
    }
  }

  // Fallback to R if specific sub-pool is empty for some reason
  if (pool.length === 0) {
    pool = BLIND_BOX_POOL.filter(item => item.rarity === "R");
  }

  // Pick one randomly from pool
  const randomIndex = Math.floor(Math.random() * pool.length);
  return pool[randomIndex];
}
