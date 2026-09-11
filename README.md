# 🤖 Akade Point

**星際機器人宇宙 ․ 掃碼集卡 × 積分 × 遊戲大廳**

玩家掃描實體卡牌上的 QR-Code 登錄數位圖鑑、累積點數與抽獎券，依收集進度解鎖獎勵，
並在 9 款互動遊戲中挑戰排行榜。LINE 快速登入，AWS Amplify 部署。

> **這個 repo 曾經同時裝著三套系統。** IoT Control Center 與 ARIP 已各自拆成獨立專案：
>
> | 專案 | 位置 | 內容 |
> |:---|:---|:---|
> | **IoT Control Center** | `D:\akade-iot-control-center` | 機台即時監控、樓層平面圖編輯器、警報／分析／歷史 |
> | **ARIP** | `D:\akade-arip` | AI Robotics Integration Platform（Next.js 控制台 + NestJS 後端） |
>
> 拆分前的完整快照留在 tag `pre-split`。Control Center 仍與本專案共用
> `akade-auth` / `akade-users` 兩張 DynamoDB 表（同一批 LINE 帳號、同一個 `isAdmin` 旗標），
> 其餘程式碼與資料表已完全分離。

---

## 🎮 系統總覽

- 🎯 **掃卡集點**：QR-Code 實體卡 → 數位圖鑑
- 🎮 **9 款遊戲**：消除符石對抗賽、3D 跳豆機、3D 模擬城市（含 FPV 無人機賽道）、3D 骰子大女神、3D 投擲九宮格、刮刮樂、方塊世界、船舶雷達監控台、沙漠神殿拉霸機
- 📊 **即時排行榜**：社群積分實時排名
- 🎁 **自動獎勵**：圖鑑進度 30%/60%/90%/100% 解鎖獎品
- 📋 **玩家偏好問卷 + 卡片知識庫**：問卷結果驅動個人化卡牌推薦

---

## 📁 專案結構

```
akade-point/
│
├── app/
│   ├── page.tsx                   # 活動首頁（輪播、個人儀表板、精選卡牌）
│   ├── (app)/                     # 認證玩家頁面
│   │   ├── scan/                  # QR-Code 掃描登錄
│   │   ├── collection/            # 卡牌圖鑑 + 領獎
│   │   ├── game/[sessionId]/      # 領獎消除遊戲（含 provably-fair 驗證）
│   │   ├── leaderboard/           # 排行榜
│   │   ├── profile/               # 個人檔案 & 積分
│   │   ├── questionnaire/         # 玩家偏好問卷
│   │   └── register/              # 卡片註冊流程
│   ├── games/                     # 遊戲大廳 + 9 款遊戲頁面
│   ├── admin/                     # 後台：卡牌、店家、玩家、問卷維護、知識庫、LINE 設定
│   ├── api/                       # Route Handlers（auth / cards / collection / game / user / admin / ais）
│   ├── login/                     # LINE 登入
│   └── print-cards/               # 卡牌 QR-Code 印刷版面
│
├── components/                    # cards, game, layout, ui/rarity-badge + 各遊戲元件
├── lib/                           # auth, dynamo, game(公平性/消除/倍率), maintenance(知識庫), utils
├── store/                         # Zustand：問卷、刮刮樂、拉霸
├── backend/                       # 船舶雷達的 Python FastAPI／YOLO 後端（選用）
├── scripts/                       # create-tables.mjs、set-admin.mjs、start-dynamodb-local.mjs
├── card.js                        # 刮刮樂卡面產生器
└── next.config.mjs                # 含舊遊戲路由 301 轉址至 /games/*
```

---

## 🛠️ 技術棧

| 層級 | 技術 |
|:---|:---|
| **前端** | Next.js 14（App Router）, React 18, TypeScript, TailwindCSS |
| **3D／遊戲** | Three.js, React Three Fiber, Rapier 3D, Pixi.js, HTML5 Canvas |
| **後端** | Next.js Route Handlers, NextAuth.js（LINE Provider） |
| **資料庫** | AWS DynamoDB（開發期可用 DynamoDB Local） |
| **狀態管理** | Zustand |
| **掃碼** | ZXing.js |
| **測試** | Vitest |
| **部署** | AWS Amplify |

---

## 🚀 快速啟動

