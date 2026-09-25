# 載具訊息契約

MQTT 與 HTTPS 共用**同一份 JSON**。所有 payload 皆設計在 1 KB 以內，便於 ESP32 次輪實作。欄位定義的真實來源是 `lib/control-center/vehicles/types.ts` 與 `schemas.ts`。

## MQTT 主題

| 主題 | 方向 | 說明 |
|:---|:---|:---|
| `vehicles/{companionId}/cmd` | 伺服器 → companion | 指令推送（QoS 1，companion 訂閱） |
| `vehicles/{companionId}/telemetry` | （保留給 ESP32 輪次） | 目前遙測走 HTTPS |
| `vehicles/{companionId}/ack` | （保留） | 目前 ack 走 HTTPS |

`companionId` = 載具的 `companionId` 欄位 = IoT Thing 名稱，因此憑證 policy 可用 `${iot:Connection.Thing.ThingName}` 一次寫好（見 [`vehicles-security.md`](./vehicles-security.md)）。

## VehicleState（遙測快照，約 330 B）

```json
{
  "v": 1, "t": 1758790000123,
  "armed": true, "mode": "GUIDED", "sys": "ACTIVE",
  "bat": { "pct": 87, "v": 12.4, "a": 3.1 },
  "gps": { "fix": 3, "sats": 12, "hdop": 0.9 },
  "pos": { "lat": 24.1234567, "lon": 120.1234567, "alt": 45.2, "rel": 12.0 },
  "hdg": 271.5, "gs": 3.2, "vs": -0.1,
  "wp": { "cur": 2, "n": 6 },
  "fw": "ArduCopter V4.5.7"
}
```

| 欄位 | 意義 |
|:---|:---|
| `t` | companion 取樣時的 epoch ms |
| `mode` | ArduPilot 飛行模式名稱 |
| `sys` | MAV_STATE 名稱（ACTIVE / STANDBY / CRITICAL…） |
| `bat` | 電量 %、電壓 V、電流 A |
| `gps.fix` | 0 無、2 2D、3 3D、4 DGPS、5 RTK float、6 RTK fixed |
| `pos.alt` / `pos.rel` | 海拔／相對起飛點高度（公尺） |
| `hdg`、`gs`、`vs` | 航向度、對地速度 m/s、爬升率 m/s |
| `wp` | 目前／總航點 |

## 遙測 POST

`POST /api/device/vehicles/telemetry`（Bearer device token）

```json
{ "state": VehicleState, "history": [VehicleState, …] }   // history 選填，≤ 60 筆
```

回應：

```json
{ "ok": true, "commands": [VehicleCommandMsg, …], "timedOut": 0 }
```

`commands` 是該載具尚未執行的指令（回傳後伺服器把它們標為 `sent`）——這是本機模式的送達通道。

## VehicleCommandMsg（指令封包）

```json
{ "v": 1, "id": "<cuid>", "type": "goto", "args": { "lat": 24.1, "lon": 120.1, "alt": 30 }, "iat": 1758790000000, "to": 10000 }
```

| type | args | 執行方式（companion） |
|:---|:---|:---|
| `arm` | `{}` | `MAV_CMD_COMPONENT_ARM_DISARM` param1=1 |
| `disarm` | `{ force? }` | 同上 param1=0，force 時 param2=21196 |
| `set_mode` | `{ mode }` | `set_mode` + 等 HEARTBEAT 確認 |
| `takeoff`（僅 drone） | `{ alt }` | 先 GUIDED + arm，再 `MAV_CMD_NAV_TAKEOFF` |
| `goto` | `{ lat, lon, alt }` | GUIDED + `MAV_CMD_DO_REPOSITION`（copter/rover 通用） |
| `rtl` | `{}` | 切 RTL 模式 |
| `mission_start` | `{}` | 切 AUTO + `MAV_CMD_MISSION_START` |
| `mission_upload` | `{ missionId, n, sha }` | 以 HTTPS GET 取航點，再走 MISSION 協定上傳 |
| `mission_download` | `{}` | MISSION 協定下載，再 HTTPS POST 回傳 |

`to` 是伺服器給的逾時（ms）。逾時值：arm/disarm/set_mode/goto/rtl/mission_start = 10s、takeoff = 30s、mission_upload/download = 60s。

**任務不走 MQTT。** 200 個航點約 24 KB，超出 ESP32 友善範圍，因此 `mission_upload` 只帶 `{missionId, n, sha}`，companion 另以 HTTPS 取回航點。

## Ack（≤ 1 KB）

`POST /api/device/vehicles/commands/{commandId}/ack`

```json
{ "v": 1, "id": "<cuid>", "st": "acked", "code": "MAV_RESULT_ACCEPTED", "msg": "", "t": 1758790000500, "res": { "alt": 10 } }
```

`st` 為 `acked` 或 `failed`；`code` 是 MAV_RESULT 名稱或 companion 端原因碼（`TIMEOUT`、`NOT_ARMED`、`MODE_REJECTED`、`MISSION_UPLOAD_FAILED`…）。指令已逾時後仍接受遲到的 ack，伺服器會標記 `late`。

## MissionItem（航點正規形式）

數值直接對應 MAVLink `MISSION_ITEM_INT`（`lat`/`lon`/`alt` 以浮點表示）：

```json
{ "seq": 0, "cur": 1, "frame": 0, "cmd": 16, "p1": 0, "p2": 0, "p3": 0, "p4": 0, "lat": 24.1, "lon": 120.1, "alt": 0, "ac": 1 }
```

`cmd`（MAV_CMD）與 `frame`（MAV_FRAME）保留數值，標籤只在 UI（`MAV_CMD_LABELS`、`MAV_FRAME_LABELS`）。seq 0 是 home。

## `.waypoints`（QGC WPL 110）對映

MissionPlanner 檔案格式：首行 `QGC WPL 110`，其後每列以 tab 分隔：

```
seq  current  frame  command  param1 param2 param3 param4  lat lon alt  autocontinue
```

對映到 MissionItem：`current→cur`、`command→cmd`、`param1..4→p1..4`、`autocontinue→ac`。解析／輸出由 `lib/control-center/vehicles/waypoints.ts` 處理，容錯 CRLF 與空白，seq 0 保留以便原樣來回。

## ESP32 注意事項（次輪）

- 只需：訂閱一個 MQTT 主題、解析 ≤1 KB JSON、對遙測與 ack 做 HTTPS POST、對任務做 HTTPS GET/POST。
- 不需要處理任務分塊（任務走 HTTPS）。
- device token 為純字串，直接放進 `Authorization: Bearer`。
