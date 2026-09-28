# API 參考

分兩類：**管理端**（`/api/control-center/**`，人員／管理員驗證）與**裝置端**（`/api/device/**`，companion device token）。所有 body 皆 JSON。

## 通則

- 管理端每個 handler 第一行檢查權限，未過回 **403** `{"error":"Forbidden"}`。載具管理端用 `requireVehicleAccess`，其餘用 `requireAdminOrDevBypass`。非 production 會繞過（見 [`permissions.md`](./permissions.md)）。
- 請求驗證用 zod，失敗回 **400** `{"error":"Invalid request"}`（含空 `{}` PATCH、超出 enum、缺必填）。
- 依賴完整性拒絕回 **409**（例如品牌尚有門市）。
- 平面圖版本超過 350 KB 回 **413**。
- 未攔截的 DynamoDB／執行期錯誤回 **500**。
- 裝置端 token 無效回 **401** `{"error":"Unauthorized"}`。

## 錯誤碼速查

| 碼 | 意義 |
|:--|:--|
| 400 | 請求格式錯誤（zod、空 patch、壞 JSON） |
| 401 | 裝置端 token（載具 `vt_`／機台 `mt_`）無效／已撤銷 |
| 403 | 未登入或非管理員（正式環境） |
| 404 | 資源不存在，或跨載具存取 |
| 409 | 依賴衝突、指令已終結，或娃娃機設定的 revision 已被他人更新 |
| 413 | 平面圖版本 payload 過大 |
| 500 | 未攔截錯誤 |

---

## 管理端：載具 Vehicles

| 方法 路徑 | Body／Query | 回應 |
|:---|:---|:---|
| `GET /vehicles` | — | `{ vehicles: Vehicle[] }`（各含推導的 `linkState`） |
| `POST /vehicles` | `{ name, type: drone\|rover, companionId, notes?, storeId? }` | `{ vehicle }`；companionId 重複 → 409 |
| `GET /vehicles/{id}` | — | `{ vehicle }`；不存在 → 404 |
| `PATCH /vehicles/{id}` | 上述欄位任一（非空），另可帶 `directUrl`（ws/wss）、`videoUrl`（http/https），`""` 清除 | `{ ok: true }`；companionId 撞其他載具 → 409 |
| `DELETE /vehicles/{id}` | — | `{ ok: true }`（連帶撤 token、刪任務） |
| `GET /vehicles/{id}/token` | — | `{ tokens: [{ tokenId, label, createdAt, revokedAt }] }`（無雜湊、無明碼） |
| `POST /vehicles/{id}/token` | `{ label? }` | `{ token, tokenId, createdAt, directKey }`（明碼**僅此一次**，並撤銷舊 token；`directKey` 是 companion `[direct] ticket_key`，未設簽章密鑰時為 null） |
| `GET /vehicles/{id}/live` | `?after=<事件 sk>&op=1` | `{ vehicle, events: VehicleEvent[], commands, now }`——地面站每秒輪詢；`op=1`（需 command 權限）表示持有控制權，寫入 `operatorSeenAt` |
| `GET /vehicles/{id}/params` | — | `{ snapshots: [{ capturedAt, count, fw, commandId }] }`（新到舊，不含參數本體） |
| `GET /vehicles/{id}/params/{capturedAt}` | — | `{ snapshot: { params: { NAME: [value, type] }, count, fw, … } }` |
| `POST /vehicles/{id}/direct-ticket` | `{ scope?: "control"\|"view" }` | `{ url, ticket, exp, scope }`；沒設直連網址或沒有 token → 409，未設簽章密鑰 → 503 |
| `GET /vehicles/{id}/commands` | `?limit`（≤200） | `{ commands: VehicleCommand[] }`（讀取時套用逾時） |
| `POST /vehicles/{id}/commands` | `CommandRequest`（見下） | `{ command }`；type 不符機型／模式不合法 → 400；mission_upload 找不到任務 → 404 |
| `GET /vehicles/{id}/telemetry` | `?since&limit`（≤2000，預設 500） | `{ points: TelemetryPoint[] }`（時間遞增） |
| `GET /vehicles/{id}/missions` | — | `{ missions: VehicleMission[] }` |
| `POST /vehicles/{id}/missions` | `{ name, items[]（≤500）, source? }` | `{ mission }` |
| `GET /vehicles/missions/{missionId}` | — | `{ mission }` |
| `PATCH /vehicles/missions/{missionId}` | `{ name?, items? }`（非空） | `{ ok: true }` |
| `DELETE /vehicles/missions/{missionId}` | — | `{ ok: true }` |
| `GET /vehicles/{id}/files` | `?kind=photo\|tlog\|dataflash&before&limit`（≤200） | `{ files, nextBefore, storage }`（見 [`vehicles-files.md`](./vehicles-files.md)） |
| `GET /vehicles/{id}/files/{fileId}/content` | `?download=1` | 檔案內容（S3 模式轉址到預簽連結） |
| `DELETE /vehicles/{id}/files/{fileId}` | — | `{ ok: true }`（該門市的門市管理員以上） |

