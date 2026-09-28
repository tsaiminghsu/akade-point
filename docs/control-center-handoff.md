# IoT Control Center — 交接知識庫

> 給接手的 Claude：讀完本文件即可銜接。所有路徑相對於 **`D:\akade-iot-control-center`**（除非特別標註 akade-point）。
> 最後核對日期：2026-09-15。

---

## 0. 一分鐘摘要

- **專案位置已變更**：本 session 的工作最初在 `D:\akade-point`（monorepo）完成，之後 Control Center 被拆成獨立 repo `D:\akade-iot-control-center`（commit `b4cf14f`，唯一一個 commit）。akade-point 已移除所有 CC 程式碼（commit `280d23b7`），合併前快照為 tag `pre-split`。**之後所有 CC 工作都在新 repo 做。**
- **本 session 已完成並已隨拆分 commit**：資料層（GSI 查詢 + TTL + 批次寫入）、11 個 bug 修正、編輯器效能、共用分頁、hydrate 錯誤列、CRLF 正規化。新 repo 工作區乾淨，`vitest` 69 個測試全過。
- **目前沒有進行中、未 commit 的程式碼。** 下一步是第 8 節的待辦清單，使用者尚未選擇要做哪幾項。
- **部署前必做**：對 production 跑一次 `node scripts/create-tables.mjs` 開啟 TTL（未確認是否已做）。

---

## 1. 專案背景

| 項目 | 內容 |
|:---|:---|
| 產品 | 企業 IoT 監控：販賣機／夾娃娃機即時狀態、警報、歷史事件、樓層平面圖編輯器 |
| 使用者 | 管理員（LINE 登入，`akade-users.isAdmin`） |
| 與 akade-point 的關係 | 無程式碼共用。共用 `akade-auth`、`akade-users` 兩張 DynamoDB 表，並讀取 akade-point 的 `/admin/line-auth-settings` 寫入的 LINE channel 設定 |
| 部署 | AWS Amplify（`amplify.yml`：`npm ci` → `npm run build`） |
| UI 語系 | zh-TW（預設）、en-US、ja-JP，cookie `cc-locale` |

---

## 2. 技術棧與指令

- Next.js **14.2.35** App Router、React 18、TypeScript strict（akade-point 已升 Next 15，CC repo 沒有）
- zustand 5、zod 4、next-intl 4、recharts、Radix/shadcn（`components/ui`）、sonner、`@paralleldrive/cuid2`
- DynamoDB：`@aws-sdk/client-dynamodb` + `lib-dynamodb`
- 測試：vitest（`environment: node`），無 jsdom / RTL

```bash
npm run dev            # next dev + DynamoDB Local（port 8500）
npm run dev:next       # 只跑 Next
npm run typecheck      # tsc --noEmit
npm run lint
npm test               # vitest run
npm run build
```

本機 DynamoDB（需 Java；jar 在 `.dynamodb-local/`，資料在 `.dynamodb-local-data/`，皆 gitignore）：

```bash
node scripts/start-dynamodb-local.mjs
DYNAMODB_LOCAL_ENDPOINT=http://localhost:8500 node scripts/create-tables.mjs
DYNAMODB_LOCAL_ENDPOINT=http://localhost:8500 node scripts/seed-control-center-local.mjs
```

`.env.local` 需有 `DYNAMODB_LOCAL_ENDPOINT=http://localhost:8500`。`lib/dynamo/client.ts` 偵測到此變數就改連本機並使用假憑證。

---

## 3. 系統架構

### 3.1 路由（`app/iot-control-center/`，拆分時已拿掉 route group）

`page.tsx` 儀表板、`editor/` 平面圖編輯器、`machines/`、`alerts/`、`history/`、`analytics/`、`stores/`、`settings/`、`users/`。

- 除 `users/` 外，每個 page 都是 `"use client"` + `next/dynamic({ ssr: false })` 載入 `components/control-center/<area>/*PageContent.tsx`；各子資料夾的 `layout.tsx` 只輸出 `metadata`。
- `users/page.tsx` 是 **server component**，直接呼叫 `lib/dynamo/users.ts` 的 `listUsers()`。
- `layout.tsx`：production 做 `getServerSession` + `isAdmin` 檢查；**非 production 直接放行**（見 8.1）。包 `NextIntlClientProvider` 與 `ControlCenterShell`。

### 3.2 API（`app/api/control-center/`）

每個 handler 第一行都是 `requireAdminOrDevBypass()`（`lib/session.ts`），失敗回 403。body 用 zod `safeParse`，失敗回 400。

| 端點 | 方法 | 備註 |
|:---|:---|:---|
| `brands`, `stores`, `groups`, `machines` | GET / POST | GET 仍是全表 `paginatedScan`（表小，可接受） |
| `.../[id]` | PATCH / DELETE | PATCH 空 body 或壞 JSON → 400；DELETE 有 409 依賴保護 |
| `events` | GET / POST | GET 吃 `limit`（1–1000，預設 200）、`before`、`storeId`、`machineId`；回 `{ events, nextBefore }` |
| `events/batch` | POST | `{ events: [...] }`，1–100 筆，依輸入順序回傳含 server id 的紀錄 |
| `alerts` | GET / POST | 同 events，排序鍵是 `createdAt` |
| `alerts/batch` | POST | `{ alerts: [...] }`，1–100 筆 |
| `alerts/[id]` | PATCH | 只改 `status` |
| `maintenance-records` | GET / POST | GET 無參數仍是全表掃描（人工輸入、低流量，刻意保留） |
| `store-settings/[storeId]` | GET / PATCH | PATCH 為 upsert |
| `layout-versions/[storeId]`、`.../[id]` | GET / POST / PATCH / DELETE | 350 KB payload 上限、每店最多 20 版 |

