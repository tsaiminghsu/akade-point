# 載具訊息契約

MQTT 與 HTTPS 共用**同一份 JSON**。欄位定義的真實來源是 `lib/control-center/vehicles/types.ts` 與 `schemas.ts`；companion 端是 `companion/vehicle_companion/state.py`。

契約有兩版，伺服器兩版都收：

| 版本 | 用途 | companion 設定 |
|:---|:---|:---|
| v1 | 舊版清單/抽屜 UI；每個欄位都是數字，未知時送 0 | `contract = 1` |
| v2 | 網頁地面站；未知一律 `null`，另帶姿態、EKF、震動、PreArm、STATUSTEXT 等 | `contract = 2` |

## MQTT 主題

| 主題 | 方向 | 說明 |
|:---|:---|:---|
| `vehicles/{companionId}/cmd` | 伺服器 → companion | 指令推送（QoS 1，companion 訂閱） |
| `vehicles/{companionId}/telemetry` | （保留） | 目前遙測走 HTTPS |
| `vehicles/{companionId}/ack` | （保留） | 目前 ack 走 HTTPS |

`companionId` = 載具的 `companionId` 欄位 = IoT Thing 名稱，因此憑證 policy 可用 `${iot:Connection.Thing.ThingName}` 一次寫好（見 [`vehicles-security.md`](./vehicles-security.md)）。

## VehicleState v2（遙測快照，約 1.5 KB）

規則：**不知道就是 `null`，絕不填 0**；每個欄位只在它來源的 MAVLink 訊息夠新時才回報（快速組 3 s、中速 5 s、慢速 10 s），否則變成 `null`。飛控心跳斷了，所有即時欄位都是 `null`。

```json
{
  "v": 2, "t": 1790000000000,
  "fc": { "ok": true, "age": 0.5, "id": [1, 1] },
  "veh": { "cls": "copter", "ap": "ardupilot", "mavType": 2 },
  "armed": false, "mode": "STABILIZE", "sys": "STANDBY",
  "att": { "r": 1.8, "p": -1.4, "y": 271.5 },
  "bat": { "v": 16.8, "a": 0.5, "pct": 100, "mah": 0, "cells": 4, "cellV": 4.2, "cellAvg": true },
  "gps": { "fix": 3, "sats": 14, "hdop": 0.8 },
  "pos": { "lat": 25.033, "lon": 121.5654, "alt": 12.0, "rel": 0.0 },
  "home": { "lat": 25.033, "lon": 121.5654, "alt": 12.0 },
  "hdg": 271.5, "gs": 0.0, "as": 0.0, "vs": 0.0, "thr": 0,
  "wp": { "cur": 0, "n": 0, "dist": 0, "xt": 0.0 },
  "ekf": { "flags": 1023, "vel": 0.05, "posH": 0.08, "posV": 0.04, "compass": 0.03, "terrain": 0.0, "worst": 0.08 },
  "vibe": { "x": 0.5, "y": 0.6, "z": 0.7, "clip": [0, 0, 0] },
  "rssi": { "rc": 91, "radio": null },
  "health": { "prearm": true, "bad": [], "msgs": [] },
  "fence": { "breach": false, "count": 0, "type": 0 },
  "wind": { "dir": 270, "spd": 3.2 },
  "comp": { "tempC": 52.1, "load": 0.4, "cpus": 4, "diskFreeMb": 12000, "throttled": [], "uptimeS": 120 },
  "caps": ["mission", "params", "fence", "rally", "command_int"],
  "gcs": { "others": 0, "policy": "off", "hb": false },
  "fw": "ArduCopter V4.5.7"
}
```

