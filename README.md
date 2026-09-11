# 🤖 Akade Point + ARIP + IoT Control Center

**星際機器人宇宙 ․ 集卡遊戲平台 + 企業級 IoT 監控系統 + AI機器人整合系統**

Akade Point 是一個**三引擎全棧應用**：
1. **消費端（Akade Point）** - 玩家掃卡集點、挑戰9款遊戲、換獲獎勵
2. **IoT Control Center** - 實體設備（販賣機/機台）即時監控與樓層平面圖編輯器
3. **操作端（ARIP）** - AI機器人、IoT設備、工作流、視覺管理平台原型

---

## 🎮 系統總覽

### Akade Point（消費者應用）
- 🎯 **掃卡集點**：QR-Code 實體卡→數位圖鑑
- 🎮 **9款遊戲**：消除符石對抗賽、3D跳豆機、3D模擬城市（含FPV無人機賽道）、3D骰子大女神、3D投擲九宮格、刮刮樂、方塊世界、船舶雷達監控台、沙漠神殿拉霸機
- 📊 **即時排行榜**：社群積分實時排名
- 🎁 **自動獎勵**：圖鑑進度 30%/60%/90%/100% 解鎖獎品

### IoT Control Center（企業監控端）
- 🖥️ **Dashboard** - 聚合 KPI、店家/機台狀態總覽
- 🗺️ **Control Center Editor** - 拖拉式樓層平面圖編輯器（機台、區域、攝影機、地圖等圖層元件）
- 🖴 **Machines** - 機台清單、狀態（online/warning/alarm/offline）、電流/開門警報閾值
- 🚨 **Alerts** - 即時警報列表
- 🕐 **History** - 機台事件歷史紀錄
- 📈 **Analytics** - 數據分析儀表板
- 🏬 **Store Management** - 店家/品牌/分組管理
- 👥 **Users** - 使用者管理
- ⚙️ **Settings** - 店家設定、佈局版本管理

### ARIP（AI Robotics Integration Platform，原型）
- 📱 **Device Manager** - 管理 ESP32、Pixhawk、無人機、機器人、攝像頭、感測器
- 🚁 **Fleet Manager** - 編隊無人機、AGV、機器人
- ⚡ **Workflow** - Node-RED 工作流引擎（支援多提供商：n8n、Kestra、Flowise）
- 🤖 **AI Agent** - OpenAI、Claude、Gemini、Ollama 整合
- 👁 **Vision** - YOLO、OpenCV、OCR、即時偵測追蹤
- 📍 **GIS/Map** - MapLibre 艦隊地圖、地理圍欄、任務規劃
- 🔄 **Event Bus** - Redis Pub/Sub + MQTT 訊息母線

---

## 📁 專案結構