共用 zod schema：`events/schema.ts`（`eventCreateSchema`、`eventBatchSchema`、`recentQuerySchema`）、`alerts/schema.ts`（`alertCreateSchema`、`alertBatchSchema`）。

### 3.3 資料存取層（`lib/dynamo/`）

- `client.ts`：`ddb`、`TABLES`（`akade-auth`、`akade-users`、9 張 `akade-cc-*`）、`buildUpdateExpression(patch)`（空 patch 回 `null`）、`paginatedScan`、`hasAnyDependent`。
- `cc-*.ts`：每張表一支。所有 `update*` 在 `buildUpdateExpression` 回 `null` 時直接 return。
- `recent.ts` `mergeRecent(lists, sortKey, limit, tieBreak)`：合併多個已遞減的清單；tie-break 用 id，保證同時間戳時順序穩定。
- `ttl.ts`：`EVENT_TTL_SECONDS` 30 天、`ALERT_TTL_SECONDS` 90 天、`expiresAtFrom(epochMs, ttl)`（回傳秒）。
- `batch.ts` `batchPutAll(table, items, { maxAttempts = 5, sleep })`：25 筆一批，重送 `UnprocessedItems`，指數退避，超過次數丟錯。
- `lib/control-center/batch.ts`：`chunk(items, size)`、`MAX_BATCH_ITEMS = 100`。

GSI（定義於 `scripts/create-tables.mjs`）：

| 表 | 索引 | Key |
|:---|:---|:---|
| machine-events | `machine-index`、`store-index` | `machineId` / `storeId` + `timestamp` |
| alerts | `machine-index`、`store-index` | `machineId` / `storeId` + `createdAt` |
| machines | `store-group-index` | `storeId` + `groupId` |
| stores | `brand-index` | `brandId` |
| groups | `store-index` | `storeId` |
| maintenance-records | `machine-index` | `machineId` |
| layout-versions | 主鍵 | `storeId` + `id` |

### 3.4 前端狀態（`store/`，zustand，無 persist）

| Store | 內容 | 網路行為 |
|:---|:---|:---|
| `useMachinesStore` | brands / stores / groups / machines / `machinesById` / events（上限 500）/ maintenance / `activeStoreId` / `hydrated` / `hydrateError` | `hydrate()` 並行打 6 支 API；`persistEvents` 批次；CRUD 成功後才改本地 |
| `useAlertStore` | alerts（上限 500）/ `hydrated` / `hydrateError` | `hydrate()`；`ingestAlerts` 批次；`setStatus` 樂觀更新 |
| `useStoreSettingsStore` | `settingsByStore` | `hydrateStore`；`updateSettings` 600 ms debounce，只送改動欄位 |
| `useLayoutVersionsStore` | `versionsByStore` / `activeVersionIdByStore` / `loadedStores` | 所有平面圖版本 I/O |
| `useControlCenterStore` | widgets / selection / viewport / mode / grid / history / 儲存狀態 | 無網路（grid/snap 經 `writeThroughStoreSettings` 寫設定） |
| `useUIStore` | 側欄、機台抽屜、command palette | 無 |

共用 fetch：`lib/control-center/apiClient.ts` `apiRequest<T>(url, init, { silent, timeoutMs = 10000 })`，失敗回 `null`，非 silent 時 toast。

### 3.5 殼層與資料載入

`components/control-center/shell/ControlCenterShell.tsx` 掛載時 `void hydrate()` 兩個 store，`activeStoreId` 變動時 `hydrateStore`。`HydrationErrorBanner.tsx` 在任一 store `hydrateError` 為真時顯示可重試的紅色列（沿用 i18n `ErrorState` 的 key）。`MachineDetailDrawer` 永遠掛載，其中的圖表以 `next/dynamic` 延遲載入。

### 3.6 平面圖編輯器（`components/control-center/canvas/`）

- `LayoutEditor.tsx`：`loadStore(storeId)` 流程為 `ensureDefaultVersion` → `hydrateStore` → `loadWidgets` → 套用 grid/snap 設定，失敗 toast `Toolbar.loadFailed`；全域快捷鍵；`beforeunload`；切換門市時若 dirty 跳 `ConfirmDialog`，取消會 `setActiveStore(上一個)`。`loadedStoreIdRef` 記錄畫布目前屬於哪家店。
- `CanvasViewport` → `CanvasStage`（單一 CSS transform 容器）→ `WidgetRenderer`（`memo`，依 widget 尺寸只訂閱需要的機台欄位）。
- `useCanvasInteractions.ts`：pan / marquee / drag / resize / rotate；window 級 `pointermove` 經 `createFrameCoalescer` 合併；`pointerup` 與 `pointercancel` 先 `flush` 再 `commit`。
- 其他：`SelectionOverlay`、`Minimap`、`PropertyPanel`、`LayersPanel`、`Toolbar`、`LayoutVersionsMenu`、`WidgetContextMenu`、`WidgetPalette`、`SearchLocate`。
- 純函式：`lib/control-center/geometry.ts`（座標轉換、resize、AABB）、`align.ts`、`simulation.ts`（`tick`，Live Mode 每 `LIVE_TICK_MS` = 1000 ms）、`export.ts`、`mockData.ts`（實際只剩 `generateInitialWidgets` 被使用）。
- 常數：`lib/control-center/constants.ts`（`UNDO_HISTORY_LIMIT` = 50、`MAX_LAYOUT_VERSIONS_PER_STORE` = 20、`HYDRATE_EVENT_LIMIT` = 500、`LAYER_GROUP_Z_BASE`、`WIDGET_DEFAULT_LAYER`、電流／開門／心跳門檻）。

---

## 4. 本 session 完成的變更（邏輯細節）

### 4.1 資料層

