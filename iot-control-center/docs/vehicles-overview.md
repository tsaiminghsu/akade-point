# 無人機／無人車模組（Vehicles）— 總覽

Control Center 的 Vehicles 模組讓管理員監控並控制掛載 **companion 板（樹莓派／ESP32）** 的無人機與無人車，與 **MissionPlanner** 共存，並整合 ArduPilot 的 MAVLink 協定。

本文件是模組的入口；細節見同資料夾的其他 `vehicles-*.md`。

## 目標與範圍

2026-09 起，每台載具有一個仿 Mission Planner 的**網頁地面站**（`/iot-control-center/vehicles/{id}`），操作見 [`vehicles-gcs.md`](./vehicles-gcs.md)。

| 頁籤 | 內容 |
|:---|:---|
| 飛行資料 | HUD、地圖、狀態列、快捷數值、動作、PreArm 訊息、即時圖表、語音警示 |
| 任務規劃 | 任務、圍欄、Rally，含測繪航線、續飛與上傳後比對 |
| 參數 | 含 ArduPilot 參數說明、比對與快照 |
| 日誌 | tlog 下載 |
| 設定 | 安全設定健檢、Token、直連與影像網址 |

另外還有：
- **雲台**：STorM32 經飛控控制。
- **影像**：MediaMTX WebRTC。
- **ESP32**：酬載節點、小車底盤、Remote ID 狀態。

**連線方式**：
- 雲端（HTTPS 1 Hz）與直連（瀏覽器 ⇄ Pi 的 WebSocket，10 Hz）兩條鏈路，自動擇優。
- 小車搖桿與雲台連續控制只走直連。

**與 MP 共存**：Pi 上的 mavlink-router 讓 Mission Planner/QGC 同時連線。

**不做，交給 MP**：校正、刷韌體、DataFlash 分析。

**尚未實作**：角色權限、多操作者租約、MAVLink2 簽章、地形、ADS-B、companion 當 MAVLink 相機。

## 系統架構

```
瀏覽器（地面站）──1Hz 輪詢──▶ GET /vehicles/{id}/live（狀態、STATUSTEXT、指令、伺服器時間）
               ──POST──────▶ /vehicles/{id}/commands            （寫入指令列＝pending）
               ──POST──────▶ /vehicles/{id}/direct-ticket        （直連票證）
               ══WebSocket══▶ 樹莓派 companion /ws（直連：10Hz 狀態、指令、搖桿、雲台串流、/files）
                                                        │ iot 模式：publish 到 MQTT → sent
樹莓派 companion ──1Hz POST──▶ /device/vehicles/telemetry ◀┘ 回應夾帶 pending 指令、伺服器時間
                ──POST──────▶ /device/vehicles/commands/{id}/ack
                ──GET/POST──▶ /device/vehicles/missions/…、/device/vehicles/params
樹莓派 companion ◀─UDP─ mavlink-router ◀─序列埠─ 飛控（＋STorM32、ESP32 酬載節點）
                        mavlink-router ─UDP─▶ Mission Planner / QGC
MediaMTX（Pi 相機）──WebRTC/WHEP──▶ 瀏覽器
```

## 關鍵設計決策

**A. 資料路徑：HTTPS 單一入口，IoT Core 只推指令。**
Amplify 上的 Next.js 無法常駐訂閱 MQTT，開發機也沒有 IoT Core。因此遙測、ack、任務全部走 HTTPS（device token），這條路徑在本機（DynamoDB Local）與正式環境完全相同；IoT Core 只在正式環境額外承載「指令推送」。不使用 Device Shadow 或 IoT Rule——它們需要額外的 AWS 設定，且伺服器每次仍得逐台 GetThingShadow，省不到事。

**B. 指令送達：MQTT 推送 + HTTPS 輪詢備援。**
發指令時先寫入指令列（`pending`）；`VEHICLE_TRANSPORT=iot` 時 publish 到 `vehicles/{companionId}/cmd`（QoS 1）成功即標 `sent`。此外，**每次遙測 POST 的回應都夾帶該載具尚未執行的指令**——這在本機模式是唯一送達管道（≤1s 延遲），在正式環境是 publish 失敗時的自動備援。companion 以 HTTPS 回報 ack。

**C. 本機開發不需 AWS。** `VEHICLE_TRANSPORT=local`（預設）時 `publishVehicleCommand` 直接回 `{published:false}`，指令改由遙測回應帶回。整個 SITL → companion → `next dev` + DynamoDB Local → 瀏覽器 的迴圈不需 AWS 帳號。

**D. 直連不經雲端。** 瀏覽器用伺服器簽發的短效票證（HMAC）直接連 Pi 的 WebSocket。頁面載入後，雲端或 4G 中斷也能繼續監控與下指令；直連送出的指令由 companion 記下，之後補寫雲端稽核。詳見 [`vehicles-gcs.md`](./vehicles-gcs.md) 與 [`vehicles-security.md`](./vehicles-security.md)。

**E. 缺資料顯示「—」，不顯示 0。** 契約 v2 的欄位在 MAVLink 訊息過期時為 `null`。資料過期時，地面站會停用飛行指令並顯示 LINK LOST；指令帶 `exp`，過期不執行。

## 名詞

- **vehicle**：一台無人機或無人車的紀錄，含 `companionId`（唯一，也是 IoT Thing 名稱）。
- **companion**：載具上的運算板（樹莓派／ESP32），跑橋接程式，一端接飛控（MAVLink），一端接雲端。
- **device token**：companion 向裝置端 API 認證用的 bearer token，格式 `vt_<tokenId>_<secret>`，只存雜湊，明碼僅顯示一次。
- **linkState**：由 `lastSeenAt` 推導的連線狀態（online <10s、stale <60s、offline），不儲存。

## 角色權限（規劃，尚未實作）

目前所有頁面與 API 都只檢查 `isAdmin`。文件 [`permissions.md`](./permissions.md) 提出四級角色矩陣（檢視者／操作員／門市管理員／系統管理員）。載具指令與任務屬「操作員」層級。程式中 `lib/vehicle-access.ts` 的 `requireVehicleAccess(action)` 是未來插入角色判斷的唯一位置。

## 後續輪次

- **驗證**：用 ArduPilot SITL 做完整驗證，接著實機驗證（Pixhawk、ArduPilot Rover、STorM32、兩支 ESP32 韌體）。
- **雲端與安全**：
  - IoT Core 遙測路徑（Device Shadow 或 IoT Rule），降低 HTTPS 輪詢成本。
  - 角色權限、多操作者控制權租約、MAVLink2 簽章。
- **地面站功能**：
  - companion 當 MAVLink 相機（測繪拍照 + 地理標記）。
  - 地形資料、ADS-B、Follow-me、KML 匯入。
  - 雲端軌跡回放、日誌/影像上雲。
