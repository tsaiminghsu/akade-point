# 頁面與 API 權限規劃

## 現況：單一 `isAdmin`

目前系統**只有一個布林權限 `isAdmin`**（存於共用的 `akade-users` 表）。所有頁面與所有 API 都通過同一道關卡：

- 頁面：`app/iot-control-center/layout.tsx` 檢查登入 + `isAdmin`，否則導向。
- 管理端 API：每個 handler 第一行 `requireAdminOrDevBypass()`（或載具的 `requireVehicleAccess()`）。
- 裝置端 API（companion）：`requireDeviceToken()`，與人員權限無關。

**沒有**角色、沒有唯讀／可寫之分、沒有依門市分權。任一管理員可對任何資源做任何操作。

### 取得管理員資格

1. 使用者先以 LINE 登入 `/login`，讓 `akade-users` 產生該筆紀錄。
2. 由既有管理員在 AWS 端執行 `node scripts/set-admin.mjs <email 或 userId>`（比對 email 或 userId，設 `isAdmin=true`）。這是建立**第一位**管理員的唯一方式；目前沒有授權 API。

### 開發繞道風險（重要）

`requireAdminOrDevBypass` 與頁面 gate 在 `NODE_ENV !== "production"` 時**完全放行**。任何未設 `NODE_ENV=production` 的預覽／staging 部署，所有管理端頁面與 API（含含 email 的使用者頁）對未登入者開放。裝置端路由不受此影響（無繞道）。上線前務必確認 `NODE_ENV=production`。

## 規劃：四級角色矩陣（尚未實作）

以下為建議的角色模型，供日後導入。**目前皆等同「系統管理員」**（凡 `isAdmin` 者全開）。程式中 `lib/vehicle-access.ts` 的 `requireVehicleAccess(action)` 已預留為載具權限的唯一判斷點；其他模組需比照抽出。

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
| 使用者 Users | — | — | — | 讀（＋未來授權） |

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
| 使用者授權（未來） | system-admin |

裝置端 API（`/api/device/vehicles/**`、`/api/device/machines/**`）不屬於此矩陣，一律以 device token（`vt_`／`mt_`）驗證。

### 導入方式（建議）

1. `akade-users` 增加 `role` 欄位（或以 `isAdmin` 對映 system-admin 相容舊資料）。
2. 各模組把裸露的 `requireAdminOrDevBypass()` 收斂為 `requireAccess(module, action)`，比照 `requireVehicleAccess`。
3. 前端依角色隱藏／停用無權的動作按鈕（純 UX，實際仍以 API 為準）。