1. **事件／警報不再全表掃描。** `listRecentEvents` / `listRecentAlerts` 先 `listStores()`，每 10 店一組並行 Query `store-index`（`ScanIndexForward: false`、`Limit`），再 `mergeRecent`。刪除 `listEvents` / `listAlerts` 以免退化。選 fan-out 而非「常數 PK 的新 GSI」：不需改 schema、不需回填。門市數超過數十家再改。
2. **TTL。** 建立時蓋 `expiresAt`（以紀錄本身時間計算）。`create-tables.mjs` 的 `enableTtl` 先 `waitUntilTableExists`、`DescribeTimeToLive`，已啟用就跳過，並吞掉 already enabled 的競態錯誤。
3. **批次寫入。** `createEvents` / `createAlerts` → `batchPutAll`，依輸入順序回傳。
4. **空 PATCH。** DAL 跳過空更新；5 支 PATCH route（brands、groups、stores、machines、store-settings）的 schema 加 `.refine(至少一欄有值)`；`req.json().catch(() => null)` 讓壞 JSON 回 400。
5. 7 支 route 檔移除 UTF-8 BOM。

### 4.2 Store

- **hydrate 去重**：模組層級 `let hydrateInflight: Promise<void> | null`，並行呼叫共用同一 promise，`finally` 清空。
- **失敗不標記 hydrated**：任一回應為 `null` 就 `set({ hydrateError: true, hydrated: false })`，舊資料不動，可再次呼叫重試。6 支請求皆 `silent`，不再疊 6 個 toast。
- **`persistEvents`**：每 100 筆 POST `events/batch`；回應筆數相符時用 `Map(tempId → serverId)` 替換本地 id（否則重整後同一事件以兩個 id 出現）。失敗保留本地 id。
- **`ingestAlerts`**：批次；失敗時仍推入草稿，讓操作員看得到。
- **`updateSettings`**：`pendingPatches` 累積 debounce 期間改過的欄位，只送這些，避免把 `DEFAULT_STORE_SETTINGS` 的假 `apiKey` 寫進 DB。回應型別修正為 `{ settings }`。
- **`fetchVersions` 失敗回 `null`**，`ensureDefaultVersion` 遇到就丟錯。原本失敗被當成「沒有版本」，每次都 POST 新的 Default Layout 直到 20 版上限。
- **`updateActiveVersion` 回傳 `boolean`**，`Toolbar.handleSave` 只有 `true` 才呼叫 `save()`。

### 4.3 `useControlCenterStore` 的不變量（修改前務必理解）

- **widgets 永遠不可原地修改**，所有更新都用 map / spread。`history` 存同一個陣列參考（不再 clone），因此 `history[historyIndex] === widgets` 精確代表「沒有未 commit 的改動」。初始值共用 `EMPTY_WIDGETS`。
- **`savedHistoryIndex: number | null`**：伺服器目前內容所在的 history slot；`null` 代表已無法經 undo/redo 回到儲存點。
  - `loadWidgets`：`history = [widgets]`、`savedHistoryIndex = 0`。
  - `commit`：若無改動直接 return（不推重複快照、不砍 redo 分支）。否則截斷、附加，依 `UNDO_HISTORY_LIMIT` 從前面丟 `dropped` 筆；`saved > historyIndex`（在被丟棄的 redo 分支上）→ `null`，否則 `saved -= dropped`，小於 0 → `null`。
  - `undo` / `redo`：`isDirty = saved === null || newIndex !== saved`。
  - `save`：先 commit 未 commit 的改動，再設 `savedWidgets`、`savedHistoryIndex = historyIndex`、`isDirty = false`。`markSaved` 等同 `save`。
  - `discard`：還原 `savedWidgets`、commit，再把 `savedHistoryIndex` 指向目前 index。
- **z-index band**：`restackWithinBands` 依 `LAYER_GROUP_Z_BASE[layerGroup] + 群組內序號` 重新編號；`inPaintOrder` 先依 zIndex 排序。add / duplicate / paste / bringToFront / sendToBack / reorderWidget 都走這條，band 永不交錯。
- **`setSelection` / `clearSelection`** 以有序比較 `sameIds`，內容相同就回傳原 state（zustand 不通知）。順序有意義：拖曳 snap 錨點與屬性面板都讀 index 0。

### 4.4 編輯器與 UI 效能

- `lib/control-center/frameCoalescer.ts`：`push` 存最新值、每 frame `apply` 一次、`flush` 同步套用、`cancel`；`raf` / `caf` 可注入以便測試。
- `useCanvasInteractions`：`capturePointer(e)` 以 try/catch 對 `currentTarget` 做 capture；marquee 命中改用 `Set`；刪除死碼 `clampZoom` 與無效的 React `onWheel` `preventDefault`。
- 訂閱縮小：`Toolbar`、`LayoutVersionsMenu` 在動作當下讀 `getState().widgets`；`PropertyPanel` 的 `selected` 與機台清單用 `useStoreWithEqualityFn`（見 5.1）；`LayersPanel` 的 `LayerRow` 改 primitive props + `memo`，並依 zIndex 由前到後顯示；`WidgetContextMenu` 只訂閱衍生的 `activeCount`，鎖定／隱藏補 `commit()`；`Minimap` 訂閱 `statusById`（修正 Live Mode 狀態點不更新）並以 `ResizeObserver` 取畫布尺寸。
- `components/control-center/shared/Pagination.tsx`：`usePagination(items, pageSize = 20)`（頁碼自動夾在範圍內）+ `PaginationBar`（prev/next 有 `aria-label`）。用於 `MachinesTable`、`HistoryTable`、`AlertsPageContent`。翻頁文案移到 `Common.showing/page/previousPage/nextPage`，已刪 `MachinesTable` / `HistoryTable` 下的舊 key。
- 表格改用 `useMemo(new Map(...))` 查門市／群組／機台名稱。
- `MachineCurrentChart` 改 `memo` + `useMemo`；`StatusBreakdownChart` 加 `useMemo`。
- 新增 `aria-label`：`LayersPanel`（`lockLayer`、`unlockLayer`、`hideLayer`、`showLayer`）、`MachinesTable` 列動作（`viewMachine`、`editMachine`、`deleteMachine`）。

