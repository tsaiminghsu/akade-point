# 頁面與 API 權限規劃

## 現況：四級角色（2026-09 實作）

- **角色存放**：`akade-cc-roles` 表（`userId → role`）。不寫入與 akade-point 共用的 `akade-users`。
- **沒有角色紀錄的使用者**：`akade-users.isAdmin = true` 視為系統管理員（舊管理員不受影響），其他人不能進入控制中心。
- **判斷點**：`lib/control-center/access.ts`（純函式：角色、動作、`allows()`），伺服器端用 `lib/access-server.ts` 的 `requireAccess(action)`。
  - 所有管理端 API 的第一行都是它，載具模組的 `requireVehicleAccess()` 也對應到它。
  - `requireAdminOrDevBypass()` 已不再被路由使用。
- **頁面**：
  - `app/iot-control-center/layout.tsx` 讓有任一角色的人進入。
  - 使用者頁只給系統管理員，頁面本身也會檢查。
- **設定角色**：
  - 使用者頁的下拉選單，呼叫 `PUT /api/control-center/users/{userId}/role`。
  - 只有系統管理員能用；不能改自己的角色，避免最後一位系統管理員把自己鎖在外面。
- **前端（僅 UX，實際以 API 為準）**：
  - `GET /api/control-center/me` 回傳角色與可做的動作，`useAccessStore`／`useCan()` 據此停用或隱藏按鈕。
  - 殼層依路徑顯示「你的角色只能查看此頁」。
  - 403 時顯示在地化的「你的角色沒有權限」。
- **本機開發**：沒有登入，使用者是假的「Dev Admin」，預設系統管理員。可從右上角使用者選單切換角色測試（cookie `cc_dev_role`，production 無效）。

### 門市範圍的角色（2026-09 實作）

每位使用者有兩種授權，存在同一筆 `akade-cc-roles` 紀錄：

- **全域角色 `role`**：套用到所有門市，以及「不屬於任何門市」的東西（品牌管理、未指派門市的載具、使用者、token）。沒有這個欄位時，依 `isAdmin` 判斷。
- **門市角色 `stores`**：`{ storeId: 角色 }`，只能指派檢視者、操作員、門市管理員。系統管理員只能全域指派。

判斷方式（`lib/control-center/access.ts`）：

- **在某門市**：取全域角色與該門市角色中較高的一個（`roleAt`）。所以「全域檢視者＋A 店門市管理員」可以看全部門市，但只能改 A 店。
- **只有門市角色的人**：只看得到自己那幾間門市；清單 API 會以 `storeFilter` 過濾。
- **一律需要全域角色的動作**：
  - 新增或刪除門市、品牌的寫入。
  - 使用者管理、機台與載具 token。
  - 載具的新增、編輯、刪除，以及 MAVLink 簽章。
  - 門市的門市管理員可以編輯自己的門市，但不能刪除它。

各 API 的範圍：

| 資源 | 用哪間門市判斷 |
|:---|:---|
| 門市、門市設定、平面圖版本 | 路徑上的 storeId |
| 機台、群組 | 紀錄的 storeId；移到別間門市時，兩邊都要有權限 |
| 警報、事件 | 紀錄的 storeId（跨店最新清單只查有權限的門市） |
| 維修紀錄、娃娃機設定、板子同步 | 所屬機台的 storeId；「套用到多台」要每台目標都有權限，否則整批拒絕 |
| 載具與其指令、任務、參數、日誌、照片 | 載具的 `storeId`；沒有指派門市的載具只有全域角色能看。雲端照片／日誌的刪除需該門市的門市管理員 |

伺服器端的寫法（`lib/access-server.ts`）：

- `requireAccess(action)`：只看全域角色。
- `requireAccessAt(action, storeId)`：該門市。
- `requireAnyAccess(action)`：任一處允許；路由必須再用 `storeFilter` 或 `canAt` 限縮。

前端 `useCan(action, storeId)`／`useCanAt(action)` 用同一組純函式隱藏或停用按鈕。