**CommandRequest**（discriminated union，`type` 為判別鍵）：
`{type:"arm"}`、`{type:"disarm",force?}`、`{type:"set_mode",mode}`、`{type:"takeoff",alt}`（僅 drone）、`{type:"goto",lat,lon,alt}`、`{type:"rtl"}`、`{type:"mission_start"}`、`{type:"mission_upload",missionId}`、`{type:"mission_download"}`。

---

## 裝置端：載具 companion（Bearer device token）

| 方法 路徑 | Body | 回應 |
|:---|:---|:---|
| `POST /device/vehicles/telemetry` | `{ state: VehicleState(v1\|v2), history?（≤60）, msgs?: STATUSTEXT[]（≤50）, audit?: 直連指令紀錄[]（≤50） }` | `{ ok, commands: VehicleCommandMsg[], timedOut, now, op }`——commands 為待執行指令，回傳後標 sent；`now` 伺服器時間；`op` 最近 5 s 有人持控制權 |
| `POST /device/vehicles/commands/{commandId}/ack` | `{ v, id, st: acked\|failed, code, msg?, t, res? }` | `{ ok: true }`；非本載具 → 404；已終結 → 409 |
| `GET /device/vehicles/missions/{missionId}` | — | `{ mission: { id, name, items } }`；非本載具 → 404 |
| `POST /device/vehicles/params` | `{ commandId?, params: { NAME: [value, type] }（≤3000）, fw? }` | `{ ok, capturedAt }`（param_fetch 後上傳的完整參數表） |
| `POST /device/vehicles/missions/download` | `{ commandId, items[], mtype? }` | `{ missionId }`（建立 `source:download` 任務） |

