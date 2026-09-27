# Companion（樹莓派）設定指南

companion 是掛在載具上的橋接程式：一端透過 mavlink-router 接飛控的 MAVLink，一端接 Control Center（HTTPS，選配 MQTT；契約 v2 另有瀏覽器直連的 WebSocket）。程式在 `companion/`。

```
Pixhawk ──UART── mavlink-router ──UDP 14540── vehicle_companion ──HTTPS/MQTT── Control Center
                      │                                  └──WebSocket (直連)── 瀏覽器
                      ├──TCP 5760 / UDP 14550── Mission Planner / QGC（校正、刷韌體、日誌）
```

## 接線與飛控設定

- **Pixhawk TELEM2 → 樹莓派 GPIO UART**（TX↔RX、RX↔TX、GND；不要接 5V 以外的電源腳）。
  - 樹莓派：`sudo raspi-config nonint do_serial_cons 1 && sudo raspi-config nonint do_serial_hw 0`（關序列 console、開硬體 UART），重開機後為 `/dev/serial0`。
  - 飛控：`SERIAL2_PROTOCOL = 2`（MAVLink2）、`SERIAL2_BAUD = 921`（921600）。
- 也可用 USB（`/dev/ttyACM0`），但 USB 供電與干擾較不穩，飛行時建議 UART。
- **Pi 的 5V 供電要夠**：欠壓時 Pi 會降頻、斷線；地面站狀態列會顯示 `vcgencmd get_throttled` 的欠壓旗標。

## 安裝

```bash
# 1. mavlink-router（Pi OS 沒有套件，腳本會從原始碼建置）
git clone <repo> ~/akade && cd ~/akade/companion
bash deploy/install-mavlink-router.sh          # 安裝 deploy/mavlink-router.conf 為 /etc/mavlink-router/main.conf

# 2. companion
sudo mkdir -p /opt/vehicle-companion && sudo chown pi /opt/vehicle-companion
cp -r ~/akade/companion/* /opt/vehicle-companion/
python3 -m venv /opt/vehicle-companion/.venv
/opt/vehicle-companion/.venv/bin/pip install /opt/vehicle-companion
```

## 設定檔

在 app 中 Vehicles → 目標載具 → **設定** → 產生 Token，把 `vehicle_id` 與 `token` 填入設定檔（範本 `companion.example.toml`，每個欄位都有說明）。重點欄位：

```toml
vehicle_id = "..."
api_base = "https://your-control-center.example.com"
token = "vt_..._..."
transport = "http"                          # 或 "iot"（見下）
contract = 1                                # 伺服器升級到地面站版後改 2
mavlink_url = "udpin:127.0.0.1:14540"       # mavlink-router 的 companion endpoint
gcs_heartbeat = "off"                       # 見下方「GCS 失控保護」
battery_cells = 4                           # 電池串數，用來算每芯電壓
tlog_dir = "/var/lib/vehicle-companion/drone/tlogs"
```

## systemd 常駐

`vehicle-companion@.service` 是範本單元：`/etc/vehicle-companion/<名稱>.toml` 對應 `vehicle-companion@<名稱>`。

```bash
sudo cp /opt/vehicle-companion/deploy/vehicle-companion@.service /etc/systemd/system/
sudo mkdir -p /etc/vehicle-companion && sudo cp companion.toml /etc/vehicle-companion/drone.toml
sudo systemctl daemon-reload && sudo systemctl enable --now vehicle-companion@drone
journalctl -u vehicle-companion@drone -f
```

## 與 Mission Planner 並存

mavlink-router 同時服務所有 endpoint：Mission Planner 以 **TCP** 連 `<Pi IP>:5760` 或 **UDP** 連 `<Pi IP>:14550`。校正、刷韌體、DataFlash 日誌下載仍建議用 Mission Planner 做。

- companion 用 `source_system = 253`，避開 Mission Planner 的 255。
- companion 只接受「回給自己」的 COMMAND_ACK：Mission Planner 同時操作時，雙方的 ACK 不會互搶。
- Mission Planner 連上時會用 `REQUEST_DATA_STREAM` 改掉飛控的訊息頻率；companion 每 20 秒以 `SET_MESSAGE_INTERVAL` 重設一次。
- 地面站狀態列會顯示「有其他 GCS 連線」。