- **指派方式**：使用者頁的「門市權限」按鈕。API 為 `PUT /api/control-center/users/{userId}/role`，body 帶 `{ stores }`（完整取代），也可以同時帶 `role`。不存在的門市回 400。
- **本機測試**：右上角使用者選單的「以使用者身分檢視」，會以角色表中那位使用者的授權操作（cookie `cc_dev_as`，production 無效）。

### 取得管理員資格

1. 使用者先以 LINE 登入 `/login`，讓 `akade-users` 產生該筆紀錄。
2. 第一位管理員：由既有管理員在 AWS 端執行 `node scripts/set-admin.mjs <email 或 userId>`（設 `isAdmin=true`，對應系統管理員）。
3. 之後由系統管理員在使用者頁指派角色。

### 開發繞道風險（重要）

`NODE_ENV !== "production"` 時沒有登入檢查，任何人都是 Dev Admin。任何未設 `NODE_ENV=production` 的預覽／staging 部署，所有管理端頁面與 API 對未登入者開放。裝置端路由不受此影響。上線前務必確認 `NODE_ENV=production`。

## 角色矩陣

動作與最低角色的對照在 `lib/control-center/access.ts` 的 `MIN_ROLE`，以下為對照表。另有一個動作 `simulate`（瀏覽器內機台模擬器寫入事件／警報）開放給檢視者，因為每個開著的頁面都會跑模擬；日後以真實裝置取代模擬器時應調高。

| 角色 | 說明 |
|:---|:---|
| 檢視者 viewer | 唯讀所有頁面 |
| 操作員 operator | + 處理警報、下載具指令、編輯／上傳任務 |
| 門市管理員 store-admin | + 管理機台、門市、品牌、設定、平面圖版本 |
| 系統管理員 system-admin | + 管理使用者、載具 token、IoT 佈建 |

### 頁面 × 角色

| 頁面 | viewer | operator | store-admin | system-admin |
|:---|:--:|:--:|:--:|:--:|
| 儀表板 / 數據分析 / 歷史紀錄 | 讀 | 讀 | 讀 | 讀 |
| 機台 Machines | 讀 | 讀 | 讀寫 | 讀寫 |
| 娃娃機設定 Claw setup | 讀＋模擬試夾 | 讀＋模擬試夾 | 讀寫＋套用多台 | 讀寫＋套用多台 |
| 娃娃機設定：機台連線（ESP32 token） | 看狀態 | 看狀態 | 看狀態 | 讀寫 |
| 警報 Alerts | 讀 | 處理 | 處理 | 處理 |
| 控制中心（平面圖編輯器） | 讀 | 讀 | 讀寫 | 讀寫 |
| 載具 Vehicles（監控／指令／任務） | 讀 | 指令＋任務 | 指令＋任務 | 全部 |
| 載具 Setup（token） | — | — | — | 讀寫 |
| 門市管理 Stores | 讀 | 讀 | 讀寫 | 讀寫 |
| 設定 Settings | 讀 | 讀 | 讀寫 | 讀寫 |
| 使用者 Users | — | — | — | 讀＋指派全域／門市角色 |

### API × 角色（動作層級）

| 動作類別 | 需要角色 |
|:---|:---|
| 任何 GET（讀） | viewer |
| 警報狀態 PATCH | operator |
| 載具指令 POST、任務建立／更新／刪除／上傳 | operator |
| 機台／門市／品牌／群組／設定／平面圖版本 寫入 | store-admin |
| 娃娃機設定 PUT／DELETE／copy | store-admin |
| 機台 ESP32 token 產生／撤銷 | system-admin |
| 機台 AWS IoT Thing／憑證佈建（AWS 端） | system-admin |
| 載具建立／編輯／刪除、token 產生 | system-admin |
| 使用者授權（全域與門市角色） | system-admin（全域） |

裝置端 API（`/api/device/vehicles/**`、`/api/device/machines/**`）不屬於此矩陣，一律以 device token（`vt_`／`mt_`）驗證。