照片與日誌上雲（宣告、上傳、完成）見 [`vehicles-files.md`](./vehicles-files.md#api)。

欄位定義見 [`vehicles-message-contract.md`](./vehicles-message-contract.md)。

## 裝置端：娃娃機 ESP32（Bearer `mt_` machine token）

| 方法 路徑 | Body／Header | 回應 |
|:---|:---|:---|
| `GET /device/machines/config` | `If-None-Match: "<sha>"`、`X-Firmware?`、`X-Notify: mqtt?` | **304**（沒變）或 `{ v, machineId, rev, sha, poll, pollMqtt, settings }` + `ETag`；機台已刪 → 404 |
| `POST /device/machines/config/ack` | `{ v:1, sha, rev, st: applied\|failed, code?, msg? }` | `{ ok: true }`；格式錯 → 400 |

`vt_`（載具）與 `mt_`（機台）token 互不通用。開啟 `CLAW_CONFIG_NOTIFY` 時，儲存後伺服器會發 MQTT 通知到 `claw/{machineId}/config`（`{v,sha,rev}`，QoS 1），機台收到即拉取。詳見 [`claw-machine-esp32.md`](./claw-machine-esp32.md)。

---

## 管理端：娃娃機設定 Claw configs

一台機台一份設定（主機板 `settings` + `rig`：爪子、擺場商品、出貨口）。數值由伺服器夾到合法範圍；未儲存過的機台回出廠值（`revision: 0`）。細節見 [`claw-machine-configs.md`](./claw-machine-configs.md)。

| 方法 路徑 | Body | 回應 |
|:---|:---|:---|
| `GET /claw-configs` | — | `{ configs: ClawConfig[] }`（只含儲存過的） |
| `GET /claw-configs/{machineId}` | — | `{ config }`；機台不存在 → 404 |
| `PUT /claw-configs/{machineId}` | `{ settings, rig, revision }`（revision = 編輯開始時的版本，0 = 從未儲存） | `{ config, event }`；revision 不符 → 409 `{ error, config }`（帶目前版本）；內容未變 → 200 不寫入 |
| `DELETE /claw-configs/{machineId}` | — | `{ config, event }`（恢復出廠值） |
| `POST /claw-configs/copy` | `{ settings, rig, parts: ["settings"\|"rig"], machineIds[]（≤200）, sourceMachineId? }` | `{ configs, missing, events }` |
| `GET /claw-configs/sync` | — | `{ sync: ClawSync[], notify: { mode: iot\|mqtt\|off, brokerUri } }`（各機台 ESP32 最後拉取／套用；從未連線的機台不在內） |
| `GET /machines/{id}/token` | — | `{ tokens: [{ tokenId, label, createdAt, revokedAt }] }`（無雜湊） |
| `POST /machines/{id}/token` | `{ label? }` | `{ token, tokenId, createdAt }`（明碼**僅此一次**，撤銷舊 token）；機台不存在 → 404 |
| `DELETE /machines/{id}/token` | — | `{ ok, revoked }`（中斷連線） |

`ClawConfig`：`{ machineId, settings, rig, revision, updatedAt, updatedBy }`。PUT、DELETE、copy 的回應另有 `notify: { mode, sent, failed } | null`：主機板設定有變時對機台發的 MQTT 通知結果（null＝沒有要通知的）。

---

## 管理端：既有模組（摘要）

以下模組沿用相同慣例（403／400／409／500，PATCH 空 body → 400）。詳細欄位見各自的 zod schema。

| 模組 | 端點 |
|:---|:---|
| Machines | `GET/POST /machines`、`PATCH/DELETE /machines/{id}`（`?storeId&groupId` 過濾；DELETE 連帶刪除娃娃機設定、同步紀錄並撤銷機台 token） |
| Events | `GET /events`（`?limit&before&storeId&machineId`）、`POST /events`、`POST /events/batch`（≤100） |
| Alerts | `GET /alerts`（同上）、`POST /alerts`、`POST /alerts/batch`、`PATCH /alerts/{id}`（status） |
| Stores | `GET/POST /stores`、`PATCH/DELETE /stores/{id}`（DELETE 尚有機台 → 409） |
| Brands | `GET/POST /brands`、`PATCH/DELETE /brands/{id}`（DELETE 尚有門市 → 409） |
| Groups | `GET/POST /groups`、`PATCH/DELETE /groups/{id}`（DELETE 尚有機台 → 409） |
| Maintenance | `GET /maintenance-records`（`?machineId`）、`POST /maintenance-records` |
| Store settings | `GET/PATCH /store-settings/{storeId}`（upsert） |
| Layout versions | `GET/POST /layout-versions/{storeId}`、`PATCH/DELETE /layout-versions/{storeId}/{id}`（>350 KB → 413；刪最後一版 → 409） |

## Auth

`/api/auth/[...nextauth]`：NextAuth（LINE 單一 provider），標準 `/signin`、`/callback/line`、`/signout`、`/session` 等。LINE channel 設定由 akade-point 的 `/admin/line-auth-settings` 寫入、本 app 讀取。