### 4.5 其他

- `.gitattributes`：`* text=auto eol=lf`（`.bat/.cmd/.ps1` 保留 CRLF，常見二進位檔標 binary）。
- i18n 新增 key：`Toolbar.switchStoreTitle/switchStoreDescription/switchStoreConfirm/loadFailed`、`LayersPanel` 4 個、`MachinesTable` 3 個、`Common` 4 個。**三個語系 key 數必須一致**（新增 key 時三檔同時改）。
- 新測試：`lib/control-center/batch.test.ts`、`frameCoalescer.test.ts`、`lib/dynamo/recent.test.ts`、`lib/dynamo/batch.test.ts`；擴充 `store/useControlCenterStore.test.ts`（selection、band、dirty 追蹤）、`useMachinesStore.test.ts`（hydrate 限量／去重／失敗／重試、批次與 id 替換）、`useAlertStore.test.ts`（批次、失敗、去重）。`vitest.config.ts` 已納入 `lib/dynamo/**/*.test.ts`。

---

## 5. 陷阱（踩過的坑）

1. **zustand selector 不可回傳新建的陣列／物件陣列。** 在 `useShallow` 裡寫 `s.machines.map(m => ({ ... }))` 或 `s.widgets.filter(...)` 會觸發「The result of getSnapshot should be cached」與 Maximum update depth，整個編輯器崩潰。衍生陣列一律用 `useStoreWithEqualityFn(store, selector, equalityFn)`（`zustand/traditional`）。回傳原始參考或 primitive 的 `useShallow` 沒問題；`Minimap` 的 `statusById`（值為字串的物件）也沒問題。
2. **`requestAnimationFrame` 在瀏覽器面板隱藏時不觸發。** 用 Claude Browser 測試時 await rAF 會卡死。coalescer 靠 `pointerup` 的同步 `flush` 保證終點，所以實際使用無影響。
3. **合成 `PointerEvent` 驅動不了畫布。** 自行 `dispatchEvent` 的 pointerId 非作用中。測拖曳請用瀏覽器工具的真實輸入 `left_click_drag`：先按工具列「適應畫面」（lucide `maximize` 圖示按鈕）讓 widget 進入可視範圍，再用 `[data-widget-id]` 的 `getBoundingClientRect()` 取座標。快捷鍵用 `computer` 的 `key "ctrl+z"`。
4. **`timestamp` 是 DynamoDB 保留字**，KeyCondition 要用 `#ts`；`ExpressionAttributeNames` 只能在有用到時才宣告，否則 DynamoDB 拒絕。`createdAt` 不是保留字。
5. **TTL 每張表每小時只能變更一次**，所以 `enableTtl` 先 describe。**DynamoDB Local 回報 TTL 已啟用，但永遠不刪資料。**
6. **`before` 游標是 exclusive**：同一個 simulation tick 的事件共用時間戳，跨頁可能漏掉該 tick 其餘事件。目前沒有 client 使用分頁游標。
7. **瀏覽器工具的 console 緩衝不會被 `console.clear()` 清掉**。要判斷新錯誤，自己把 `console.error` hook 到 `window.__errs`。
8. **Windows**：Bash 工具的 `$TMPDIR` 為空，暫存檔寫到 scratchpad；停 DynamoDB Local 用 `tasklist //FI "IMAGENAME eq java.exe"` 找 PID 再 `taskkill //PID <pid> //F`。含大量引號的長文字不要用 heredoc 寫檔，改用 Write 工具。
9. **CRLF**：Windows 編輯器曾把整檔轉 CRLF，讓 diff 膨脹約 20 倍。判斷真實改動量用 `git diff --ignore-cr-at-eol --stat`。

---

## 6. 驗證紀錄（本 session 實測通過）

在 DynamoDB Local + dev server 上：

- `create-tables.mjs` 開啟 TTL；重跑顯示「TTL already enabled」。
- 兩家門市各 30 筆事件，`GET /events?limit=10` 回兩店資料、嚴格遞減、皆含 `expiresAt`；`limit=abc` 與 `limit=5000` → 400；`storeId` 過濾正確；`before` 只回較舊資料。
- `events/batch`：3 筆的順序與 id 正確；100 筆 → 200；101 筆與空陣列 → 400。`alerts/batch` 正常。
- 空 PATCH、壞 JSON → 400；正常 PATCH → 200。
- 單次頁面載入，每支 API 各只有一個請求（去重有效）。
- build manifest 中所有 CC 路由的初始 chunk 都不含 recharts。
- 編輯器：拖曳 → Save 可按 → 儲存（PATCH 200）→ Save 變灰 → Ctrl+Z → Save **重新可按** → Ctrl+Y → 變灰。
- 關掉 DynamoDB 後重整 → 顯示錯誤列；重啟後按「重試」，不重整頁面即恢復。
- 拆分後新 repo：`tsc` 乾淨、69 個測試通過、build 成功、11 條路由 200（出自拆分 commit 訊息；測試數已於 2026-09-15 重跑確認）。

---

## 7. 部署注意事項

1. 對 production 執行 `node scripts/create-tables.mjs`（prod 憑證），開啟兩張表的 TTL。**是否已執行：未確認。**
2. TTL 上線前寫入的舊事件／警報沒有 `expiresAt`，永遠不會過期。清理需要回填腳本（尚未撰寫）：分頁 Scan `attribute_not_exists(expiresAt)`，已過期者 `BatchWrite` 刪除，其餘 `SET expiresAt`。
3. 行為變更：`GET /events`、`/alerts` 無參數時預設只回 200 筆；History 頁的日期篩選只作用於前端持有的最新 500 筆。

