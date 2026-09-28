# 載具安全

## 兩種驗證，分工明確

| 對象 | 函式 | 位置 | NODE_ENV 繞道 |
|:---|:---|:---|:---|
| 人（瀏覽器） | `requireVehicleAccess(action)` → `requireAdminOrDevBypass()` | `lib/vehicle-access.ts` | 有（沿用全站既有的開發繞道） |
| companion（裝置） | `requireDeviceToken(req)` | `lib/device-auth.ts` | **無**——裝置路由永不因非正式環境而開放 |

裝置端路由（`app/api/device/vehicles/**`）第一行一律 `requireDeviceToken`，且 vehicleId **一律取自 token**，不信任 body 或路徑；指令 ack 與任務下載都會檢查該指令／任務屬於 token 的載具。

## Device token

- 格式：`vt_<tokenId>_<secret>`。`tokenId` 是 cuid2（公開，供查表）；`secret` 是 32 bytes 亂數（base64url，可能含 `_` 與 `-`）。
- **只儲存 `sha256(完整 token)`**（`akade-cc-vehicle-tokens.hash`），資料庫外洩不會洩漏可用 token。
- 明碼只在產生當下回傳一次（`POST /vehicles/{id}/token`），之後無法取回。
- 驗證：`parseToken`（只切前兩個底線，保留含 `_` 的 secret）→ 查 `tokenId` → `timingSafeEqual` 比對雜湊 → 檢查未撤銷。
- **輪替**：產生新 token 會立即撤銷該載具所有舊 token（非重疊）。刪除載具時一併撤銷。

> 實作陷阱：base64url 的 secret 含底線，早期 `parseToken` 以 `split("_")` 期待 3 段會誤判失敗，導致每個真實 companion 都 401。已改為只切前兩個底線，並有回歸測試。

## AWS IoT Core policy

正式環境用 MQTT 推指令時，companion 憑證掛上 `infra/iot/companion-policy.json`：以 `${iot:Connection.Thing.ThingName}` 限定，一份 policy 服務所有 companion——

- `iot:Connect`：clientId 必須等於 Thing 名稱（= `companionId`）。
- `iot:Subscribe` / `iot:Receive`：只允許 `vehicles/{自己}/cmd`。

伺服器端（Amplify SSR IAM role）需 `iot:Publish` 於 `arn:aws:iot:REGION:ACCOUNT:topic/vehicles/*`。詳見 [`vehicles-iot-provisioning.md`](./vehicles-iot-provisioning.md)。

## 憑證與機密保管

- companion 的 `.pem` 憑證、`companion.toml`（含 device token）都不進 git（`.gitignore` 已涵蓋 `*.pem`、`companion/companion.toml`、`companion/certs/`）。
- device token 等同該載具的控制權，外洩應立即在 Setup 分頁重新產生（撤銷舊的）。

## 直連（瀏覽器 ⇄ Pi WebSocket）

直連不經過伺服器，所以 companion 無法詢問伺服器「這個瀏覽器有沒有登入」。改用伺服器簽發的票證：

**票證**：
- 已登入的管理員呼叫 `POST /api/control-center/vehicles/{id}/direct-ticket`，取得 15 分鐘效期的票證，範圍分 `view` 或 `control`。
- 瀏覽器連上 WebSocket 後，把票證放在**第一則訊息**送出，不放在 URL，避免進入存取紀錄。
- `/files`（tlog 下載）用 `Authorization: Ticket …` 標頭。

**金鑰**：
- 每台載具的金鑰 = HMAC(`VEHICLE_DIRECT_SIGNING_KEY`, vehicleId + tokenId)。產生 device token 時會一併給 companion，存在 `[direct] ticket_key`。
- 重新產生 token 就等於輪替直連金鑰。
- 伺服器不儲存任何直連機密。
- 更換 `VEHICLE_DIRECT_SIGNING_KEY` 後，每台都要重新產生 token。

**Origin**：
- WebSocket upgrade 與 `/files` 都會檢查 `Origin` 是否在 `[direct] allowed_origins` 內。
- **清單留空代表不檢查**，正式環境務必填入 Control Center 的網址。

**PIN（可選）**：
- 給沒有 Control Center 的場地使用，取得 `control` 權限。
- 每個來源 IP 每分鐘最多錯 5 次，比對採常數時間。
- PIN 的強度遠不如票證，只建議在封閉網路使用。

**傳輸**：
- 從 HTTPS 頁面只能連 `wss://`，建議用 `tailscale serve` 提供有效憑證，同時解決 4G NAT。
- Chrome 的 Local Network Access 可能會跳出授權詢問。

**控制租約**：
- 票證帶有頁面識別 `cid`，伺服器在遙測回應中附上目前的租約 `{ cid, sub, until }`。
- 租約有效時，companion 只接受持有者頁面的指令、搖桿、雲台與 operator 旗標，其他頁面收到 `LEASE_HELD`。
- 租約過期（例如雲端連不上）後，改為接受任何控制票證。

**稽核**：直連下發的指令由 companion 記錄，連上雲端後以 `via: "direct"` 補寫進指令表。

## 已知限制（見 handoff 待辦）

- `requireAdminOrDevBypass` 在非 production 完全放行——預覽／staging 若未設 `NODE_ENV=production`，所有管理端載具 API 對未登入者開放。裝置端不受此影響。
- 目前只有 `isAdmin` 一級，任何管理員可對任何載具下任何指令；角色矩陣見 [`permissions.md`](./permissions.md)。
