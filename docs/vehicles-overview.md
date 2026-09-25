# 無人機／無人車模組（Vehicles）— 總覽

Control Center 的 Vehicles 模組讓管理員監控並控制掛載 **companion 板（樹莓派／ESP32）** 的無人機與無人車，與 **MissionPlanner** 共存，並整合 ArduPilot 的 MAVLink 協定。

本文件是模組的入口；細節見同資料夾的其他 `vehicles-*.md`。

## 目標與範圍

- 即時監控載具遙測（連線狀態、解鎖、飛行模式、電量、GPS、座標、航向、速度、心跳）。
- 下達指令：arm/disarm、切換模式、起飛、飛到座標、返航、開始／上傳／下載任務。
- 任務（航點）以表格編輯，並相容 MissionPlanner 的 `.waypoints`（QGC WPL 110）。
- companion 可同時把 MAVLink 轉發給 MissionPlanner。

本輪 **不含**：地圖與航點拖曳、地理圍籬、影像串流、多載具同畫面、角色權限實作、ESP32 韌體、IoT Core 遙測路徑（Shadow／Rule）。

## 系統架構

```
瀏覽器 ──2s 輪詢──▶ GET /vehicles、/vehicles/{id}/commands
       ──POST────▶ /vehicles/{id}/commands            （寫入指令列＝pending）
                                                        │ iot 模式：publish 到 MQTT → sent
樹莓派 companion ──1Hz POST──▶ /device/vehicles/telemetry ◀┘ 回應夾帶 pending 指令（local 模式的送達通道）
                ──POST──────▶ /device/vehicles/commands/{id}/ack
                ──GET───────▶ /device/vehicles/missions/{id}      （mission_upload 取航點）
                ──POST──────▶ /device/vehicles/missions/download  （mission_download 回傳）
樹莓派 companion ◀─MAVLink UDP─ SITL／飛控 ─UDP 轉發─▶ MissionPlanner
```

## 關鍵設計決策

**A. 資料路徑：HTTPS 單一入口，IoT Core 只推指令。**
Amplify 上的 Next.js 無法常駐訂閱 MQTT，開發機也沒有 IoT Core。因此遙測、ack、任務全部走 HTTPS（device token），這條路徑在本機（DynamoDB Local）與正式環境完全相同；IoT Core 只在正式環境額外承載「指令推送」。不使用 Device Shadow 或 IoT Rule——它們需要額外的 AWS 設定，且伺服器每次仍得逐台 GetThingShadow，省不到事。

**B. 指令送達：MQTT 推送 + HTTPS 輪詢備援。**
發指令時先寫入指令列（`pending`）；`VEHICLE_TRANSPORT=iot` 時 publish 到 `vehicles/{companionId}/cmd`（QoS 1）成功即標 `sent`。此外，**每次遙測 POST 的回應都夾帶該載具尚未執行的指令**——這在本機模式是唯一送達管道（≤1s 延遲），在正式環境是 publish 失敗時的自動備援。companion 以 HTTPS 回報 ack。

**C. 本機開發不需 AWS。** `VEHICLE_TRANSPORT=local`（預設）時 `publishVehicleCommand` 直接回 `{published:false}`，指令改由遙測回應帶回。整個 SITL → companion → `next dev` + DynamoDB Local → 瀏覽器 的迴圈不需 AWS 帳號。

## 名詞

- **vehicle**：一台無人機或無人車的紀錄，含 `companionId`（唯一，也是 IoT Thing 名稱）。
- **companion**：載具上的運算板（樹莓派／ESP32），跑橋接程式，一端接飛控（MAVLink），一端接雲端。
- **device token**：companion 向裝置端 API 認證用的 bearer token，格式 `vt_<tokenId>_<secret>`，只存雜湊，明碼僅顯示一次。
- **linkState**：由 `lastSeenAt` 推導的連線狀態（online <10s、stale <60s、offline），不儲存。

## 角色權限（規劃，尚未實作）

目前所有頁面與 API 都只檢查 `isAdmin`。文件 [`permissions.md`](./permissions.md) 提出四級角色矩陣（檢視者／操作員／門市管理員／系統管理員）。載具指令與任務屬「操作員」層級。程式中 `lib/vehicle-access.ts` 的 `requireVehicleAccess(action)` 是未來插入角色判斷的唯一位置。

## 後續輪次

- 地圖與航點拖曳（Leaflet + OSM）。
- ESP32 韌體（訊息契約已在 [`vehicles-message-contract.md`](./vehicles-message-contract.md) 定好、刻意精簡）。
- IoT Core 遙測路徑（Device Shadow 或 IoT Rule）以降低 HTTPS 輪詢成本。
- 地理圍籬、影像串流、多載具同畫面。