```
akade-point/
│
├─ 【消費端 - Akade Point】
│  ├── app/(app)/                    # 認證玩家頁面
│  │   ├── profile/                 # 個人檔案 & 積分
│  │   ├── collection/              # 卡牌圖鑑
│  │   ├── leaderboard/             # 排行榜
│  │   └── game/[sessionId]/         # 遊戲記錄 & 驗證
│  │
│  ├── app/games/                   # 遊戲大廳 + 9 款遊戲頁面
│  │   ├── combo-arena/            # 消除符石對戰 (Pixi.js)
│  │   ├── tiao-dou-ji/            # 跳豆機 (3D物理+Rapier)
│  │   ├── city-game/              # 3D城市駕駛 (程序生成 + FPV無人機賽道)
│  │   ├── da-nu-shen/             # 大女神 (3D骰子)
│  │   ├── jiu-gong-ge/            # 九宮格 (投擲+風向)
│  │   ├── scratch-card/           # 刮刮樂 (Canvas)
│  │   ├── minecraft/              # 方塊世界 (體素沙盒)
│  │   ├── ship-tracker/           # 船舶雷達監控台 (PPI 掃描 + ARPA + AIS)
│  │   └── temple-of-desert-god/   # 沙漠神殿拉霸機 (PixiJS)
│  │       └── README.md           # 拉霸機架構/狀態機文件
│  │
│  ├── app/admin/                   # 後台管理
│  │   ├── cards/                  # QR-Code 卡牌管理
│  │   ├── users/                  # 玩家管理
│  │   ├── shops/                  # 店家碼管理
│  │   ├── questionnaire-maintenance/  # 問卷維護
│  │   ├── knowledge-base/         # AI 推薦知識庫
│  │   └── line-auth-settings/     # LINE 登入設定
│  │
│  ├── backend/                     # Python FastAPI（選用的光學辨識分頁）
│  │   ├── core/detector.py        # YOLOv8 船隻偵測
│  │   ├── core/tracker.py         # 影像像素座標追蹤
│  │   ├── core/matcher.py         # 影像方位 → AIS 數據匹配
│  │   └── backend.py              # FastAPI + WebSocket + MJPEG
│  │
│  ├── components/                  # React 元件庫（依遊戲/功能分資料夾）
│  │   ├── city-game/, ship-tracker/, minecraft/, dice-game/,
│  │   │   scratch-card/, temple-of-desert-god/, jiu-gong-ge/, cards/, ...
│  │
│  ├── lib/                         # 工具函式
│  │   ├── auth/                   # NextAuth + LINE OAuth
│  │   ├── dynamo/                 # DynamoDB 操作 (含 cc-* 系列)
│  │   ├── game/                   # 遊戲邏輯
│  │   ├── scratch-card/           # 刮刮樂邏輯
│  │   └── temple-of-desert-god/   # 拉霸機引擎 (RNG/Payline/Cascade/Bonus)
│  │
│  └── store/                       # Zustand 狀態管理
│      ├── useSlotStore.ts         # 老虎機狀態
│      ├── useScratchCardStore.ts  # 刮刮樂狀態
│      └── ...
│
├─ 【企業監控端 - IoT Control Center】
│  │
│  ├── app/(control-center)/iot-control-center/
│  │   ├── layout.tsx              # 側邊欄殼層
│  │   ├── page.tsx                # Dashboard
│  │   ├── editor/                 # 樓層平面圖編輯器
│  │   ├── machines/               # 機台清單
│  │   ├── alerts/                 # 警報列表
│  │   ├── history/                # 事件歷史
│  │   ├── analytics/              # 數據分析
│  │   ├── stores/                 # 店家/品牌管理
│  │   ├── users/                  # 使用者管理
│  │   └── settings/               # 店家設定 & 佈局版本
│  │
│  ├── app/api/control-center/      # Control Center API Routes
│  │   ├── events/, alerts/        # 皆含 batch/ 端點（即時模式批次寫入）
│  │   └── machines/, stores/, brands/, groups/,
│  │       maintenance-records/, store-settings/, layout-versions/
│  │
│  ├── components/control-center/
│  │   ├── shell/                  # 側邊欄/頁面殼層
│  │   ├── canvas/                 # 平面圖編輯器（Toolbar、LayoutEditor、版本選單）
│  │   ├── dashboard/, machines/, alerts/, history/, analytics/,
│  │   │   stores/, settings/, drawer/, shared/
│  │
│  └── lib/
│      ├── control-center/         # 常數、型別、幾何運算、模擬、API client
│      └── dynamo/cc-*.ts          # machines / stores / brands / groups /
│                                    # alerts / machine-events / maintenance /
│                                    # store-settings / layout-versions
│                                    # 事件與警報走 GSI 查詢 + TTL，不做全表掃描
│
├─ 【操作端 - ARIP】
│  │
│  ├── app/(arip)/                  # ARIP 操作員儀表板
│  │   ├── layout.tsx              # 暗色主題側邊欄佈局
│  │   ├── dashboard/              # 聚合狀態卡片
│  │   ├── devices/                # Device Manager
│  │   ├── fleet/                  # Fleet Manager
│  │   ├── workflows/              # Workflow 列表 + Node-RED iframe
│  │   │   └── [id]/              # Workflow 詳情 (嵌入編輯器)
│  │   ├── ai/                     # AI Agent Manager
│  │   ├── vision/                 # Vision Pipeline
│  │   └── events/                 # Event Log (實時流)
│  │
│  ├── components/arip/             # ARIP UI 元件
│  │
│  ├── arip/                        # ARIP 單體應用
│  │   ├── backend/                # NestJS 後端 (port 3001)
│  │   │   └── src/
│  │   │       ├── main.ts         # Fastify 啟動 + Swagger
│  │   │       ├── config/         # 環境設定
│  │   │       └── modules/        # device / fleet / workflow / ai /
│  │   │                            # vision / event-bus / plugin
│  │   ├── sdk/                    # 跨平台 SDK (Provider 介面型別定義)
│  │   └── infra/                  # mosquitto / postgres / nodered 設定
│  │
│  └── docker-compose.arip.yml      # 6 服務堆疊
│      # 服務: PostgreSQL, Redis, Mosquitto, MinIO, Node-RED, NestJS
│
├── public/                         # 靜態資源 & 預覽圖
├── scripts/                        # create-tables.mjs 等初始化指令
├── tsconfig.json                   # Next.js TS 設定 (排除 ARIP)
├── package.json                    # 根部依賴
├── next.config.mjs                 # Next.js 設定（含舊遊戲路由 301 轉址至 /games/*）
├── docker-compose.arip.yml         # ARIP Docker 堆疊
├── .env.arip.example               # ARIP 環境變數範本
└── .env.local                      # 本地設定
```