### 前置要求
- Node.js 18+
- AWS 帳號（DynamoDB）或本機 DynamoDB Local（需 JRE）
- LINE Developers 帳號（LINE OAuth）
- Python 3.10+（**選用**，僅船舶雷達的光學辨識分頁需要）

### 安裝與啟動

```bash
npm install --legacy-peer-deps
cp .env.local.example .env.local     # 填入 LINE / NextAuth / AWS 設定

# 初始化 DynamoDB 表格（可重複執行，已存在的會跳過）
node scripts/create-tables.mjs

# （可選）改用本機 DynamoDB，不連 AWS：
#   node scripts/start-dynamodb-local.mjs
#   DYNAMODB_LOCAL_ENDPOINT=http://localhost:8500 node scripts/create-tables.mjs
#   並在 .env.local 設定 DYNAMODB_LOCAL_ENDPOINT=http://localhost:8500

npm run dev          # Next.js :3000 + Python FastAPI :8000 + DynamoDB Local（並行）
npm run dev:next     # 只啟動 Next.js
```

> `--legacy-peer-deps` 是必要的：`@react-three/rapier@2.2.0` 宣告的 peer 是
> `@react-three/fiber@^9`，但 `@react-three/drei@9` 需要 fiber 8，專案因此鎖在 fiber 8。
> 這個衝突在拆分之前就存在。

