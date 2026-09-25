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

## 已知限制（見 handoff 待辦）

- `requireAdminOrDevBypass` 在非 production 完全放行——預覽／staging 若未設 `NODE_ENV=production`，所有管理端載具 API 對未登入者開放。裝置端不受此影響。
- 目前只有 `isAdmin` 一級，任何管理員可對任何載具下任何指令；角色矩陣見 [`permissions.md`](./permissions.md)。