| 欄位 | 意義 | 來源 |
|:---|:---|:---|
| `t` | 快照時間，已對齊伺服器時鐘（Pi 沒有 RTC） | — |
| `fc` | Pi⇄飛控鏈路：`ok` 近 5 s 有心跳、`age` 心跳秒數、`id` 鎖定的 [sysid, compid] | HEARTBEAT |
| `veh` | 載具類別 copter/rover/plane、韌體家族 ardupilot/px4/generic | HEARTBEAT |
| `att` | 滾轉/俯仰/偏航（度，偏航 0–360） | ATTITUDE |
| `bat` | 電壓、電流、%、已用 mAh；`cellV` 為最低芯（智慧電池）或總壓/串數（`cellAvg: true`） | SYS_STATUS、BATTERY_STATUS |
| `gps` | fix（0 無、2 2D、3 3D、4 DGPS、5/6 RTK）、衛星數、HDOP | GPS_RAW_INT |
| `pos` / `home` | 位置（`alt` 海拔、`rel` 相對 home）；沒有定位時為 `null` | GLOBAL_POSITION_INT、HOME_POSITION |
| `hdg`、`gs`、`as`、`vs`、`thr` | 航向、對地/空速、爬升率、油門 % | GLOBAL_POSITION_INT、VFR_HUD |
| `wp` | 目前/總航點、到航點距離 m、偏航誤差 m | MISSION_CURRENT、NAV_CONTROLLER_OUTPUT |
| `ekf` | EKF 變異數（MP：>0.5 注意、>0.8 危險）；`worst` 為前四項最大值 | EKF_STATUS_REPORT |
| `vibe` | 震動 m/s²（≤30 良好、>60 危險）與加速度計削波次數 | VIBRATION |
| `rssi` | 遙控 RSSI %；數傳 RADIO_STATUS（SiK、DroneBridge） | RC_CHANNELS、RADIO_STATUS |
| `health` | `prearm` 飛控 PreArm 位元、`bad` 不健康感測器、`msgs` 目前所有 PreArm/Arm 訊息 | SYS_STATUS、STATUSTEXT |
| `comp` | Pi 溫度、負載、磁碟、`throttled`（`vcgencmd get_throttled` 欠壓/降頻旗標） | Pi |
| `caps` | 能力：mission/params/fence/rally/command_int/manual…，UI 依此顯示頁籤 | AUTOPILOT_VERSION |
| `gcs` | 其他 GCS（如 Mission Planner）數量、companion 自己的心跳策略與是否正在送 | HEARTBEAT |

v1 快照的格式見 git 歷史（`VehicleStateV1`）。伺服器端用 `summarize()`（`lib/control-center/vehicles/summary.ts`）同時讀兩版。

## 遙測 POST

`POST /api/device/vehicles/telemetry`（Bearer device token）

```json
{
  "state": VehicleState,
  "history": [VehicleState, …],
  "msgs": [{ "seq": 12, "t": 1790000000123, "sev": 2, "text": "PreArm: GPS not healthy", "comp": 1 }]
}
```

- `history` 選填，≤ 60 筆；沒有位置的點不存。
- `msgs`（v2）選填，≤ 50 筆，是新的 STATUSTEXT，存進 `akade-cc-vehicle-events`。
- `state` 序列化後上限 16 KB。

回應：

```json
{ "ok": true, "commands": [VehicleCommandMsg, …], "timedOut": 0, "now": 1790000000200, "op": false }
```

- `commands` 是尚未執行的指令（回傳後標為 `sent`），也是本機模式的送達通道。
- `now` 是伺服器時間，companion 以此對時。
- `op` 表示最近 5 s 有地面站頁面在看這台載具，驅動 companion 的 `operator` 心跳策略。

## VehicleCommandMsg（指令封包）

```json
{ "v": 1, "id": "<cuid>", "type": "goto", "args": { "lat": 24.1, "lon": 120.1, "alt": 30 }, "iat": 1790000000000, "to": 10000, "exp": 1790000010000 }
```

- `exp`：companion 對時後，過了這個時間的指令一律回 `EXPIRED`，不會開始執行。
- `exp` 從指令第一次送出時起算，重送不會延後。