訪問 [http://localhost:3000](http://localhost:3000)；遊戲大廳在 `/games`。

第一位管理員需要直接寫 DynamoDB（admin API 本身要求已是 admin）：先用 LINE 登入一次讓
使用者記錄建立，再執行 `node scripts/set-admin.mjs`。

### 可用指令

```bash
npm run dev               # Next.js + Python FastAPI + DynamoDB Local（並行）
npm run dev:next          # 僅啟動 Next.js
npm run build             # 生產構建
npm run start             # 啟動生產伺服器
npm run lint              # ESLint
npm run test              # Vitest 單元測試
npm run format            # Prettier 格式化
npm run format:check      # Prettier 檢查（不寫入）
```

---

## 🎮 核心功能

### 玩家系統
- **LINE 快速登入** - 無需註冊，一鍵認證
- **個人儀表板** - 積分、抽獎券、卡牌進度
- **卡牌圖鑑** - 5 大屬性 × 5 稀有度追蹤

### 掃卡集點
- ZXing.js 實時 QR-Code 掃描
- 自動更新圖鑑 & 積分
- 防重複掃描 & 交易記錄

### 獎勵兌換
- 30% → 探索小禮
- 60% → 科學中禮
- 90% → 領航大禮
- 100% → SSR 傳說卡大獎

領獎會開一場消除遊戲（`/game/[sessionId]`），採 provably-fair：開局先給 server seed 的
雜湊承諾，結束後可在 `/game/[sessionId]/verify` 驗證伺服器沒有事後換牌。

### 9 大遊戲

舊路由（如 `/city-game`）會 301 轉址至新的 `/games/*` 路由。

| 遊戲 | 路由 | 引擎 | 特性 |
|:---|:---|:---|:---|
| 消除符石對抗賽 | `/games/combo-arena` | Pixi.js | COMBO × 戰隊傷害 |
| 3D 物理跳豆機 | `/games/tiao-dou-ji` | R3F + Rapier | 物理發射 × 碰撞 |
| 3D 模擬城市 | `/games/city-game` | R3F 程序生成 | 開放世界 × 交通 AI × FPV 無人機賽道 |
| 3D 骰子大女神 | `/games/da-nu-shen` | R3F + Rapier | 搖晃骰盅 × 隨機點數 |
| 3D 投擲九宮格 | `/games/jiu-gong-ge` | R3F + Rapier | 網格投擲 × 風向 |
| 刮刮樂幸運發財券 | `/games/scratch-card` | HTML5 Canvas | 真實刮感 × 盲盒 |
| 方塊世界 | `/games/minecraft` | R3F 體素 | 建造/挖掘 × 飛行模式 |
| 船舶雷達監控台 | `/games/ship-tracker` | Canvas 2D PPI | 雷達回波模擬 × ARPA 追蹤 × CPA/TCPA 警報 |
| 沙漠神殿拉霸機 | `/games/temple-of-desert-god` | PixiJS v7 | 40 派線 × 連環消除 × Free Spin |

FPV 無人機賽道（3D 模擬城市內建功能）：3 條賽道、機首視角攝影機、重生點、加速衝刺、閘門穿越判定。

### 船舶雷達監控台 (`/games/ship-tracker`)

模擬一台真實的航海雷達，而不是把船的位置直接畫在地圖上。整條訊號鏈都在瀏覽器裡跑：

```
高雄港交通模擬 (船舶運動模型)
      │
      ▼
雷達感測器模型  天線旋轉掃描 → 雷達方程式判定偵測機率 → 方位/距離雜訊 → 海浪與雨雪雜波
      │            陸地遮蔽：旗津沙洲擋住港內，港內船舶只能靠 AIS 看到
      ▼
Alpha-Beta 追蹤器  每轉一圈做一次關聯與濾波 → 暫定/已確認/推算中 → 直線性檢驗剔除雜波
      │
      ▼
AIS 融合          把 AIS 身分套到雷達航跡上；沒有 AIS 的船維持「不明目標」
      │
      ▼
ARPA 解算         真/相對向量、CPA、TCPA、船首穿越距離、警戒區、碰撞警報
```

主要功能：

- **PPI 掃描畫面**：旋轉掃描線、回波餘輝、距離環、方位刻度、陸地回波、航跡尾跡
- **顯示模式**：北向上 / 船首向上 / 航向向上；相對運動 / 真運動向量
- **接收機調校**：增益、海浪抑制 (STC)、雨雪抑制 (FTC)。調過頭會出現真實的副作用：增益太高浮現雜訊，STC 太強會連近距離小船一起吃掉
- **ARPA**：目標清單、CPA/TCPA、方位不變判定、目標轉向偵測、可設定的警戒扇形區
- **本船操縱**：改變航向與航速，所有目標的避碰解算即時重算
- **資料來源**：預設為模擬；切換到「真實 AIS」時由 `app/api/ais/stream` 轉送 AISStream.io 的即時位置報告（需設定 `AISSTREAM_API_KEY`）
- **光學辨識分頁**：原本的 Python YOLOv8 攝影機偵測介面保留為第二個分頁，需要時才連線

船名與 MMSI 取自 2025-10-14 真實 AIS 快照（`backend/ais_data.json`）；該快照裡每艘船的航速都是 0，所以位置與航跡改由運動模型產生。

核心程式碼在 `components/ship-tracker/radar/`，幾何、追蹤器、ARPA 解算與繪圖都有單元測試（`npm test`）。


### 後台管理
- 卡牌 QR-Code 生成與印刷（`/admin/cards`、`/print-cards`）
- 玩家管理與統計
- 店家碼管理
- 問卷維護 & AI 推薦引擎（知識庫 `app/admin/knowledge-base`）
- LINE 登入設定（`/admin/line-auth-settings`）— 寫入 `akade-auth`，
  IoT Control Center 也讀這份設定

---

## 📝 架構原則

- ✅ 高度簡化的玩家體驗
- ✅ 實時動畫與遊戲物理
- ✅ 社群排行榜與獎勵驅動
- ✅ 獎勵遊戲可驗證公平（commit–reveal，`lib/game/provably-fair.ts`）

---

## 🔐 環境變數（`.env.local`）

```env
# LINE OAuth
LINE_CLIENT_ID=your-line-channel-id
LINE_CLIENT_SECRET=your-line-channel-secret

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_secret_key

# AWS DynamoDB
AWS_REGION=ap-northeast-1
# 部署在 Amplify 時由 IAM role 提供憑證，不需要金鑰
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret

# 本機 DynamoDB（選用）
# DYNAMODB_LOCAL_ENDPOINT=http://localhost:8500

# Ship Tracker：光學辨識分頁使用的 Python FastAPI 後端（選用）
NEXT_PUBLIC_SHIP_TRACKER_BACKEND_URL=http://localhost:8000

# Ship Tracker：真實 AIS 資料來源（選用，未設定時雷達仍以模擬資料運作）
# 免費金鑰申請：https://aisstream.io
AISSTREAM_API_KEY=your_aisstream_key
```

DynamoDB 表格：`akade-auth`、`akade-users`、`akade-cards`、`akade-registrations`、
`akade-sessions`、`akade-shops`、`akade-rewards`。

---

## 🤝 貢獻指南

遵循 Conventional Commits 格式：
- `feat:` 新功能
- `fix:` 錯誤修復
- `refactor:` 重構
- `docs:` 文件
- `test:` 測試

---

## 📝 授權

MIT License - 見 [LICENSE](./LICENSE)

---

**Made with ❤️ by Akade Team**
