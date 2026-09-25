# Companion（樹莓派）設定指南

companion 是掛在載具上的橋接程式：一端接飛控的 MAVLink，一端接 Control Center（HTTPS，選配 MQTT），並把 MAVLink 轉發給 MissionPlanner。程式在 `companion/`。

## 接線

- **Pixhawk / ArduPilot 飛控 → 樹莓派**：TELEM2 UART 接樹莓派的 `/dev/serial0`（先 `raspi-config` 關閉序列 console、開啟硬體序列），或用 USB 接 `/dev/ttyACM0`。
- 樹莓派連上與筆電（MissionPlanner）同一網路。

## 安裝

```bash
cd /opt && sudo git clone <repo> vehicle-companion && cd vehicle-companion/companion
python3 -m venv .venv && . .venv/bin/activate
pip install -e .
```

## 設定檔

在 app 中 Vehicles → 目標載具 → **設定（Setup）** 分頁 → 產生 Token，把 `vehicle_id` 與 `token` 填入設定檔（範本 `companion.example.toml`）：

```toml
vehicle_id = "..."
api_base = "https://your-control-center.example.com"
token = "vt_..._..."
transport = "http"                       # 或 "iot"（見下）
mavlink_url = "/dev/serial0"             # 實機；SITL 用 "udpin:127.0.0.1:14550"
source_system = 253
telemetry_interval_s = 1.0
history_every_s = 5.0
forward_udp = ["<筆電IP>:14550"]         # 讓 MissionPlanner 連
```

## 與 MissionPlanner 並存

companion 內建雙向 UDP 轉發：`forward_udp` 列出的每個位址都會收到 MAVLink，且它們回傳的 bytes 會寫回飛控。MissionPlanner 直接連該 UDP 埠即可與 companion 同時操作。companion 的 `source_system=253` 避開 MissionPlanner 的 255。

> 若用 MAVProxy 當 hub 也可：`mavproxy.py --master=/dev/serial0 --out=udp:127.0.0.1:14560 --out=udp:<筆電IP>:14550`，companion 連 14560、MissionPlanner 連 14550。

## systemd 常駐

```bash
sudo cp deploy/vehicle-companion.service /etc/systemd/system/
sudo mkdir -p /etc/vehicle-companion && sudo cp companion.toml /etc/vehicle-companion/
sudo systemctl daemon-reload && sudo systemctl enable --now vehicle-companion
journalctl -u vehicle-companion -f
```

## SITL 測試（無實體）

```bash
# 於有 ArduPilot 的環境（WSL2 建議 mirrored networking，或 Linux）：
sim_vehicle.py -v ArduCopter --out udp:127.0.0.1:14550 --out udp:127.0.0.1:14551
# companion.toml: mavlink_url = "udpin:127.0.0.1:14550"、api_base 指向 next dev
python -m vehicle_companion --config companion.toml
# MissionPlanner 連 UDP 14551
```

`scripts/seed-vehicle-local.mjs http://localhost:3000` 會建立載具、產生 token 並印出可貼的設定檔。

## MQTT（transport = "iot"）

依 [`vehicles-iot-provisioning.md`](./vehicles-iot-provisioning.md) 佈建後，`companion.toml` 設 `transport = "iot"` 並填 `[mqtt]`（`endpoint`、`companion_id` = companionId、三個憑證路徑）。遙測與 ack 仍走 HTTPS，只有指令改由 MQTT 即時推送，HTTPS 輪詢仍作為備援。

## 疑難排解

| 症狀 | 可能原因 |
|:---|:---|
| 一直等 heartbeat | `mavlink_url` 錯、序列埠沒開、鮑率不符（USB 通常自動） |
| app 顯示 offline | token 錯（看 log 是否 401）、`api_base` 不通、系統時間偏差過大 |
| set_mode 失敗 | 模式名稱需大寫且該機型支援（drone/rover 清單見契約文件） |
| takeoff 被拒 | 需先能進 GUIDED 且 arm 成功（GPS 定位、安全開關） |
| 任務上傳 ack 非 0 | 航點格式或 home 問題；ArduPilot 會以自身 home 覆寫 seq 0，屬正常 |
| MissionPlanner 收不到 | `forward_udp` 的 IP／埠、防火牆 |
