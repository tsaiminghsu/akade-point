# 網頁地面站（Vehicles GCS）

`/iot-control-center/vehicles/[id]` 是每台載具的地面站，參考 Mission Planner 的畫面分工，再加上社群常提的實用功能。車隊頁（`/iot-control-center/vehicles`）有總覽地圖與清單，點任一台進入它的地面站。

程式位置：
- 頁面：`components/control-center/vehicles/gcs/`
- 狀態與鏈路：`store/useGcsStore.ts`、`lib/control-center/vehicles/link/`
- 純函式：`lib/control-center/vehicles/gcs/`（HUD 幾何、健康燈號、警示、圖磚、地理計算）

## 兩條鏈路

| | 雲端（Cloud） | 直連（Direct） |
|:--|:--|:--|
| 路徑 | 瀏覽器 → Control Center `/live`（每秒輪詢）← companion HTTPS | 瀏覽器 ⇄ companion WebSocket |
| 更新率 | 約 1 Hz | 10 Hz |
| 用途 | 任何地方（4G）監看與下指令 | 近距離或 VPN；搖桿、連續雲台控制只走這條 |
| 需要 | 登入 Control Center | 載具「設定」頁填直連網址，companion 設定 `[direct]` |

- **自動選擇**：直連新鮮時用直連，否則退回雲端。
- **狀態列分開顯示**：瀏覽器鏈路（直連/雲端/斷線）與「FC」（Pi ⇄ 飛控心跳年齡）。
- **過期門檻**：直連 1.5 s、雲端 5 s，都加了遲滯，避免 4G 抖動時 LINK LOST 反覆閃爍。
- **斷線時**：HUD 變灰、顯示 LINK LOST，指令按鈕全部停用。
- **直連驗證**：
  - 網頁向 Control Center 取一張 15 分鐘的票證（`POST /api/control-center/vehicles/[id]/direct-ticket`），當作 WebSocket 第一則訊息送出。
  - 票證以每台載具的金鑰 HMAC 簽署；金鑰由 `VEHICLE_DIRECT_SIGNING_KEY`（未設時用 `NEXTAUTH_SECRET`）+ vehicleId + tokenId 衍生。
  - 產生 device token 時，設定檔片段會一併帶出 `[direct] ticket_key`；重發 token 就會換金鑰。
- **瀏覽器限制**：
  - HTTPS 頁面只能連 `wss://`，建議在 Pi 上 `tailscale serve --bg --https=443 http://127.0.0.1:8765`。
  - 從公開網站連到區網或 Tailscale 位址時，Chrome 可能跳出「存取區域網路裝置」的授權，要按允許。
  - 「設定」頁會顯示直連失敗的原因。
- **稽核**：直連下的指令由 companion 記錄，下一次雲端遙測時補寫進指令紀錄（`via: "direct"`）。

## 飛行資料頁籤

- **HUD**：
  - 地平線、俯仰刻度、滾轉弧、對地速度帶、高度帶、爬升率、航向帶。
  - 模式與解鎖狀態、電池/GPS。
  - 第一條 PreArm 失敗訊息（和 MP 一樣）。
  - 舊版 companion（契約 v1）沒有姿態資料，會標示「無姿態資料」。
- **狀態列**：鏈路、FC、GPS（fix/衛星/HDOP）、電池（總電壓、每芯電壓、%）、EKF、震動、RC/數傳 RSSI、Pi 溫度與欠壓、PreArm、其他 GCS。
  - 燈號門檻在 `gcs/health.ts`：EKF 0.5/0.8、震動 30/60 m/s²、每芯 3.6/3.45 V。
  - 類比電流計只量得到總電壓，每芯電壓前面會加 `~`，表示是平均值。
- **數值**：大字的高度、速度、爬升率、距 Home、距航點、電壓/電流/mAh、航向、油門、風。Rover 另外顯示偏航誤差。
- **動作**：
  - 必須先打開「取得控制權」才能下指令，避免觀看者誤觸。
  - 模式切換（Copter/Rover 完整模式表，PX4 基本）。
  - **滑動解鎖**：PreArm 未通過時停用。
  - 上鎖；**強制上鎖**要另開對話框並輸入 `DISARM`。
  - RTL、Brake/Hold、降落、PreArm 檢查。
  - 起飛、改速度、改高度（起飛與改高度要確認）。
  - 任務開始/暫停/繼續、跳到第 N 點。
  - 重開飛控（僅上鎖時）。
  - 下方是指令紀錄，標示經雲端或直連。
- **訊息**：STATUSTEXT 依嚴重度上色；頂端列出**所有**目前未通過的 PreArm 項目，不只第一條。
- **圖表**：最近 5 分鐘的即時曲線，可選高度、速度、電壓、每芯、電流、姿態、震動、EKF、衛星數。
- **駕駛（Rover）**：
  - 畫面搖桿或遊戲手把左搖桿。
  - 經直連以 10 Hz 送出 GUIDED 速度與轉向率；放開搖桿就送 0。
  - companion 超過 0.3 s 沒收到指令會自動送停車；ArduPilot 本身 3 s 沒指令也會停。

## 地圖

- **底圖**：國土測繪中心正射影像（預設）、通用版電子地圖、Esri 衛星、OSM。
- **圖層內容**：載具圖示（依航向旋轉）、軌跡、Home、GUIDED 目標與連線。
- **右鍵或長按**：飛到/開到這裡（確認高度）、設為 Home、量距離與方位；「雲台看這裡」在雲台里程碑啟用。
- **離線圖磚**：
  - `public/tile-sw.js` 以 cache-first 快取看過的圖磚，範圍限在 `/iot-control-center/vehicles/`。
  - 國土測繪圖層可以「預抓此區」，一次最多 3000 張。
  - OSM 與 Esri 的使用條款不允許大量預抓，所以只做被動快取。
  - 所有圖磚來源都支援 CORS，快取存的是真實回應，不是 opaque 回應。

## 語音警示

- 按「語音開」後，用瀏覽器的 Web Speech API 以目前語系播報（瀏覽器規定要先有使用者點擊）。
- **播報時機**：模式變更、解鎖/上鎖、電池偏低/危險、連線中斷/恢復、飛控無回應、GPS 不良、EKF 異常、震動過高、超出圍籬，以及嚴重度 CRITICAL 以上的 STATUSTEXT（例如 failsafe）。
- **防誤報**：
  - 缺資料不會觸發或清除任何警示（避免 MP 的「電池 0 伏」誤報）。
  - 條件要持續一段時間才播報：電池 5 s、其他 3 s。
- 語音關閉時仍會跳出畫面提示。