## GCS 失控保護（`gcs_heartbeat`）

ArduPilot 的 GCS failsafe 只看 `SYSID_MYGCS`（4.7 起為 `MAV_GCS_SYSID`）送來的 HEARTBEAT。

| 設定 | 行為 | 何時用 |
|:---|:---|:---|
| `off`（預設） | companion 不送心跳 | 用 Mission Planner/遙控器當主要 GCS 時 |
| `operator` | 只有在地面站「取得控制權」且瀏覽器仍在線時送心跳 | 只靠網頁地面站遠端飛行（4G），並把 `SYSID_MYGCS` 設為 253 |
| `always` | companion 活著就送 | 不建議：操作者斷線時 Pi 仍冒充 GCS，會遮蔽失控保護 |

## 本機開發（無實體）

```bash
cd companion && python -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"
node ../scripts/seed-vehicle-local.mjs http://localhost:3100    # 印出設定檔，存成 companion.local.toml
python -m vehicle_companion.tools.fake_autopilot --vehicle copter --to 127.0.0.1:14550
python -m vehicle_companion --config companion.local.toml
```

`fake_autopilot` 是類 ArduPilot 的模擬器，涵蓋模式、上鎖/解鎖、起飛/goto/RTL、任務/圍欄/Rally、參數、雲台元件與 PreArm 失敗（`--prearm-fail "Compass not calibrated"`）。它和 companion 出自同一套假設，真正的飛控行為仍需 SITL 驗證：`sim_vehicle.py -v ArduCopter --out udp:127.0.0.1:14550`。

## MQTT（transport = "iot"）

依 [`vehicles-iot-provisioning.md`](./vehicles-iot-provisioning.md) 佈建後，設 `transport = "iot"` 並填 `[mqtt]`（`endpoint`、`companion_id` = companionId、三個憑證路徑）。遙測與 ack 仍走 HTTPS，只有指令改由 MQTT 即時推送，HTTPS 輪詢仍作為備援。

## 指令執行規則

- **三條執行道**：
  - 優先道：上鎖、RTL、降落、Hold、任務暫停。立即執行，並取消排在前面或正在跑的一般指令（回 `PREEMPTED`）。
  - 一般道：其他短指令，逐一執行。
  - 慢速道：任務/圍欄/Rally 傳輸、參數。與前兩道互不阻塞。
- **過期拒絕**：伺服器時間同步後（telemetry 回應帶 `now`），超過期限的指令回 `EXPIRED`，不會在 4G 重連後補做舊指令。
- **去重與 ack 重送**：同一指令 id 只執行一次；ack POST 失敗會一直重送，重複收到已完成的指令會重送 ack。

## 疑難排解

| 症狀 | 可能原因 |
|:---|:---|
| 一直沒有 `pinned vehicle` 訊息 | mavlink-router 沒跑、`mavlink_url` 埠號與 router 的 companion endpoint 不符、飛控 `SERIALx_PROTOCOL` 不是 2 |
| app 顯示 offline | token 錯（log 有 401）、`api_base` 不通 |
| 指令都回 `EXPIRED` | 伺服器回應的 `now` 與指令時間差太多（伺服器時鐘錯誤） |
| set_mode 回 `BAD_MODE` | 該模式不屬於這種載具（Copter/Rover 模式表不同） |
| takeoff 被拒 | 需先能進 GUIDED 且 arm 成功；arm 失敗訊息會附上 PreArm 原因 |
| 任務上傳回 `MISSION_UPLOAD_FAILED:MAV_MISSION_…` | 看後面的 MAV_MISSION 代碼；ArduPilot 會以自身 home 覆寫 seq 0，屬正常 |
| Mission Planner 連不上 | 連 `<Pi IP>:5760`（TCP）或 14550（UDP）；確認 `systemctl status mavlink-router` |
