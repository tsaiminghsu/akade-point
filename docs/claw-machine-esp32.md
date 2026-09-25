# 娃娃機設定下發到機台（ESP32）

機台上的 ESP32 定期向 Control Center **拉取**這台機台已儲存的主機板設定，交給機台套用，再回報結果。設定頁會顯示每台機台的下發狀態。

```
設定頁 ──儲存──▶ akade-cc-claw-configs
                        │
ESP32 ──GET /api/device/machines/config（If-None-Match: 上次的 sha）──▶ 200 新設定 / 304 沒變
  │  套用到機台（board.cpp）、存進 flash
  └─POST /api/device/machines/config/ack（applied / failed）──▶ akade-cc-claw-sync ─▶ 設定頁狀態、事件紀錄
```

- **只下發主機板設定**（24 項：基本設定、爪力電壓、爪子動作、馬達速度）。爪子、擺場商品、出貨口是人工安裝的實體配置，不下發。
- 用**拉取**而非推送：機台只需對外 HTTPS，不必開 port、不用 MQTT；沒變時是 304，幾乎不耗流量。
- 延遲：預設每 30 秒拉一次（伺服器在回應的 `poll` 欄位決定，改 `DEVICE_POLL_S` 即可全面調整）。

## 快速上手

1. 設定頁選機台 →「機台連線」→「產生 Token」。Token 與填好的 `secrets.h` **只顯示這一次**。
2. 開 `firmware/esp32-claw-config/`，把 `secrets.example.h` 複製成 `secrets.h`，貼上 Token、`API_BASE`、Wi-Fi；`API_BASE` 是 https 時貼上根憑證（見下方 TLS）。
3. 在 `board.h` 選整合方式（先用 `BOARD_LOG_ONLY` 在桌上測）。
4. Arduino IDE：開發板選 ESP32（esp32 core 2.x），函式庫裝 **ArduinoJson 7**，上傳。序列埠 115200 會看到 `[cfg] rev N (...): applied`。
5. 設定頁的狀態從「等待機台拉取」變成「機台已套用」（頁面每 5 秒更新）。

沒有硬體時可用虛擬機台跑同一套流程：

```bash
CLAW_DEVICE_TOKEN=mt_... node scripts/claw-device-sim.mjs --base http://localhost:3000
```

`--once` 拉一次就結束；`--fail BOARD_TIMEOUT` 模擬套用失敗；`--interval 5` 縮短間隔。

## 設定頁上的狀態

| 狀態 | 意思 |
|:---|:---|
| 機台尚未連線 | 從沒有機台用這台的 Token 拉取過 |
| 等待機台拉取（約 30 秒內） | 機台有在拉，但還沒回報套用目前儲存的版本 |
| 機台已套用 | 機台回報的 sha 等於目前儲存的設定（離線時註明「目前離線」） |
| 機台套用失敗：CODE | 機台拒絕了目前儲存的設定；它仍在跑上一個成功的版本 |
| 待下發：機台離線 | 設定比機台新，而且機台 15 分鐘沒連線 |

「機台連線」對話框另外列出最後連線時間、機台目前版本、韌體版本、最後回報。每次新的套用結果寫一筆機台事件：`config_applied`（info）、`config_apply_failed`（warning）；同一結果重複回報不會重複記錄。

判斷「已套用」用的是設定內容的 `sha`，不是版本號：只改爪子／商品的儲存、或複製時只帶 rig，主機板內容不變，機台不需要也不會重新套用。

## 協定（contract v1）

驗證：`Authorization: Bearer mt_<tokenId>_<secret>`。與載具的 `vt_` token 分開，互不通用。選填 `X-Firmware: <版本字串>`（≤40 字，顯示在設定頁）。

### 拉取 `GET /api/device/machines/config`

請求帶 `If-None-Match: "<上次處理過的 sha>"`（套用成功或失敗都算處理過）。

| 回應 | 說明 |
|:---|:---|
| **304** | 沒變。含 `ETag` |
| **200** | 新設定（下表），含 `ETag: "<sha>"` |
| 401 | Token 錯誤、已撤銷或重新產生過 |
| 404 | 機台已刪除 |

```json
{
  "v": 1,
  "machineId": "a468l4…",
  "rev": 3,
  "sha": "05ec0f6e8c7992",
  "poll": 30,
  "settings": { "coinsPerPlay": 1, "playTime": 30, "payoutMode": 0, "…": "…", "upSpeed": 6 }
}
```

