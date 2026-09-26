# STorM32 雲台

建議接法：STorM32 接到飛控，由 ArduPilot 當雲台管理者（gimbal manager），地面站與 companion 都只跟飛控溝通。這也是 STorM32 作者 olliw 推薦的方式。

```
網頁地面站 ──(直連/雲端)── companion ──MAVLink── Pixhawk（ArduPilot，MNT1_TYPE=4）──UART── STorM32 NT
```

## 接線

- STorM32 的 **UART**（或 UARTEx）接 Pixhawk 一個空的 TELEM/SERIAL 埠：TX↔RX、RX↔TX、GND。雲台另外供電。
- 不要跟 Pi 共用同一個序列埠。

## 飛控參數（ArduPilot 4.3+）

以雲台接 SERIAL4 為例：

| 參數 | 值 | 說明 |
|:--|:--|:--|
| `SERIAL4_PROTOCOL` | 2 | MAVLink2 |
| `SERIAL4_BAUD` | 115 | 115200 |
| `SR4_*`（全部） | 0 | **必須全設 0**：否則飛控會把遙測串流塞給雲台，造成延遲、卡頓 |
| `MNT1_TYPE` | 4 | STorM32 MAVLink（推薦）。5 是舊的 serial 方式，olliw 不建議 |
| `MNT1_PITCH_MIN` / `MAX` | -90 / 30 | 依雲台機構 |
| `MNT1_YAW_MIN` / `MAX` | -180 / 180 | 3 軸雲台 |
| `MNT1_DEFLT_MODE` | 3（RC）或 2（MAVLink） | 開機/取消 ROI 後的模式 |
| `MNT1_RC_RATE` | 例如 60 | >0 表示遙控器以角速度控制 |
| `RCx_OPTION` | 212/213/214 | 遙控器通道控制滾轉/俯仰/偏航 |

設定完重開飛控。地面站「參數 → 安全設定 → 雲台」可以直接讀寫 `MNT1_*`；設定健檢會提醒 SRx 要設 0。

## STorM32 設定（用 o323BGCTool）

- `Mavlink Gimbal` = **Gimbal1**
- `Mavlink Gimbal Stream` = **mountstatus**
- `Mavlink Uart Port` = **uart**（依實際接的埠）

## 地面站操作

- **飛行資料 → 雲台** 頁籤。偵測到雲台元件（HEARTBEAT type GIMBAL）或收到姿態回報時才出現。
  - **俯仰/偏航滑桿**：
    - 直連時拖曳即時送出；companion 限制最多每秒 10 次、只送最新值，因為 STorM32 超過約 10 Hz 會堆積指令造成延遲。
    - 放開時再送一次確認指令。
    - 經雲端時只在放開時送出。
  - **快捷**：朝正下方（測繪用）、朝正前方、回中、收起、偏航鎖定北方/跟隨機頭、交給遙控器、取消注視點。
- **地圖右鍵 →「雲台看這裡」**：`DO_SET_ROI_LOCATION`，鏡頭持續對準地面一點，直到取消 ROI。
- **影像主畫面點擊瞄準**：依點擊位置和相機視角（預設 Pi Camera 3：66°×41°）換算新的俯仰/偏航。

## MAVLink 細節

| 動作 | 指令 |
|:--|:--|
| 角度 | `MAV_CMD_DO_GIMBAL_MANAGER_PITCHYAW` (1000)：p1 俯仰、p2 偏航、p5 旗標（16 = 偏航鎖定地球座標）；韌體不支援時退回 `DO_MOUNT_CONTROL` (205) |
| 模式 | `DO_MOUNT_CONTROL` (205) 的 param7：0 收起、1 回中、2 MAVLink、3 RC、4 GPS 點 |
| 注視點 | `DO_SET_ROI_LOCATION` (195，COMMAND_INT，相對高度)；`DO_SET_ROI_NONE` (197) |
| 姿態 | `GIMBAL_DEVICE_ATTITUDE_STATUS`（雲台元件，四元數）或舊的 `MOUNT_STATUS`（飛控） |

程式在 `companion/vehicle_companion/ops/gimbal.py`，網頁端在 `components/control-center/vehicles/gcs/flight/GimbalPanel.tsx`。

## 常見問題

| 症狀 | 原因與處理 |
|:--|:--|
| 雲台頁籤沒出現 | 飛控沒轉發雲台訊息：確認 `MNT1_TYPE=4`、STorM32 的 Mavlink Gimbal 設定、接線與鮑率 |
| 動作延遲、一頓一頓 | 雲台埠的 `SRx_*` 沒設 0，或指令太快（companion 已限速） |
| 俯仰/偏航方向相反 | 已知的軸向反轉問題（ArduPilot issue #7246），在 STorM32 端反轉軸向 |
| 韌體沒有 STorM32 driver | 某些板子的韌體（例如 Cube Orange 4.5.3）沒把 STorM32 MAVLink 編進去，要自編韌體或暫用 `MNT1_TYPE=5` |
| 數傳（433/915 MHz）受干擾 | 部分 STorM32 v1.3x 板會干擾數傳，拉開距離或加屏蔽 |
| 想讓 Pi 直接控制 STorM32 | 目前不支援（待辦）；經飛控的方式可同時讓任務的 DO_MOUNT_CONTROL/ROI 生效 |
