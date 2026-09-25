# ESP32 Companion（次輪規劃）

樹莓派版已完成；ESP32 版尚未實作，但訊息契約已刻意設計得夠精簡，可直接沿用。本文件記錄實作邊界。

## 契約子集

ESP32 只需實作契約（[`vehicles-message-contract.md`](./vehicles-message-contract.md)）的一小部分：

- **訂閱**一個 MQTT 主題 `vehicles/{companionId}/cmd`，解析 ≤1 KB JSON 指令。
- **HTTPS POST** 遙測（`/api/device/vehicles/telemetry`）與 ack（`.../commands/{id}/ack`）。
- **HTTPS GET/POST** 任務（`/missions/{id}`、`/missions/download`）——任務不走 MQTT，故無需在裝置端組任務分塊。
- device token 為純字串，放進 `Authorization: Bearer`。

所有 payload < 1 KB，可用固定緩衝。

## 記憶體限制下的取捨

- **MAVLink C library**（`c_library_v2`，僅需 common dialect）解析 HEARTBEAT / SYS_STATUS / GPS_RAW_INT / GLOBAL_POSITION_INT / VFR_HUD，組 COMMAND_LONG / MISSION_ITEM_INT。
- JSON 用 ArduinoJson（靜態文件，容量約 1–2 KB）。
- 任務上傳可串流處理（逐一 MISSION_REQUEST → 送 item），不需一次載入全部航點。
- 若記憶體吃緊，可先只支援 `arm/disarm/set_mode/rtl/goto`，任務指令回 `failed` code `UNSUPPORTED`。

## 建議程式庫

| 用途 | 庫 |
|:---|:---|
| MQTT + TLS | `PubSubClient` + `WiFiClientSecure`（載入 Amazon Root CA + 裝置憑證） |
| HTTPS | `HTTPClient` + `WiFiClientSecure` |
| JSON | `ArduinoJson` |
| MAVLink | `mavlink` c_library_v2（common） |

## 與樹莓派版的差異

- 無 UDP 轉發（ESP32 通常直接串接單一飛控，MissionPlanner 並存用樹莓派版）。
- 無 systemd；以 `loop()` 事件迴圈取代。
- transport 固定為 iot（ESP32 主要價值在低成本 + MQTT）；HTTPS 輪詢備援仍建議保留（每次遙測回應帶回指令）。
