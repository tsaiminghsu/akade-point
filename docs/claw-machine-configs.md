# 娃娃機設定（Claw machine setup）

每台機台各自保存一份娃娃機設定：**主機板參數**（仿飛絡力 TK08 面板）與**硬體配置**（爪子、擺場商品、出貨口）。頁面內建 3D 模擬器，可在儲存前試夾。

路由：`/iot-control-center/claw-machines`（側邊欄「娃娃機設定」；機台抽屜的「娃娃機設定」按鈕會帶 `?machine=<id>` 直接開啟該台）。

## 由來

模擬器來自 akade-point 的 `/games/claw-machine`（飛絡力娃娃機）。那個頁面只有一台機器，設定存在瀏覽器 localStorage（`claw-machine-settings-v1`、`claw-machine-rig-v1`）。這裡改為：

- 設定跟著**機台目錄裡的每一台**走，存在 DynamoDB，換電腦、換人都看得到。
- 有儲存／放棄／載入出廠值、編輯衝突偵測、套用到多台機台，且每次變更寫入機台事件紀錄。

設定存好後由機台上的 ESP32 **拉取套用**（可選 MQTT 即時通知，儲存後約 1 秒內套用），設定頁顯示每台的下發狀態，見 [`claw-machine-esp32.md`](./claw-machine-esp32.md)。

## 使用方式

1. 左側清單選機台（手機版為頂端下拉選單）。每列顯示版本、儲存時間、強／中／弱電壓與爪子；「出廠預設」表示從未儲存過。
2. 右側模擬器預設開著「台主設定」面板：
   - **主機板**：基本設定 01–09、爪力電壓 V1–V5、爪子動作 A1–A7、馬達速度 E1–E3。可用面板按鈕、搖桿或鍵盤（方向鍵／WASD 選項目與調整）操作。
   - **更換爪子**：爪型 × 號數 × 直／彎 × 爪位。
   - **擺場商品**：品項與數量（數量變更會直接補／撤機台內的獎品）。
   - **出貨口**：洞口寬深與擋板高度。
   - **帳目**：模擬器內試玩的投幣／出獎統計，只存在這次畫面，不寫入資料庫。
3. 任何變更即時套用到模擬器，但**只有按「儲存」（或 `Ctrl/Cmd+S`）才會寫入這台機台**。工具列狀態會顯示「有未儲存的變更」，清單該列出現橘點。
4. 按「收起面板」可關閉設定面板，投幣試夾，驗證手感。
5. 工具列：
   - **載入出廠值**：把畫面換成出廠預設（仍需儲存才生效）。
   - **放棄變更**：回到這台機台最後儲存的版本。
   - **機台連線**：產生／重新產生／撤銷這台 ESP32 的 Token，看下發狀態（最後連線、機台目前版本、韌體、最後回報）。
   - **套用到其他機台**：把這台**已儲存**的設定複製到勾選的機台（有未儲存變更時停用）。可選只複製「主機板設定」或「爪子、擺場商品、出貨口」，未勾的部分各機台保留原值。
   - **儲存**。
6. 有未儲存的變更時切換機台會先詢問；關閉分頁會跳出瀏覽器的離開提示。

### 編輯衝突

每份設定有 `revision`（每次儲存 +1，出廠預設為 0）。儲存時送出編輯開始時的 revision；若期間有人先存了，伺服器回 409，頁面跳出對話框：

- **繼續編輯**：保留畫面上的內容，不儲存。
- **載入最新版本**：放棄自己的變更，改看對方存的版本。
- **用我的設定覆蓋**：以對方的 revision 重新儲存。

選機台時會重新讀取該台最新設定，所以清單快取過舊也不會以舊版本為基礎編輯。

## 資料模型

表 `akade-cc-claw-configs`，partition key `machineId`，無 GSI、無 TTL。沒有列的機台 = 出廠預設。

| 欄位 | 說明 |
|:---|:---|
| `machineId` | 對應 `akade-cc-machines.id` |
| `settings` | 主機板 24 項，鍵名見 `components/control-center/claw-machine/game/settings.ts` 的 `SETTING_DEFS` |
| `rig` | `{ claw, fit: { size, bend, openPct }, stock: { categories, count, random, countMin }, chute: { width, depth, wallH } }` |
| `revision` | 每次寫入 +1 |
| `updatedAt` / `updatedBy` | epoch ms／使用者 id |

伺服器端所有寫入都先經過 `sanitizeDraft()`（`lib/control-center/claw/config.ts`）：數值夾到各項範圍並對齊步進、未知鍵丟棄、爪型只接受清單內的值。讀取時也再 sanitize 一次，舊版本寫入的列能直接載入。刪除機台時一併刪除其設定。

### 事件紀錄

儲存與複製會寫入機台事件（`akade-cc-machine-events`），出現在機台抽屜與歷史紀錄頁：

| type | 訊息範例 |
|:---|:---|
| `config_change` | `夾娃娃機 #3 娃娃機設定已更新（第 2 版）：V1 強電壓 40.0 V→35.0 V、A2 下線長度 2.0 秒→2.5 秒；爪子` |
| `config_change` | `夾娃娃機 #4 已從「夾娃娃機 #5」套用娃娃機設定（主機板設定，第 3 版）` |
| `config_reset` | `夾娃娃機 #2 娃娃機設定已恢復出廠值`（僅 `DELETE` API 會產生） |
| `config_applied` | `夾娃娃機 #3 主機板已套用娃娃機設定（第 3 版）`（機台回報） |
| `config_apply_failed` | `夾娃娃機 #3 主機板套用娃娃機設定失敗（第 4 版）：BOARD_TIMEOUT …`（warning） |