約 450 bytes。`settings` 固定 24 個鍵，值已由伺服器夾在範圍內並對齊步進。從未儲存過的機台拿到出廠值（`rev: 0`）。

| 鍵 | 代碼 | 範圍 | 步進 | 單位／意義 |
|:---|:---|:---|:---|:---|
| `coinsPerPlay` | 01 | 1–10 | 1 | 枚 |
| `playTime` | 02 | 10–60 | 1 | 秒 |
| `payoutMode` | 03 | 0–1 | 1 | 0 保夾、1 機率 |
| `guaranteeN` | 04 | 0–50 | 1 | 局（0 關閉） |
| `resetOnWin` | 05 | 0–1 | 1 | 出獎重算保夾 |
| `autoDrop` | 06 | 0–1 | 1 | 時間到自動下爪 |
| `midAirGrab` | 07 | 0–1 | 1 | 空中取物 |
| `dropSteer` | 08 | 0–1 | 1 | 下降中操控 |
| `idleOpen` | 09 | 0–1 | 1 | 待機爪子 0 合、1 開 |
| `strongPower` | V1 | 0–48 | 0.5 | V |
| `midPower` | V2 | 0–48 | 0.5 | V |
| `midPoint` | V3 | 1–30 | 1 | 中壓距離頂點（1 最上） |
| `weakPower` | V4 | 0–48 | 0.5 | V |
| `guaranteePower` | V5 | 0–48 | 0.5 | V |
| `dropDelay` | A1 | 0–1 | 0.05 | 秒 |
| `dropLine` | A2 | 0.2–4 | 0.1 | 秒（下線長度） |
| `closeDelay` | A3 | 0–1 | 0.05 | 秒 |
| `liftDelay` | A4 | 0–2 | 0.05 | 秒 |
| `topDelay` | A5 | 0–2 | 0.1 | 秒 |
| `topPull` | A6 | 0–10 | 1 | 段 |
| `homeDrop` | A7 | 0–10 | 1 | 段（1 段 = 0.1 秒） |
| `gantrySpeed` | E1 | 1–10 | 1 | 級 |
| `dropSpeed` | E2 | 1–10 | 1 | 級 |
| `upSpeed` | E3 | 1–10 | 1 | 級 |

權威定義是 `components/control-center/claw-machine/game/settings.ts` 的 `SETTING_DEFS`；韌體的 `claw_settings.h` 是它的副本，`lib/control-center/claw/firmware.test.ts` 會在兩者不一致時失敗。

### 回報 `POST /api/device/machines/config/ack`

```json
{ "v": 1, "sha": "05ec0f6e8c7992", "rev": 3, "st": "applied" }
{ "v": 1, "sha": "05ec0f6e8c7992", "rev": 3, "st": "failed", "code": "BOARD_TIMEOUT", "msg": "no reply to COMMIT" }
```

`code` 為 `[A-Z0-9_]{1,32}`，`msg` ≤200 字。回 `{ "ok": true }`；格式錯 400、Token 錯 401。

韌體會用到的失敗碼：`MISSING_SETTING`、`OUT_OF_RANGE`、`BAD_PAYLOAD`、`UNSUPPORTED_VERSION`（韌體與伺服器契約不一致）、`BOARD_TIMEOUT`、`BOARD_REJECTED`、`BOARD_BAD_REPLY`（UART 整合）。自訂整合可以回報自己的碼。

## 韌體（`firmware/esp32-claw-config/`）

| 檔案 | 內容 |
|:---|:---|
| `esp32-claw-config.ino` | Wi-Fi、拉取／304、解析、存 flash、回報、失敗退避 |
| `claw_settings.h` | 24 項設定表、範圍檢查（與 `SETTING_DEFS` 同步） |
| `board.h` / `board.cpp` | **整合點**：把設定交給機台 |
| `secrets.example.h` | 複製成 `secrets.h`（已 gitignore） |

行為：

- **開機先套用 flash 裡上次成功的設定**，所以沒網路時機台照樣用最後的設定運作。flash 內容帶有設定表的指紋，韌體的表改過就不會把舊值讀錯位置。
- 拉到新設定 → 範圍檢查 → `applyToBoard()` → 成功才寫入 flash → 回報。失敗的設定會記住它的 sha，不會每 30 秒重試一次；重開機後會再試一次。
- 回報送不出去時保留，下次拉取後重送。
- 連不上伺服器時間隔加倍退避，最長 10 分鐘。

