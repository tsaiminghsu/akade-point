# ESP32 在載具系統中的角色

ESP32 在這套系統裡有四種用法。前三種不直接連雲端，而是透過 Pi（或場邊筆電）上的 companion 進入地面站。

| 角色 | 做法 | 本 repo 內容 |
|:---|:---|:---|
| MAVLink WiFi 數傳橋 | 燒 **DroneBridge for ESP32** 現成韌體，不自寫 | companion 的地面中繼設定 |
| 酬載/感測器節點 | 接飛控 TELEM，當作 MAVLink 元件 25 | `firmware/esp32-payload-node/` |
| 小車底盤控制 | ESP32 本身就是一台 MAVLink 地面車，走 WiFi UDP | `firmware/esp32-rover-base/` |
| Remote ID | 燒 **ArduRemoteID** 現成韌體（ESP32-S3/C3） | 狀態顯示，可選送出操作者位置 |

> **驗證狀態**：
> - 兩支韌體都用 esp32 core 2.0.17 的 xtensa 編譯器通過 `-Wall -Wextra` 編譯檢查，但**還沒在實機上跑過**。
> - 酬載節點的地面站流程，已用 `fake_autopilot --payload` 模擬的元件 25 驗證過：直連與雲端兩條路都測了繼電器、脈衝和伺服。
> - 實機請先在桌上、拆掉螺旋槳或架空輪子測試。

## 共同：MAVLink 標頭與編譯

`src/mavlink/` 是用 pymavlink 的 mavgen 產生的精簡 dialect，只含韌體會用到的 12 種訊息（common 全部約 3 MB，精簡版每份約 450 KB）。

```bash
cd companion && .venv/Scripts/python ../firmware/tools/gen_mavlink.py      # 重新產生兩個 sketch 的 src/mavlink
cd companion && .venv/Scripts/python ../firmware/tools/compile_check.py    # 只編譯不連結，檢查型別與 API
```

- 要加訊息時，改 `gen_mavlink.py` 的 `MESSAGES` 後重新產生。
- `compile_check.py` 直接讀本機 Arduino15 裡 esp32 core 2.0.17 的 `platform.txt`，不需要 arduino-cli。
- 燒錄用 Arduino IDE：板子選 **ESP32 Dev Module**，core 2.x。

## 1. 數傳橋（DroneBridge）

DroneBridge 把飛控 TELEM 的 MAVLink 轉成 WiFi（AP 或 client 模式）的 UDP/TCP。

**接線**：ESP32 UART ↔ 飛控 TELEM（TX↔RX 交叉、共地）。飛控端 `SERIALx_PROTOCOL=2`，`SERIALx_BAUD` 與 DroneBridge 設定一致。

**地面中繼**：
- 在場邊筆電或 Pi 跑一個 companion 實例，設定 `mavlink_url = "udpin:0.0.0.0:14550"`，DroneBridge 的目標就指向這台。
- DroneBridge 會注入 `RADIO_STATUS`，地面站工具列的訊號指示器會優先顯示它。
- 要同時開 Mission Planner 的話，請讓 mavlink-router 擁有這個 UDP 埠，companion 與 MP 都接 router（見 [`vehicles-companion.md`](./vehicles-companion.md)）。

## 2. 酬載節點 `esp32-payload-node`

ESP32 當成飛控上的一個 MAVLink 元件，身分是 sysid = 飛控的 `SYSID_THISMAV`、compid 25。

**運作方式**：
- 每秒送 HEARTBEAT（`MAV_TYPE_ONBOARD_CONTROLLER` / `MAV_AUTOPILOT_INVALID`）。companion 靠這個判斷「它不是載具」，不會誤鎖定成飛控。
- 每秒 2 次送 `NAMED_VALUE_FLOAT`：類比輸入（名稱在 `ANALOG_NAMES`，最多 10 字元）與各繼電器狀態 `RELAYn`（0/1）。
- 接受以下指令，並回 `COMMAND_ACK` 給送出者：