---

## 8. 待辦清單（2026-09-15 確認仍存在於新 repo）

本輪使用者選的範圍是「Bug + 資料層 + 效能」，以下為稽核發現但未處理的項目，依優先度排列。**動手前先請使用者選擇範圍。**

### 8.1 安全（建議最優先）

- **非 production 完全跳過驗證**：`lib/session.ts` 的 `requireAdminOrDevBypass` 與 `app/iot-control-center/layout.tsx` 在 `NODE_ENV !== "production"` 時放行。任何未設 `NODE_ENV=production` 的預覽／staging 環境，所有 API 與含 email 的 `/users` 頁都對未登入者開放。akade-point 已在 commit `5a8d1fa3` 修掉自己那份，CC repo 仍保留。
- `lib/dynamo/users.ts` 的 `listUsers()` 是單次 `ScanCommand`，沒跟 `LastEvaluatedKey`，資料超過 1 MB 會靜默截斷，`/users` 的統計會錯。

### 8.2 正確性

- `components/control-center/settings/GridSnapSettingsForm.tsx` 讀 `useControlCenterStore` 的記憶體預設值，只有進過編輯器才會被覆寫；直接開 `/settings` 顯示的不是已儲存值。其他設定表單讀 `useStoreSettingsStore`。
- `store/useMachinesStore.ts` 的 `runLiveTick` 對**所有門市**的機台做模擬（`tick(get().machines)`），產生看不到的事件、警報與寫入。
- `lib/control-center/simulation.ts` 事件訊息寫死中文（`已離線`、`電流過高` 等）並存進 DB，en/ja 介面顯示中文。
- `lib/control-center/apiClient.ts` 錯誤訊息只有英文（`Request failed`、`Request timed out`、`Network error`）。
- `lib/dynamo/cc-layout-versions.ts`：`listVersionsByStore` 回傳完整 widgets（最多 20 版 × 350 KB），只為顯示版本名稱；`deleteVersion` 先 COUNT 再 Delete，有競態。
- Live Mode 遙測只改本地狀態，不寫回 `akade-cc-machines`，重整後機台回到種子值（可能是設計決策，需與使用者確認）。
- Snap 開啟時 resize 會讓固定邊漂移：`useCanvasInteractions.ts` 在 `resizeFromHandle` 之後才 snap 寬高，沒重算中心；最小尺寸 8 與 `geometry.ts` 的 16 不一致。
- 全域 keydown 對 Space `preventDefault`，工具列按鈕無法用空白鍵觸發；切換視窗時 `spaceHeld` 可能卡住。

### 8.3 死碼與假 UI

- `components/control-center/shell/ControlCenterComingSoon.tsx` 零 importer（連同 i18n `ComingSoon` namespace）。
- `lib/control-center/constants.ts` 的 `STATUS_LABEL` 未使用；`mockData.ts` 的 `generateAlerts`、`useMachinesStore.resetMockData` 無人呼叫。
- 5 個設定表單的「儲存」按鈕只跳 toast（實際寫入早由 debounce 完成）：`ApiConfigForm`、`MqttConfigForm`、`NotificationSettingsForm`、`LayoutDefaultsForm`、`AppearanceSettingsForm`。
- `ApiConfigForm` 寫死 `200 OK`、`MqttConfigForm` 寫死已連線；`AppearanceSettingsForm` 的 theme 不存也不套用；`ControlCenterTopNav` 的主題切換只換圖示。

### 8.4 重複程式碼

- 3 個表單 dialog（`MachineFormDialog`、`StoreFormDialog`、`BrandFormDialog`）結構相同，驗證行為不一致；`react-hook-form` 與 `zod` 已在依賴中。
- 「所有門市」Select 複製 4 份（Machines、Alerts、Analytics、HistoryFilters）；狀態 tab 列 2 份；頁首 7 份。
- `StoreTable`、`BrandTable` 未使用共用分頁。
- API route 的 auth／驗證樣板重複約 26 次；4 個 `cc-*.ts` 的 CRUD 結構相同；`CC*` 型別與 `lib/control-center/types.ts` 各自維護，無編譯期連結。
- Nav 定義兩份：`ControlCenterSidebar.tsx` 的 `NAV_ITEMS` 與 `SearchCommand.tsx` 手寫項目。
- `HistoryTable` 借用 `MachinesTable.store` 翻譯 key。

### 8.5 無障礙

- 整個 `components/control-center` 只有 7 處 `aria-label`。Store / Brand 表格列動作、TopNav 漢堡／鈴鐺／主題／使用者、側欄收合、`BrandFormDialog` 色票、`ToolbarIconButton`（Tooltip 不算 accessible name）仍無名稱。
- 手刻行動版側欄無 focus trap、無 Escape、無 `aria-modal`；表格無鍵盤操作；警報計數無 `aria-live`；畫布只能用滑鼠。

### 8.6 測試缺口

- API route 與 `lib/dynamo/cc-*.ts` 無測試（vitest include 未含 `app/api/**`）。
- `apiClient.ts`、`align.ts`、`export.ts` 無測試；`geometry.ts` 16 個 export 只測 2 個。
- 沒有測試守住三語系 key 對稱。

---

## 9. 參考

- 本 session 計畫檔：`C:\Users\Attlie\.claude\plans\control-center-shiny-wall.md`
- 合併時期快照：akade-point tag `pre-split`；本 session 改動首次 commit 於 akade-point `f958f610`
- 拆分：akade-point `280d23b7`；CC repo `b4cf14f`

---

## 10. Vehicles 模組（無人機／無人車，MissionPlanner 整合）

