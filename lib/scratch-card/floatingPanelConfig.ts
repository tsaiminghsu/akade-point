// 在此陣列新增 route path，對應頁面右下角就會出現刮刮卡浮層按鈕
// 不需改動任何遊戲頁面，只需在這裡加路由即可
export const SCRATCH_CARD_FLOATING_ROUTES: string[] = [
  // '/city-game',
  // '/jiu-gong-ge',
  // '/temple-of-desert-god',
  // 注意：/da-nu-shen 已有內建刮刮卡分頁，不需浮層
]

// 每次開啟浮層面板時的起始虛擬金幣（與其他遊戲的金幣池完全隔離）
export const FLOATING_PANEL_INIT_CREDITS = 10_000