| 指令 | param1 | param2 | 動作 |
|:---|:---|:---|:---|
| `MAV_CMD_DO_SET_RELAY` 181 | 繼電器 index | 1 開 / 0 關 | 設 GPIO |
| `MAV_CMD_USER_1` 31010 | 繼電器 index | 毫秒 | 開啟後定時關閉（投放器、快門） |
| `MAV_CMD_DO_SET_SERVO` 183 | 伺服 index | PWM µs | 50 Hz LEDC 輸出 |

**接線與設定（`payload_config.h`）**：
- **UART**：`LINK_RX_PIN` 16 / `LINK_TX_PIN` 17 ↔ 飛控 TELEM（交叉、共地），115200。
- **繼電器**：4 路（GPIO 25/26/27/14），預設低電位觸發（`RELAY_ACTIVE_LOW`）。
- **伺服**：2 路（GPIO 32/33）。
- **類比**：GPIO 34/35，`ANALOG_SCALE` 為分壓倍率。

**飛控端（ArduPilot）**：
- 該 TELEM 埠設 `SERIALx_PROTOCOL=2`、`SERIALx_BAUD=115`。
- ArduPilot 從心跳學到「元件 25 在這個埠」後，就會把目標是 (sysid, 25) 的指令轉送過去。
- 節點不需要遙測串流，該埠的 `SRx_*` 可以設 0 以節省頻寬。
- 地面站的指令一律指定元件 25，不會被飛控自己的繼電器功能（`RELAYx_*`）攔下。

**地面站**：
- 飛行資料畫面有「酬載」頁籤，當 companion 回報的 `caps` 含 `payload` 時出現，內容包括：
  - 感測值。
  - 繼電器開關，顯示的狀態以節點回報為準。
  - 500 ms 脈衝按鈕。
  - 伺服滑桿（放開才送）。
- 不論走直連或雲端，指令都會記錄在指令紀錄。
- 有多個 NAMED_VALUE_FLOAT 元件時，可以切換要控制哪一個。

**也可以接 Pi**：把節點 UART 接到 Pi，再把那個序列埠加進 mavlink-router 的 endpoint。這樣它就在同一個 MAVLink 網路上，不佔飛控 TELEM。

## 3. 小車底盤 `esp32-rover-base`

沒有飛控的小車：ESP32 自己就是一台 MAVLink 地面車（`MAV_TYPE_GROUND_ROVER` / `MAV_AUTOPILOT_GENERIC`，sysid 2），透過 WiFi UDP 連到 companion。

**功能**：

| 項目 | 行為 |
|:---|:---|
| 模式 | 沿用 ArduPilot Rover 的編號：MANUAL 0 / HOLD 4 / GUIDED 15。地面站對這種載具只列出這三個模式 |
| 上鎖/解鎖 | `MAV_CMD_COMPONENT_ARM_DISARM`（400） |
| 切模式 | `MAV_CMD_DO_SET_MODE`（176）或 `SET_MODE` |
| 駕駛 | 在 **GUIDED 且已解鎖**時，接受 `SET_POSITION_TARGET_LOCAL_NED`（BODY_NED，vx + yaw rate，正是地面站搖桿送的內容），混成左右輪差速 PWM（LEDC 20 kHz、10 bit，PWM + DIR 型驅動板） |
| MANUAL | 沒有遙控器輸入，因此馬達不動；只當作「解鎖但不行駛」的狀態 |
| 保護 | 最後一次駕駛指令 500 ms 後停車（deadman）；2 s 沒聽到地面任何訊息就轉 HOLD |
| 回報 | HEARTBEAT、SYS_STATUS（ADC 電池電壓）、VFR_HUD |

**不支援**：任務、參數、圍欄。companion 對 GENERIC autopilot 只回報 `caps: ["manual"]`，因此地面站會：
- 隱藏「任務規劃」與「參數」頁籤。
- 在動作面板隱藏任務區塊。

要跑航點請改用飛控 + ArduPilot Rover。

**地面中繼**：用 systemd 模板多開一個 companion 實例，設定檔 `/etc/vehicle-companion/esp32rover.toml`：

```toml
mavlink_url = "udpin:0.0.0.0:14560"   # rover_config.h 的 GROUND_PORT
target_system = 2                    # 只鎖定這台小車
gcs_heartbeat = "always"             # 見下方說明
```