於 `feat/vehicles-module` 分支新增。完整文件見 `docs/vehicles-*.md` 與 `docs/user-guide.md`／`permissions.md`／`api-reference.md`。

**架構**：遙測／ack／任務走 HTTPS（device token），IoT Core MQTT 只在 prod 推指令；每次遙測 POST 的回應夾帶待執行指令，是本機模式的送達通道。`VEHICLE_TRANSPORT=local|iot` 切換，程式路徑單一。

**新增檔案**：
- 純模組＋測試：`lib/control-center/vehicles/{types,constants,schemas,linkState,commandState,waypoints,token,view}.ts`
- DAL：`lib/dynamo/cc-vehicle-{s,tokens,commands,telemetry,missions}.ts`；`client.ts` +5 TABLES；`ttl.ts` +2 常數
- 驗證：`lib/device-auth.ts`（`requireDeviceToken`，無 NODE_ENV 繞道）、`lib/vehicle-access.ts`（角色 seam）、`lib/iot/publish.ts`（best-effort，永不丟錯）
- Routes：`app/api/control-center/vehicles/**`、`app/api/device/vehicles/**`
- 前端：`store/useVehiclesStore.ts`、`app/iot-control-center/vehicles/**`、`components/control-center/vehicles/**`
- companion：`companion/`（Python；2026-09 重寫後見下方「地面站重構」）
- scripts：`seed-vehicle-local.mjs`、`vehicles-smoke.mjs`；`create-tables.mjs` +5 表 + TTL
- infra：`infra/iot/companion-policy.json`

**新表**：`akade-cc-vehicles`、`-vehicle-tokens`、`-vehicle-commands`（TTL 30d）、`-vehicle-telemetry`（TTL 7d）、`-vehicle-missions`。

**新依賴**：`@aws-sdk/client-iot-data-plane`、`react-is`（recharts v3 的 es6 build 需要，先前 install 曾把它從樹上剪掉導致殼層圖表崩潰）。

**環境變數**：`VEHICLE_TRANSPORT`（local/iot）、`IOT_DATA_ENDPOINT`（iot 模式）。

**陷阱**：
- device token 的 base64url secret 含 `_`，`parseToken` 只切前兩個底線（否則每個真實 companion 都 401）。有回歸測試。
- `status`／`state`／`t` 是 DynamoDB 保留字，條件式與 telemetry 排序需別名。
- 在 Windows 上對執行中的 dev server 跑 `npm install` 會鎖檔並汙染 node_modules／webpack 快取；裝完依賴要重啟 dev server 並清 `.next`。

**權限現況**：仍只有 `isAdmin`；`requireVehicleAccess(action)` 是未來角色的唯一插入點；角色矩陣見 `docs/permissions.md`（尚未實作）。

**待補驗證**：實機／SITL 的完整飛行序列與任務往返、MissionPlanner 同時連線（本 session 已用 curl 模擬 companion 驗證全部 API 與 UI 的指令流程）。

### 10.1 地面站重構（2026-09，`feat/vehicles-gcs`，疊在 `feat/claw-machine-configs` 上）

參考 Mission Planner 把 Vehicles 從「清單 + 抽屜」改成每台載具一個網頁地面站。

**里程碑 commit**：

| Commit | 里程碑 | 內容 |
|:---|:---|:---|
| `866262b` | M0a | companion 重寫：單一 reader、訂閱式 ACK、明確鎖定飛控、mavlink-router |
| `ae1c6ae` | M0b | 契約 v2、STATUSTEXT events、指令 `exp` |
| `124109b` | M1 | 地面站頁面與直連鏈路 |
| `f98d91a` | M2 | 任務/圍欄/Rally 編輯 |
| `539a903` | M3 | 影像 |
| `5a0828d` | M4 | 參數/安全設定/日誌 |
| `7fb2177` | M5 | STorM32 雲台 |
| `b3553c7` | M6 | ESP32 酬載節點、小車底盤、Remote ID |

文件：`vehicles-gcs.md`（操作）、`vehicles-video.md`、`vehicles-gimbal-storm32.md`、`vehicles-esp32.md`、`vehicles-message-contract.md`（v2 + 直連協定）、`vehicles-companion.md`。

**程式位置**：
- **companion**：`companion/vehicle_companion/{mav,ops,links}/`。
  - 測試 `companion/tests/`（63 案例），其中多數是對 `tools/fake_autopilot.py` 的 UDP 整合測試。
  - 模擬器可加 `--payload` 模擬 ESP32 酬載節點。
- **純模組**：`lib/control-center/vehicles/{gcs,link,plan,params,video}/`（vitest 的 include 只抓 `lib/**`）。
- **UI**：`components/control-center/vehicles/gcs/**`、`store/{useGcsStore,usePlanStore,useParamStore}.ts`。
- **韌體**：`firmware/esp32-{payload-node,rover-base}` + `firmware/tools/{gen_mavlink,compile_check}.py`。

**新表**：`akade-cc-vehicle-events`（STATUSTEXT，TTL 7d）、`akade-cc-vehicle-params`（參數快照）。

**新依賴**：`leaflet`、`react-leaflet@4`（v5 要 React 19）、`@types/leaflet`。

**新環境變數**：`VEHICLE_DIRECT_SIGNING_KEY`（直連票證；未設時用 `NEXTAUTH_SECRET`）。`amplify.yml` 現在會把 `VEHICLE_*`、`IOT_DATA_ENDPOINT` 等寫進 `.env.production`；以前這些變數在 runtime 其實都沒生效。

