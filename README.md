# Akade Point - Robot Universe (星際機器人宇宙 - 點數集卡系統)

Akade Point 是一個基於 **Next.js 14 (App Router)** 構建的**實體卡牌數位登錄與 3D 互動遊戲平台**。系統整合了 LINE 快速登入、實體卡牌 QR-code 掃描、AWS DynamoDB 資料庫，以及多個使用 React Three Fiber (Three.js) 和 Rapier 物理引擎打造的 3D WebGL 互動遊戲。

---

## 🌟 核心特色

1. **LINE 快速登入整合**：流暢的 LINE OAuth 驗證，快速綁定使用者帳戶與其數位卡包。
2. **實體卡牌數位登錄**：透過鏡頭（利用 ZXing Library）掃描實體卡牌上的 QR-code，即可將卡牌永久綁定至玩家的「數位星際圖鑑」並增加入帳點數。
3. **個人星際儀表板**：登入後可查看個人點數、盲盒抽獎券、已被綁定的卡牌進度（五大屬性、稀有度等）以及背包（Inventory）中的盲盒戰利品。
4. **卡牌獎勵兌換系統**：達成特定的圖鑑收集門檻後，系統會自動解鎖對應等級的獎勵（探索小禮、科學中禮、領航大禮、SSR 傳說卡大獎）。
5. **後台管理系統**：
   - **實體卡列印引擎 (`/print-cards`)**：自動產出包含專屬 QR-code 的卡牌排版頁面，供官方列印成實體閃卡。
   - **管理控制台 (`/admin`)**：使用者管理、卡牌屬性設定、LINE 登入設定維護、商戶設定與問卷維護。

---

## 🎮 內建互動遊戲

系統內建了六種風格迥異的 2D/3D 互動遊戲，旨在增強玩家在集卡與點數消耗過程中的娛樂體驗：

1. **跳豆機 (Bounce Bean Physics Game - `/tiao-dou-ji`)**  
   基於 React Three Fiber 3D 渲染與 Rapier 3D 物理引擎。玩家控制發射力道，將 3D 跳豆射入帶有振動特性的物理碰撞盒中，進行物理反彈與落點結算。
   
2. **大女神 (3D Dice Shaker - `/da-nu-shen`)**  
   使用 3D 物理骰子模型與骰盅。玩家可以模擬搖晃骰盅，擲出隨機點數的 3D 骰子，測試好運氣。

3. **九宮格 (Jiu Gong Ge - `/jiu-gong-ge`)**  
   結合 3D 球體與骰子投擲的網格九宮格碰撞遊戲，內含風向與發射力道控制，考驗玩家操作。

4. **消除符石對抗賽 (Battle Arena - `/test-game`)**  
   經典五屬性符石消除益智遊戲（致敬神魔之塔/龍族拼圖）。消除火、水、木、光、暗與心靈符石，計算 COMBO 連擊與戰隊傷害，並設有即時排行榜挑戰。

5. **3D 模擬城市 (3D City Simulator - `/city-game`)**  
   包含 3D 城市地形、交通流量與車輛物理生成。玩家可以駕駛載具在 procedural 城市中漫遊，配合虛擬手機 (Phone UI) 與市政廳 (Town Hall UI) 互動。

6. **刮刮樂 (Scratch Card - `/scratch-card`)**  
   使用 Canvas 畫布遮罩與擦除技術，提供逼真的刮刮樂體驗，刮開銀漆即可獲得隨機集卡點數或盲盒券。

---

## 🖼️ 系統頁面與遊戲示意圖 (Previews & Mockups)

以下為本平台之目前頁面與遊戲互動畫面截圖（已存於 `public/` 目錄中）：

### 🖥️ 首頁與圖鑑系統

| 頁面 | 畫面預覽 |
| :--- | :--- |
| **首頁儀表板 & 動態輪播圖** <br> 包含最新消息、首頁大圖、COMBO 模擬器 | ![首頁](./public/home.png) |
| **宇宙圖鑑 (Card Collection)** <br> 展示已收集與未收集的星際卡牌及屬性 | ![宇宙圖鑑](./public/collection.png) |
| **積分排行榜 (Leaderboard)** <br> 實時拉取玩家積分排名 | ![排行榜](./public/leaderboard.png) |

### 🕹️ 遊戲畫面預覽

| 遊戲 | 畫面預覽 |
| :--- | :--- |
| **跳豆機 (3D Bounce Bean)** <br> 3D 物理反彈發射與碰撞模擬 | ![跳豆機](./public/tiao_dou_ji_page.png) |
| **大女神 (3D Dice Shaker)** <br> 3D 骰盅搖骰體驗 | ![大女神骰子](./public/da_nu_shen_page.png) |
| **九宮格 (Jiu Gong Ge)** <br> 網格球體投擲與風力控制 | ![九宮格](./public/jiu_gong_ge_page.png) |
| **消除符石對抗賽 (Battle Arena)** <br> 消除符石引爆連擊，傷害排行榜挑戰 | ![消除符石對抗賽](./public/test-game.png) |
| **3D 模擬城市 (3D City Simulator)** <br> 3D 載具駕駛與城市漫遊 | ![3D 模擬城市](./public/city_game_page.png) |
| **刮刮樂 (Scratch Card)** <br> 刮除塗層取得盲盒戰利品 | ![刮刮樂](./public/scratch_card_page.png) |

---

## 🛠️ 開發技術棧 (Tech Stack)

- **核心框架**: Next.js 14.2.35 (App Router, React 18)
- **程式語言**: TypeScript
- **樣式與動畫**: Tailwind CSS, Framer Motion, Lucide Icons, Radix UI
- **3D 與物理引擎**: 
  - Three.js (`three`)
  - React Three Fiber (`@react-three/fiber`)
  - Drei (`@react-three/drei`)
  - Rapier 3D 物理引擎 (`@react-three/rapier`, `@dimforge/rapier3d-compat`)
- **QR-Code 掃描**: `@zxing/library`, `@zxing/browser`
- **資料庫與驗證**: NextAuth (LINE Provider), `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`
- **測試工具**: Playwright E2E Testing

---

## 🚀 快速啟動 (Getting Started)

### 1. 安裝依賴項目
```bash
npm install
```

### 2. 設定環境變數
將 `.env.local.example` 複製並命名為 `.env.local`：
```bash
cp .env.local.example .env.local
```
並填入對應的 LINE 登入 Channel ID/Secret、NextAuth Secret 以及 AWS DynamoDB 存取金鑰。

### 3. 初始化資料庫資料表
```bash
node scripts/create-tables.mjs
```

### 4. 啟動開發伺服器
```bash
npm run dev
```
打開瀏覽器至 [http://localhost:3000](http://localhost:3000) (或終端顯示之連接埠) 即可開始體驗！