### 接到機台（`board.cpp`）

**原廠飛絡力主機板的設定只能用搖桿選單調，沒有資料介面。** 要讓設定真的進到機台，需要能接收參數的控制端，例如：

- 自製或第三方主機板（MCU 直接控制爪子電壓 PWM、天車、捲線馬達）。
- 由 ESP32 本身當主控。

範例提供兩種：

- `BOARD_LOG_ONLY`：只印出設定並回報成功，用來在桌上驗證下發流程。
- `BOARD_UART`：用序列埠（預設 RX 16 / TX 17，115200）送 `SET <key> <value>` ×24 再 `COMMIT`，等對方 2 秒內回 `OK` 或 `ERR <CODE>`。控制端照這個簡單文字協定實作即可。

要換成別的方式，改寫 `applyToBoard()`：成功回 `true`；失敗回 `false` 並填 `code`（與 `msg`）。

### TLS

`API_BASE` 是 `https://` 時，`secrets.h` 的 `ROOT_CA` 要放伺服器憑證鏈的根憑證。Amplify 與 ACM 憑證鏈到 **Amazon Root CA 1**（`https://www.amazontrust.com/repository/AmazonRootCA1.pem`）。韌體會先用 NTP 對時（憑證驗證需要正確時間）。`ALLOW_INSECURE_TLS` 只供桌上測試，會跳過憑證驗證。

開發時 ESP32 連不到 `localhost`：`API_BASE` 改成電腦的區網 IP（`http://192.168.x.x:3000`），並確認防火牆允許該 port。

### 編譯驗證

本 repo 以 esp32 core 2.0.17 的 `xtensa-esp32-elf-g++`（ESP32 Dev Module 的 platform.txt 參數）編譯過 `.ino` 與兩種 `board.cpp`，`-Wall -Wextra` 無警告；同時定義兩種整合會被 `#error` 擋下。**尚未在實機上燒錄測試。**

## 安全

- Token 格式 `mt_<tokenId>_<secret>`，secret 為 32 bytes base64url；資料庫只存 SHA-256，明碼只在產生時顯示一次。
- 裝置端 API **沒有**開發環境繞道；機台 ID 一律取自驗證過的 Token，一個 Token 只拿得到自己那台的設定。
- 一台機台只有一組有效 Token：重新產生即撤銷舊的；「中斷連線」撤銷全部。刪除機台會撤銷其 Token 並刪除同步紀錄。
- Token 目前編譯進韌體（`secrets.h`）。量產時建議改成首次開機時寫入 NVS 的佈建流程。

## 資料與成本

表 `akade-cc-claw-sync`（pk `machineId`）：`pulledAt`／`pulledSha`／`pulledRevision`／`fw`、`appliedSha`／`appliedRevision`／`appliedAt`、`lastAck`。表 `akade-cc-machine-tokens`（pk `tokenId`，GSI `machine-index`）。

每次拉取讀 4 筆（Token、機台、設定、同步）；`pulledAt` 只在設定或韌體變了、或距上次記錄滿 5 分鐘時才寫，所以每台大約每 5 分鐘一次寫入，而不是每 30 秒。離線判定因此是 15 分鐘沒有記錄。

## 疑難排解

| 現象 | 檢查 |
|:---|:---|
| 一直「機台尚未連線」 | 序列埠是否 `pull failed: HTTP 401`（Token 貼錯或已重新產生）；`API_BASE` 是否為 localhost |
| `API_BASE is https but secrets.h has no ROOT_CA` | 貼上根憑證 |
| `clock NOT synced (TLS may fail)` | 網路擋 NTP（UDP 123） |
| 「等待機台拉取」很久 | 機台是否離線；拉取間隔 30 秒，頁面每 5 秒更新 |
| 「套用失敗 OUT_OF_RANGE / MISSING_SETTING」 | 韌體的 `claw_settings.h` 與伺服器版本不一致，更新韌體 |
| 「套用失敗 BOARD_TIMEOUT」 | UART 接線（TX/RX 交叉、共地）、鮑率、控制端是否回 `OK` |

## 後續可做

- 儲存後即時通知（IoT Core MQTT 推一則「有新設定」，機台立刻拉），現在最多延遲一個拉取週期。
- Token 佈建改為 NVS／序列埠寫入，不必重新編譯韌體。
- 失敗時自動建立警報（目前是 warning 事件）。