**陷阱**：
- 必須在 import pymavlink 前設 `MAVLINK20=1`。否則 `mission_type` 會遺失，圍欄上傳會蓋掉任務。
- 同一條 MAVLink 連線只能有一個 reader，ACK 靠「先訂閱再送出」。以前兩個執行緒搶 `recv_match` 會偷走 ACK。
- 飛控要明確鎖定（autopilot ≠ INVALID、compid 1 優先）。雲台（154）、ESP32（25）、MP（255）的心跳都不能蓋掉它。
- `PARAM_VALUE` 要以名稱比對：ArduPilot 回聲的 index 是 65535。數值用 float32 比較。
- Leaflet 會壓在 Dialog 上面，`.gcs-map` 要加 `isolation: isolate`。容器尺寸改變時要 `invalidateSize`（`AutoResize`）。
- 參數說明 `apm.pdef.json` 約 2.2 MB，超過 Next 資料快取上限，由瀏覽器直接抓（允許 CORS）後再裁減欄位。
- 這個 repo 的 `.prettierrc`（單引號、行寬 100）和實際程式風格不符，**不要**跑 `npm run format`，否則會改寫大量無關檔案。
- ArduPilot 4.7 把許多參數改成 SI 單位並更名（`RTL_ALT`→`RTL_ALT_M`、`WPNAV_SPEED`→`WP_SPD`、`SYSID_MYGCS`→`MAV_GCS_SYSID`、`ARMING_CHECK`→`ARMING_SKIPCHK`…）。寫死參數名稱時新舊都要列（見 `SAFETY_GROUPS`）。
- ESP32 小車的 companion 實例要設 `gcs_heartbeat = "always"`，否則搖桿一停約 2 秒就會掉回 HOLD（見 `vehicles-esp32.md`）。

**驗證狀態**：
- **已驗證**：
  - pytest 63、vitest 342、tsc 通過；`npm run build` 通過。
  - lint 只剩既有錯誤：`app/api/auth/[...nextauth]/route.ts` 兩個 `no-explicit-any`、`tailwind.config.ts` 一個 `require`，都不是本分支造成的。
  - 瀏覽器實測（fake autopilot + companion，雲端與直連）：
    - HUD、起飛、飛到這裡、LINK LOST、手機版面。
    - 任務與圍欄上傳 + 比對、參數讀寫、tlog 清單。
    - 雲台轉到 −90° 並讀回、酬載繼電器/伺服/脈衝。
  - **2026-09-27 ArduPilot 4.7.1 SITL**（`companion/sitl/`，Docker + mavlink-router）：
    - Copter/Rover 飛行指令、任務/圍欄/Rally 往返、AUTO 任務、Rover 直連搖桿。
    - Mission Planner 1.3.83 同時連線。
    - 細節見 `vehicles-local-dev-and-verification.md`。
    - SITL 抓到並已修正：沒有座標的任務指令比對誤報、4.7 參數更名、mavlink-router 在新版 Debian 編不過。
- **未驗證**：
  - SITL 下的雲台；MP 連 Rover 的同時連線。
  - 任何實機：Pixhawk、STorM32、Pi 相機 + MediaMTX 串流、兩支 ESP32 韌體（只做過編譯檢查）。
- **更正**：M1、M2 的 commit 訊息寫「pytest 57」，實際當時是 52 個案例。

**第二批功能（2026-09-28）**：

| Commit | 功能 |
|:---|:---|
| `148f925` | ADS-B 航空器顯示與接近警示；地圖跟隨不再吃掉使用者的縮放 |
| `6cc4df3` | 經 MAVLink 下載 DataFlash；日誌有獨立執行道，不卡任務/參數 |
| `ddc8501` | 環繞產生器、KML/KMZ 匯入 |
| `52db763` | 跟隨我（瀏覽器定位驅動 GUIDED，含移動預測） |
| `b96869e` | 雲端軌跡回放；解鎖時每 2 秒一點 |
| `eec03d6` | 數值面板可自訂 |
| `abc5941` | 控制租約（一次一位操作者，雲端與直連都會擋） |

以上都在 ArduPilot 4.7.1 SITL 上驗證過。另外補驗了 Mission Planner 與 Rover 同時連線。

測試數：pytest 78、vitest 363。

**陷阱**：
- SITL 的 ADS-B 模擬（`SIM_ADSB_*`）只轉送 `ADSB_LIST_RADIUS`（預設 2 km）內的航空器，時有時無；要看清楚請調大。
- `requestAnimationFrame` 在背景分頁完全停止，回放改用計時器。
- 不在前景的分頁不會輪詢 `/live`（刻意省流量）；測試多分頁時要注意。
- 刪 worktree 前一定要先移除 node_modules junction（見記憶檔）。

**待辦**：
- 實機驗證。
- 第二批：MAVLink2 簽章（啟用後 MP 也要同一把金鑰）、地形資料供應、companion 當 MAVLink 相機、角色權限。

## 11. 娃娃機設定模組（多台機台各自保存）

於 `feat/claw-machine-configs` 分支新增（疊在 `feat/vehicles-module` 之上）。完整文件：`docs/claw-machine-configs.md`。

**做什麼**：把 akade-point `/games/claw-machine` 的模擬器與飛絡力 TK08 式主機板設定搬進來，改成**每台機台一份設定**存在 DynamoDB（原版只有一台，存 localStorage）。路由 `/iot-control-center/claw-machines`，機台抽屜有入口按鈕（`?machine=<id>`）。

**新增檔案**：
- 模擬器快照：`components/control-center/claw-machine/game/**`（含原測試，vitest include 已加 `components/**/__tests__/*.test.ts`）
- 受控包裝：`ClawBench.tsx`（取代 `ClawMachineGame.tsx`）；頁面 `ClawConfigsPageContent.tsx`、`CopyConfigDialog.tsx`
- 純模組＋測試：`lib/control-center/claw/{config,schemas}.ts`（`config.test.ts` 19 案例）
- DAL：`lib/dynamo/cc-claw-configs.ts`；routes：`app/api/control-center/claw-configs/**`
- store：`store/useClawConfigsStore.ts`