| type | args | 執行方式（ArduPilot） | 執行道 |
|:---|:---|:---|:---|
| `arm` | `{}` | `COMPONENT_ARM_DISARM` p1=1；失敗時 `msg` 帶 PreArm/Arm 原因 | 一般 |
| `disarm` | `{ force? }` | p1=0，force 時 p2=21196（飛行中也會上鎖） | 優先 |
| `set_mode` | `{ mode }` | `DO_SET_MODE`；不支援時退回 SET_MODE 訊息 + 等心跳 | 一般 |
| `takeoff`（drone） | `{ alt }` | GUIDED → arm → `NAV_TAKEOFF` | 一般 |
| `land`（drone） | `{}` | LAND 模式（PX4：`NAV_LAND`） | 優先 |
| `hold` | `{}` | Copter BRAKE（無則 LOITER）、Rover HOLD、PX4 LOITER | 優先 |
| `goto` | `{ lat, lon, alt }` | `DO_REPOSITION` 走 **COMMAND_INT**（相對高度、切 GUIDED 旗標）；不支援時 GUIDED + `SET_POSITION_TARGET_GLOBAL_INT` | 一般 |
| `change_alt`（drone） | `{ alt }` | 在目前位置 reposition | 一般 |
| `change_speed` | `{ speed }` | `DO_CHANGE_SPEED`（對地速度） | 一般 |
| `rtl` | `{}` | RTL 模式（PX4：`NAV_RETURN_TO_LAUNCH`） | 優先 |
| `mission_start` | `{}` | 切 AUTO + `MISSION_START` | 一般 |
| `mission_pause` / `mission_resume` | `{}` | `DO_PAUSE_CONTINUE`；不支援時切 Hold / AUTO | 優先 / 一般 |
| `mission_set_current` | `{ seq }` | `DO_SET_MISSION_CURRENT`；不支援時 MISSION_SET_CURRENT 訊息 | 一般 |
| `mission_upload` | `{ missionId, n, sha, mtype }` | 以 HTTPS 取航點，走 MISSION 協定（mtype 0 任務/1 圍欄/2 Rally） | 慢速 |
| `mission_download` | `{ mtype }` | MISSION 協定下載，再 HTTPS POST 回傳 | 慢速 |
| `mission_clear` | `{ mtype }` | `MISSION_CLEAR_ALL` | 慢速 |
| `set_home` | `{ current: true }` 或 `{ lat, lon, alt }` | `DO_SET_HOME`（COMMAND_INT，海拔高度） | 一般 |
| `run_prearm` | `{}` | `RUN_PREARM_CHECKS`；`msg` 帶回 PreArm 訊息 | 一般 |
| `reboot` | `{}` | 上鎖時才送 `PREFLIGHT_REBOOT_SHUTDOWN` | 一般 |
| `param_get` | `{ names }`（≤50） | `PARAM_REQUEST_READ`；`res.params` 為 `{名稱: 值}` | 慢速 |
| `param_set` | `{ params }`（≤50） | `PARAM_SET`，以名稱比對回聲、float32 比較值 | 慢速 |

- 逾時：大多 10 s；takeoff 30 s；任務傳輸 90 s；參數讀 60 s、寫 90 s。
- 優先道指令會取消排在前面或正在執行的一般指令（回 `PREEMPTED`）。

**任務不走 MQTT。** 200 個航點約 24 KB，因此 `mission_upload` 只帶 `{missionId, n, sha}`，companion 另以 HTTPS 取回航點。

## Ack（≤ 1 KB）

`POST /api/device/vehicles/commands/{commandId}/ack`

```json
{ "v": 1, "id": "<cuid>", "st": "acked", "code": "MAV_RESULT_ACCEPTED", "msg": "", "t": 1790000000500, "res": { "alt": 10 } }
```