內容與已儲存版本相同的儲存不寫入、不記事件。

## API

皆為管理端（`requireAdminOrDevBypass`），路徑前綴 `/api/control-center`。

| 方法 路徑 | Body | 回應 |
|:---|:---|:---|
| `GET /claw-configs` | — | `{ configs: ClawConfig[] }`（只含儲存過的機台） |
| `GET /claw-configs/{machineId}` | — | `{ config }`；未儲存過回出廠值（revision 0）；機台不存在 → 404 |
| `PUT /claw-configs/{machineId}` | `{ settings, rig, revision }` | `{ config, event }`；revision 不符 → **409** `{ error, config: 目前版本 }`；機台不存在 → 404 |
| `DELETE /claw-configs/{machineId}` | — | `{ config: 出廠值, event }`（刪除該列） |
| `POST /claw-configs/copy` | `{ settings, rig, parts: ("settings"\|"rig")[], machineIds: string[]（≤200）, sourceMachineId? }` | `{ configs, missing, events }`；不存在的機台列在 `missing` |
| `GET /claw-configs/sync` | — | `{ sync: ClawSync[] }`：各機台 ESP32 最後拉取／套用的狀態 |
| `GET/POST/DELETE /machines/{id}/token` | POST `{ label? }` | 列出（無雜湊）／產生（明碼只此一次，撤銷舊的）／撤銷全部 |

裝置端（ESP32）的 `GET /api/device/machines/config` 與 `POST /api/device/machines/config/ack` 見 [`claw-machine-esp32.md`](./claw-machine-esp32.md)。

複製不檢查 revision（刻意覆蓋），但會讓目標的 revision +1，正在編輯該台的人儲存時會收到 409。

## 程式位置

| 路徑 | 內容 |
|:---|:---|
| `components/control-center/claw-machine/game/` | 從 akade-point `components/claw-machine/` 複製的模擬器（純邏輯 + three.js 場景 + 設定面板）與其測試 |
| `components/control-center/claw-machine/ClawBench.tsx` | 由 `ClawMachineGame.tsx` 改寫：設定與 rig 由頁面傳入（受控），不讀寫 localStorage |
| `components/control-center/claw-machine/ClawConfigsPageContent.tsx`、`CopyConfigDialog.tsx` | 頁面、工具列、清單、對話框 |
| `lib/control-center/claw/config.ts`、`schemas.ts` | 設定正規化、比較、變更描述、zod（伺服器與前端共用，不 import 物理引擎） |
| `lib/dynamo/cc-claw-configs.ts` | DAL（條件式寫入、部分複製） |
| `store/useClawConfigsStore.ts` | zustand store（含下發狀態每 5 秒輪詢、Token 操作） |
| `lib/control-center/claw/device.ts` | 下發契約：`settingsSha`、payload、ETag、下發狀態判定（純函式，前後端共用） |
| `lib/machine-auth.ts`、`lib/dynamo/cc-{machine-tokens,claw-sync}.ts` | 機台 Token 驗證、同步紀錄 |
| `lib/iot/claw-notify.ts` | MQTT 通知（AWS IoT Core／一般 broker），永不丟錯 |
| `scripts/mqtt-dev-broker.mjs`、`infra/iot/claw-board-policy.json` | 本機 broker（`npm run mqtt:dev`）、機台的 IoT policy |
| `app/api/device/machines/config/**` | 裝置端 API |
| `components/control-center/claw-machine/{BoardLinkDialog,DeliveryStatus}.tsx` | 機台連線對話框、狀態標示 |
| `firmware/esp32-claw-config/` | ESP32 韌體範例 |
| `scripts/claw-device-sim.mjs` | 虛擬機台（無硬體時測下發） |
| `app/api/control-center/claw-configs/**` | API |

### 與 akade-point 版本同步

`game/` 是 2026-09-25 的快照，兩邊不會自動同步。與原檔的差異只有：

1. `clawSim.ts` 的 `ChuteConfig`／`CHUTE_LIMITS`／`DEFAULT_CHUTE`／`sanitizeChute` 移到新檔 `chute.ts`（clawSim 仍 re-export），讓 API 可 sanitize 出貨口而不打包 Rapier。
2. `ServicePanel.tsx` 多一個選填的 `closeLabel`（這裡顯示「收起面板」，因為面板只改草稿，不是「儲存離開」）。
3. 沒有複製 `ClawMachineGame.tsx`（由 `ClawBench.tsx` 取代）。

要引入 akade-point 後續的改動：把該資料夾的檔案蓋過 `game/`，重做上面 1、2 兩點，再跑 `npm test`（`game/__tests__` 也在 vitest 範圍內）。若 `ClawMachineGame.tsx` 有改，對照更新 `ClawBench.tsx`。

### 相依套件

Control Center 用 React 18 / Next 14，所以用 `@react-three/fiber@8`、`@react-three/drei@9`（akade-point 是 React 19 + fiber 9 / drei 10）。`three@0.184` 與 `@dimforge/rapier3d-compat@0.19` 兩邊相同。three 會出現 `THREE.Clock` 已淘汰的警告，來自 fiber 8，無害。

## 語系

頁面框架（清單、工具列、對話框、提示）有繁中／英文／日文。**模擬器內的面板與訊息維持繁體中文**，因為主機板項目名稱沿用飛絡力面板的用語；英、日文版的頁面副標題有註明。