---

## 🛠️ 技術棧

| 層級 | Akade Point | IoT Control Center | ARIP |
|:---|:---|:---|:---|
| **前端** | Next.js 14, React 18, TypeScript | Next.js 14 + TailwindCSS | Next.js 14 + TailwindCSS (暗色主題) |
| **3D/遊戲** | Three.js, React Three Fiber, Rapier 3D, Pixi.js | — | — |
| **後端** | Next.js API Routes, NextAuth.js (LINE) | Next.js API Routes | NestJS 10 + Fastify |
| **資料庫** | AWS DynamoDB | AWS DynamoDB (`akade-cc-*`)，開發期可用 DynamoDB Local | PostgreSQL 16 + TypeORM |
| **狀態管理** | Zustand | Zustand (透過 API Routes 讀寫 DynamoDB) | — |
| **快取/訊息** | — | — | Redis 7 (Pub/Sub + 快取) |
| **IoT/裝置** | — | 機台遙測（電流/開門/心跳警報） | MQTT (Mosquitto) + 裝置遙測 |
| **檔案存儲** | — | — | MinIO (S3 相容) |
| **Workflow** | — | — | Node-RED (+ 多提供商支援) |
| **虛擬化** | Docker (可選) | — | Docker Compose (6 服務) |
| **部署** | AWS Amplify | AWS Amplify | ECS / 容器 (待定) |

---

## 🚀 快速啟動

### 前置要求
- Node.js 18+
- npm 或 yarn
- Python 3.10+（船隻追蹤後端）
- Docker & Docker Compose (ARIP 需要)
- AWS 帳號 (DynamoDB - Akade Point / Control Center)
- LINE Developers 帳號 (LINE OAuth)

### 1️⃣ 安裝與設定

```bash
# Clone 倉庫
git clone <repo-url>
cd akade-point

# 安裝根部 + Akade Point + Control Center 依賴
npm install

# 安裝 ARIP 後端依賴
cd arip/backend && npm install && cd ../..

# 複製環境變數
cp .env.local.example .env.local
cp .env.arip.example .env.arip
```

編輯 `.env.local` 和 `.env.arip` 填入：
- LINE Channel ID/Secret
- NextAuth Secret
- AWS 憑證
- Database URL (ARIP)