- `st` 為 `acked` 或 `failed`。
- `code` 是 MAV_RESULT 名稱或 companion 端原因碼：`TIMEOUT`、`EXPIRED`、`PREEMPTED`、`NO_VEHICLE`、`BAD_MODE`、`MODE_REJECTED`、`ARMED`、`UNSUPPORTED`、`MISSION_UPLOAD_FAILED:<MAV_MISSION_…>`、`PARAM_SET_FAILED`…
- 指令已逾時後仍接受遲到的 ack，伺服器會標記 `late`。
- ack POST 失敗時 companion 會一直重送；重複收到已完成的指令會再送一次 ack。

## MissionItem（航點正規形式）

數值直接對應 MAVLink `MISSION_ITEM_INT`（`lat`/`lon`/`alt` 以浮點表示）：

```json
{ "seq": 0, "cur": 1, "frame": 0, "cmd": 16, "p1": 0, "p2": 0, "p3": 0, "p4": 0, "lat": 24.1, "lon": 120.1, "alt": 0, "ac": 1 }
```

- `cmd`（MAV_CMD）與 `frame`（MAV_FRAME）保留數值，標籤只在 UI。
- 只有任務（mtype 0）的 seq 0 是 home；圍欄與 Rally 從第一個項目開始。
- 上傳時 seq 一律以陣列位置重編。

## `.waypoints`（QGC WPL 110）對映

MissionPlanner 檔案格式：首行 `QGC WPL 110`，其後每列以 tab 分隔：

```
seq  current  frame  command  param1 param2 param3 param4  lat lon alt  autocontinue
```

對映到 MissionItem：`current→cur`、`command→cmd`、`param1..4→p1..4`、`autocontinue→ac`。解析／輸出由 `lib/control-center/vehicles/waypoints.ts` 處理，容錯 CRLF 與空白，seq 0 保留以便原樣來回。

## 直連（Direct）WebSocket

companion 的 `[direct]` 開啟後，監聽 `ws://<host>:<port>/ws`（前面接 Tailscale serve 或反向代理成 `wss://`）。

- 協定是 JSON 文字訊息。
- 瀏覽器第一則必須在 5 s 內驗證：`{"k":"auth","ticket":"…"}`（票證由 Control Center 簽）或 `{"k":"auth","pin":"…"}`（離線場地用，一分鐘最多試 5 次）。
- 若設了 `allowed_origins`，`Origin` 不在清單內的連線一律拒絕。

| 方向 | 訊息 | 說明 |
|:---|:---|:---|
| ← | `{"k":"hello", vid, scope, sub, contract:2, now, msgs}` | 驗證成功；`msgs` 是最近 50 則 STATUSTEXT |
| ← | `{"k":"state","s":VehicleStateV2}` | 10 Hz |
| ← | `{"k":"msg","e":{seq,t,sev,text,comp}}` | 每則 STATUSTEXT |
| ← | `{"k":"ack","a":Ack}` | 所有指令的 ack（含雲端下的） |
| → | `{"k":"cmd","cmd":{id:"d_…",type,args}}` | 需 `control` 票證；id 必須以 `d_` 開頭 |
| → | `{"k":"manual","vx":m/s,"yr":rad/s}` | Rover 搖桿；companion 轉成 GUIDED 的 `SET_POSITION_TARGET_LOCAL_NED`（BODY_NED、type_mask 0x05C7），0.3 s 沒更新就送 0 |
| → | `{"k":"op","on":true}` | 此操作者持有控制權（`operator` 心跳策略） |
| → / ← | `{"k":"ping","t"}` / `{"k":"pong","t","now"}` | 應用層 ping；另有每 2 s 的 WebSocket 協定層 ping/pong |

- 票證格式：`base64url(JSON{vid,sub,scope,exp,n}) + "." + base64url(HMAC-SHA256(ticket_key, 第一段))`。
- 兩端的實作是 `lib/control-center/vehicles/directTicket.ts` 與 `companion/vehicle_companion/links/ticket.py`，用同一組測試向量驗證。