```bash
sudo systemctl enable --now vehicle-companion@esp32rover
```

> **為什麼要 `gcs_heartbeat = "always"`**：
> - 小車的「2 秒沒聽到地面就轉 HOLD」，計算的是**任何**來自地面的訊息。
> - companion 預設不送 GCS 心跳（`off`，避免遮蔽飛控的 FS_GCS）。這種情況下，搖桿一停約 2 秒，小車就會掉回 HOLD，要重新切 GUIDED。
> - 設成 `always` 後，companion 每秒送一次心跳，只有 companion 或 WiFi 真的斷線才會觸發 HOLD。
> - 這台車沒有 FS_GCS 可遮蔽，所以 `always` 在這裡沒有副作用。

**韌體設定**：
- **WiFi 帳密**：把 `secrets.example.h` 複製成 `secrets.h` 再填入。`secrets.h` 已列入 gitignore，不會被提交。
- **網路（`rover_config.h`）**：`GROUND_HOST`（跑 companion 那台的 IP）、`GROUND_PORT`。
- **馬達腳位**與左右反向。
- **底盤參數**：`MAX_SPEED_MS`（全油門速度）、`TRACK_WIDTH_M`（輪距）。
- **電池 ADC**：腳位與分壓倍率。

**駕駛**：
- 地面站「駕駛」頁籤（`RoverDrivePad`）的畫面搖桿與 Gamepad，都只在**直連**下啟用。
- 流程：先解鎖，切到 GUIDED 再推搖桿。
- 放開搖桿時，companion 會送 300 ms 的 0 速度，接著由小車自己的 500 ms deadman 接手。

## 4. Remote ID

**模組端**：
- 用 ArduPilot 官方的 **ArduRemoteID** 韌體，燒在 ESP32-S3 或 C3。依 ArduPilot 文件接到飛控的序列埠或 DroneCAN。
- 飛控設 `DID_ENABLE=1` 以及 `DID_MAVPORT` 或 `DID_CANDRIVER`。

**地面站**：
- 模組送出的 `OPEN_DRONE_ID_ARM_STATUS` 會顯示在工具列「系統狀態」裡的 Remote ID 徽章：綠色表示可解鎖；紅色表示模組拒絕解鎖，滑過徽章可看原因。
- 沒有模組時不顯示徽章。

**操作者位置**：
- 若 PreArm 訊息顯示飛控因缺少操作者位置（operator location）而拒絕解鎖，在 companion 設定加上：

  ```toml
  [remote_id]
  send_operator_location = true
  ```

- companion 會以**起飛點（HOME_POSITION）**當作操作者位置，每秒送一次 `OPEN_DRONE_ID_SYSTEM`。
- 原規劃是用瀏覽器定位。但瀏覽器分頁可能在背景或斷線，而飛控需要持續收到這筆訊息，所以改由 companion 送出。
- 操作者實際不在起飛點附近時，這個值就不準確。

> Remote ID 是否必要、要廣播哪些欄位，依各地法規而定。台灣請確認民航局對遙控無人機的最新規定。本功能只協助設備通過 ArduPilot 的解鎖檢查，**不代表**符合任何法規。

## 疑難排解

| 現象 | 檢查 |
|:---|:---|
| 酬載頁籤沒出現 | 飛控該埠 `SERIALx_PROTOCOL=2`？鮑率一致？TX/RX 交叉？節點的 `SYSTEM_ID` 要等於飛控的 `SYSID_THISMAV` |
| 繼電器指令逾時 | ArduPilot 還沒從心跳學到路由（節點剛開機），等幾秒再試；或那個埠被設成其他協定 |
| 繼電器開關反相 | 改 `RELAY_ACTIVE_LOW` |
| ESP32 小車解鎖後推搖桿不動 | 要在 GUIDED、要走直連；檢查 `GROUND_HOST` 與 companion 的 UDP 埠 |
| 小車一直自己掉回 HOLD | 設 `gcs_heartbeat = "always"`（見上） |
| 小車轉向相反 | 改 `LEFT_REVERSED` / `RIGHT_REVERSED` |