**新表**：`akade-cc-claw-configs`（pk `machineId`）。`create-tables.mjs` 已加。

**新依賴**：`three@0.184`、`@react-three/fiber@8`、`@react-three/drei@9`（React 18 相容版；akade-point 用 fiber 9/drei 10）、`@dimforge/rapier3d-compat@0.19`、`@types/three`。

**不變量／陷阱**：
- 伺服器端不得 import `game/clawSim.ts`／`physics.ts`（會把 Rapier 打包進 API route）。出貨口 sanitizer 因此拆到 `game/chute.ts`；`lib/control-center/claw/config.ts` 只 import `settings`／`claws`／`items`／`chute`。build 後已確認 route bundle 無 rapier。
- 遊戲的 `isClawType()` 用 `v in STYLES`，會接受 `"constructor"` 等繼承鍵；API 輸入改用 `CLAW_TYPES.find` 判斷（有測試）。
- 模擬器以 `key={machineId:benchKey}` 重建：換機台、放棄變更、載入出廠值、載入他人版本都 bump `benchKey`。儲存成功時**不要**換掉 draft 物件，否則模擬器會對未變的 chute／stock 重新套用（出貨口碰撞體重建）。
- 儲存帶 `revision` 做條件式寫入（0 = `attribute_not_exists`），409 帶回目前版本；複製不檢查 revision 但會 +1。選機台時一律重新 GET 該台設定。
- 鍵盤操作只在焦點位於模擬器內或 body 時生效，避免吃掉頁面其他按鈕／對話框的按鍵；`Ctrl/Cmd+S` 由頁面處理。
- 模擬器內文字維持繁中（主機板術語），頁面框架三語。

**驗證（本 session）**：vitest 235／tsc／eslint／`next build` 皆通過。瀏覽器實測：編輯→儲存（rev 1、事件寫入）、第二台獨立設定、未儲存切換提示、`Ctrl+S`、複製到 2 台（含只複製 settings 時 rig 維持出廠）、409 衝突的覆蓋與載入最新、載入出廠值／放棄變更、機台抽屜深連結、手機版版面；API 的 400／404／409、數值夾限與 no-op 儲存。

### 11.1 ESP32 下發（機台拉設定）

完整文件：`docs/claw-machine-esp32.md`。機台 ESP32 以 `mt_` token 拉 `GET /api/device/machines/config`（If-None-Match／304），套用後 `POST .../config/ack`；設定頁每 5 秒輪詢 `GET /claw-configs/sync` 顯示下發狀態，「機台連線」對話框產生／撤銷 token。

- 新表：`akade-cc-claw-sync`（pk machineId）、`akade-cc-machine-tokens`（pk tokenId，GSI `machine-index`）。共 17 張 `akade-cc-*`。
- `lib/control-center/vehicles/token.ts` 的 `formatToken`／`parseToken` 多了 prefix 參數（預設 `vt`，載具行為不變）；機台用 `mt`，兩種 token 互不通用（有測試）。
- 變更偵測用設定內容的 `settingsSha`（cyrb53，純 JS，前後端一致），不是 revision：只改 rig 的儲存不會觸發機台重套。
- 拉取時 `pulledAt` 只在 sha／韌體變了或距上次滿 5 分鐘才寫（`PULL_RECORD_INTERVAL_MS`），離線判定 15 分鐘。
- 同一結果重複 ack 只記一次事件（`config_applied`／`config_apply_failed`）。
- 韌體 `firmware/esp32-claw-config/` 的 `claw_settings.h` 是 `SETTING_DEFS` 的 C++ 副本，`lib/control-center/claw/firmware.test.ts` 保證一致；改設定項目要兩邊一起改並更新韌體。
- 韌體已用 esp32 core 2.0.17 toolchain 編譯（未連結、未燒錄）；原廠飛絡力板沒有資料介面，`board.cpp` 是整合點（LOG_ONLY／UART 範例）。
- `scripts/claw-device-sim.mjs` 是虛擬機台，本 session 用它在瀏覽器驗證：已套用、等待拉取、套用失敗（重複回報不重複記事件）、重新產生與中斷連線後 401。

### 11.2 MQTT 即時通知

- `lib/iot/claw-notify.ts`：`CLAW_CONFIG_NOTIFY=iot`（IoT Data Plane，`IOT_DATA_ENDPOINT`）或 `mqtt`（mqtt.js 短連線到 `CLAW_MQTT_URL`）；5 秒逾時、永不丟錯，失敗不影響儲存。主題 `claw/{machineId}/config`，內容只有 `{v,sha,rev}`，設定仍走 HTTPS。
- 只在主機板設定的 sha 變時發（PUT、DELETE、copy 有勾 settings）；rig-only 不發。
- 機台以 `X-Notify: mqtt` 回報訂閱中 → 同步列 `notify`；payload 的 `pollMqtt`（300 秒）是訂閱中的保險輪詢；韌體斷線時立刻回到 30 秒。
- 韌體用 core 內建 esp-mqtt（IDF 4.4 設定結構，只支援 core 2.x；3.x 會 `#warning` 並退回輪詢）；client id＝Thing 名稱＝機台 id。policy：`infra/iot/claw-board-policy.json`。
- 本機：`npm run mqtt:dev`（aedes）；D:\akade-point 的 `.claude/launch.json` 有 `iot-cc-mqtt`，`iot-cc` 帶 `CLAW_CONFIG_NOTIFY=mqtt` 環境變數。實測：儲存 → 頁面顯示已套用 1.2 秒；broker 關掉時儲存 28 ms 照常成功；broker 恢復時虛擬機台自動重連並補拉斷線期間的版本。
- 正式環境（AWS IoT Core）與實機尚未實測。