### 2️⃣ 啟動 Akade Point / Control Center（消費端 + 監控端共用 Next.js App）

```bash
# 初始化 DynamoDB 表格（首次，含 akade-cc-* Control Center 表格）
# 這支腳本同時會開啟 machine-events / alerts 兩張表的 TTL（expiresAt），
# 可重複執行：已存在的表格與已開啟的 TTL 都會跳過。
node scripts/create-tables.mjs

# （可選）改用本機 DynamoDB，不連 AWS：
#   node scripts/start-dynamodb-local.mjs
#   DYNAMODB_LOCAL_ENDPOINT=http://localhost:8500 node scripts/create-tables.mjs
#   並在 .env.local 設定 DYNAMODB_LOCAL_ENDPOINT=http://localhost:8500

# 啟動開發伺服器 (Next.js port 3000 + Python FastAPI port 8000，並行執行)
npm run dev
```

訪問：
- **遊戲大廳** [http://localhost:3000/games](http://localhost:3000/games)
- **IoT Control Center** [http://localhost:3000/iot-control-center](http://localhost:3000/iot-control-center)

### 3️⃣ 啟動 ARIP（操作端）

```bash
# 啟動 Docker 基礎設施 (PostgreSQL, Redis, Mosquitto, MinIO, Node-RED)
docker compose -f docker-compose.arip.yml up -d

# 驗證服務
docker compose -f docker-compose.arip.yml ps

# 啟動 NestJS 後端 (port 3001)
cd arip/backend && npm run start:dev

# 在另一個終端啟動 Next.js 前端
npm run dev
```

訪問：
- **ARIP 儀表板** [http://localhost:3000/arip/dashboard](http://localhost:3000/arip/dashboard)
- **Swagger API 文件** [http://localhost:3001/api/docs](http://localhost:3001/api/docs)
- **Node-RED 編輯器** [http://localhost:1880](http://localhost:1880)

### 可用指令

```bash
# Akade Point / Control Center
npm run dev               # Next.js 開發伺服器 + Python FastAPI（並行）
npm run dev:next          # 僅啟動 Next.js 開發伺服器
npm run build             # 生產構建
npm run start             # 啟動生產伺服器
npm run lint              # ESLint 檢查
npm run test              # Vitest 單元測試
npm run format            # Prettier 格式化
npm run format:check      # Prettier 檢查（不寫入）

# ARIP Backend
cd arip/backend
npm run start:dev         # NestJS 開發模式
npm run build             # 生產構建
npm run typecheck         # 型別檢查

# ARIP Infrastructure
docker compose -f docker-compose.arip.yml up -d    # 啟動
docker compose -f docker-compose.arip.yml down     # 停止
docker compose -f docker-compose.arip.yml logs -f  # 查看日誌
```

---

## 🎮 Akade Point 核心功能

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
- 卡牌 QR-Code 生成與印刷
- 玩家管理與統計
- 店家碼管理
- 問卷維護 & AI 推薦引擎（知識庫 `app/admin/knowledge-base`）

---

## 🖥️ IoT Control Center 核心功能

Enterprise IoT Control Center 原型：針對實體設備（販賣機/機台等）的即時監控與樓層平面圖管理。

### Dashboard
- 聚合 KPI 卡片、店家/機台狀態列表

### Control Center Editor（`/iot-control-center/editor`）
- 拖拉式樓層平面圖畫布，支援機台、文字、矩形、圓形、箭頭、區域、攝影機、圖片、計數器、地圖、分隔線等 widget
- 分層群組管理（背景/區域/機台/文字/疊加層），Undo/Redo（上限 50 步）
- 縮放（0.2×–3×）、網格對齊、佈局版本歷史（每店最多保留 20 版）

### Machines
- 機台狀態：online / warning / alarm / offline
- 電流警報閾值：警告 8.5A、警報 11A
- 開門超時警報（30 秒）、心跳離線判定（15 秒無回報）

### Alerts / History / Analytics
- 即時警報列表、機台事件歷史、數據分析儀表板

### Store Management / Users / Settings
- 店家、品牌、分組管理；使用者管理；店家設定與佈局版本控制

### 資料儲存
- 正式環境：AWS DynamoDB（`akade-cc-brands`、`akade-cc-stores`、`akade-cc-groups`、`akade-cc-machines`、`akade-cc-machine-events`、`akade-cc-alerts`、`akade-cc-maintenance-records`、`akade-cc-store-settings`、`akade-cc-layout-versions`）
- 開發期：Zustand persist 透過 `app/api/control-center/storage` 寫入本地 JSON（`data/control-center/*.json`），為真實資料庫串接前的暫代方案

---

## 🤖 ARIP 核心功能

### Device Manager
- ESP32, Arduino, Pixhawk, 無人機, 機器人, AGV 登錄
- MQTT 心跳檢測 & 離線警報
- OTA 韌體更新
- 即時遙測（電池、GPS、溫度等）

### Fleet Manager
- 無人機編隊組織
- 集中命令下達
- 聚合狀態檢查
- 任務協調

### Workflow Engine (Node-RED)
- 拖拽式工作流設計
- 支援多提供商適配器（n8n、Kestra、Flowise 預留）
- 版本控制 & 歷史追蹤
- Webhook 觸發 & 事件驅動

### AI Agent Manager
- OpenAI, Claude, Gemini, Ollama, Azure 整合
- 工具調用 & 函數執行
- 記憶 & RAG 支援
- 多代理協調

### Vision Pipeline
- YOLO 物件偵測
- 實時追蹤
- OCR & 條碼識別
- IP 攝像頭流接入

### Event Bus
- Redis Pub/Sub 內部通訊
- MQTT 裝置遙測橋接
- 事件聚合與回放

---

## 📝 架構原則

**Akade Point** (消費端)
- ✅ 高度簡化的玩家體驗
- ✅ 實時動畫與遊戲物理
- ✅ 社群排行榜與獎勵驅動

**IoT Control Center** (監控端)
- ✅ 元件化 Widget 系統（型別 → 預設圖層 → 渲染器）
- ✅ 樂觀更新 + 版本快照，佈局變更可回溯
- ✅ 開發/正式儲存介面分離，方便未來換底層資料庫

**ARIP** (操作端)
- ✅ **Provider Pattern** - 所有廠商能力可替換
- ✅ **事件驅動架構** - 模組只通過事件溝通
- ✅ **API First** - REST + WebSocket + gRPC (預留)
- ✅ **Microservice Ready** - NestJS 可獨立擴展

---

## 🔐 環境變數

### Akade Point / Control Center (`.env.local`)
```env
# LINE OAuth
NEXT_PUBLIC_LINE_CHANNEL_ID=your_channel_id
LINE_CHANNEL_SECRET=your_secret

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_secret_key

# AWS DynamoDB
AWS_REGION=ap-northeast-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret

# Ship Tracker：光學辨識分頁使用的 Python FastAPI 後端（選用）
NEXT_PUBLIC_SHIP_TRACKER_BACKEND_URL=http://localhost:8000

# Ship Tracker：真實 AIS 資料來源（選用，未設定時雷達仍以模擬資料運作）
# 免費金鑰申請：https://aisstream.io
AISSTREAM_API_KEY=your_aisstream_key
```

### ARIP (`.env.arip`)
```env
# NestJS
ARIP_PORT=3001
NODE_ENV=development

# Database
DATABASE_URL=postgresql://arip:arip@localhost:5432/arip
REDIS_URL=redis://localhost:6379

# MQTT
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_CLIENT_ID=arip-backend-bridge

# MinIO
MINIO_ENDPOINT=localhost
MINIO_ACCESS_KEY=arip_minio
MINIO_SECRET_KEY=arip_minio_secret

# Node-RED
NODE_RED_BASE_URL=http://localhost:1880
NODE_RED_API_KEY=your_api_key
```

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
