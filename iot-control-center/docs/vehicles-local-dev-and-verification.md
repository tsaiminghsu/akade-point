# 載具模組：本機開發與驗證

整個迴圈（SITL → companion → Next.js + DynamoDB Local → 瀏覽器）不需 AWS。

## 環境

```bash
# 1. DynamoDB Local
node scripts/start-dynamodb-local.mjs
DYNAMODB_LOCAL_ENDPOINT=http://localhost:8500 node scripts/create-tables.mjs
DYNAMODB_LOCAL_ENDPOINT=http://localhost:8500 node scripts/seed-control-center-local.mjs

# 2. .env.local
#   DYNAMODB_LOCAL_ENDPOINT=http://localhost:8500
#   VEHICLE_TRANSPORT=local
#   NEXTAUTH_URL / NEXTAUTH_SECRET（開發用任意值即可，因非 production 繞過驗證）

# 3. Next.js
npm run dev:next

# 4. 建立載具 + token（對 dev server）
node scripts/seed-vehicle-local.mjs http://localhost:3000
```

## ArduPilot SITL（Docker，Windows 也能跑）

`companion/sitl/` 把 ArduPilot 官方預編 SITL（4.7.1）和 mavlink-router 放在同一個 Linux 容器，拓樸和 Pi 相同：
- **飛控端**：router 連飛控（這裡是 SITL 的 serial0 TCP，實機是 UART）。
- **companion**：在主機上，router 以 Normal 模式送到 `host.docker.internal:14540`。
- **Mission Planner / QGC**：接 router 的 TCP 5760 或 UDP 14550。

```bash
docker build -t akade-sitl companion/sitl                  # 第一次約 1 分鐘（下載 SITL、編 mavlink-router）
docker run --rm -p 5760:5760 -p 14550:14550/udp -e VEHICLE=copter akade-sitl   # 或 VEHICLE=rover
node scripts/seed-vehicle-local.mjs http://localhost:3000 --sitl            # 無人車加 --rover
# 把印出的設定存成 companion.local.toml（mavlink_url = "udpin:0.0.0.0:14540"）
cd companion && .venv/Scripts/python -m vehicle_companion --config companion.local.toml
```

- **Mission Planner 同時連線**：MP 選 TCP，連 `127.0.0.1:5760`。
  - 也可以在 MP 的 `Documents\Mission Planner\config.xml` 把 AutoConnect 裡的「Mavlink sitl port」（TCP 5760）設成 Enabled，MP 啟動就會自動連上。
  - MP 1.3.83 啟動時，Altitude Angel 外掛會開瀏覽器要求登入。不需要這個功能的話，把 `plugins/AltitudeAngelWings*` 移出即可。
- **SITL 的電池是 3S**（12.6 V 滿電），seed 腳本印出的 `battery_cells = 3` 就是依此設定。設錯會誤報「電池危險」。
- **剛啟動約 20 秒內**，解鎖會被拒絕（`Arm: Need Position Estimate`），等 EKF 收斂即可。地面站會把這個原因顯示在指令結果上。
- **家的位置**：`-e SITL_HOME=lat,lon,alt,hdg` 可改家的位置（預設台中）。`-e SPEEDUP=5` 可加速。

沒有 Docker 時，改用 `python -m vehicle_companion.tools.fake_autopilot`（見 `companion/README.md`）。

## 冒煙腳本

`node scripts/vehicles-smoke.mjs` 會等載具 online，然後依序 set_mode GUIDED → arm → takeoff 10 → 等相對高度 >8 → goto → rtl，逐一輪詢至終結；任一 failed/timeout 非零退出。

## 瀏覽器檢查清單（`/iot-control-center/vehicles/{id}`）

地面站各頁籤的操作與預期見 [`vehicles-gcs.md`](./vehicles-gcs.md)。基本檢查：
- **連線**：companion 啟動約 2 秒內，狀態列出現「直連」與 FC 心跳；關掉 companion 後 HUD 顯示 LINK LOST，飛行指令停用。
- **飛行**：取得控制權 → 滑動解鎖 → 起飛 → 地圖右鍵「飛到這裡」→ RTL，指令紀錄逐一顯示 acked。
- **任務規劃**：上傳後自動下載比對，不應出現差異。
- **Mission Planner 同時連線**：狀態列出現「另有 1 個 GCS」。

## 單元測試

```bash
npm test                    # 前端／伺服器：waypoints、commandState、linkState、schemas、token、
                            # cc-vehicle-commands、useVehiclesStore 等
cd companion && pytest      # companion：commands 執行器、mission 協定（fake link，免 SITL）
```

## 已驗證紀錄

### 2026-09-27：ArduPilot 4.7.1 SITL（Docker）+ mavlink-router + Mission Planner 1.3.83

companion 在 Windows 主機，經 router 連 SITL；指令主要走雲端路徑（API → DynamoDB → 遙測回應），搖桿走直連。

**ArduCopter**：
- **飛行**：GUIDED → 解鎖 → 起飛 10 m（到 9.98 m）→ `change_speed` 8 → `goto` 約 80 m（誤差 0.1 m）→ `change_alt` 25（到 24.95 m）→ `hold`（BRAKE）。
- **往返比對**：任務（7 項）、圍欄（4 點多邊形 + 排除圓）、Rally（2 點）都上傳後再下載比對。
- **AUTO 任務**：開始 → `DO_PAUSE_CONTINUE` 暫停/繼續 → 跳到第 5 點 → 最後的 RTL 降落在 home（距離 0.0 m）並自動上鎖；STATUSTEXT 全數上雲。
- **Mission Planner 同時連線**（TCP 5760）：
  - companion 顯示「另有 1 個 GCS」。
  - MP 抓全部參數的同時，companion 的 `param_fetch`（1369 個，3 秒）、`param_get`/`param_set`（寫入後讀回）、任務下載都正常。
  - 另一趟飛行中，MP 地圖同步顯示我們送出的飛到目標、圍欄與 Rally。

**ArduRover**：
- **解鎖**：EKF 收斂前被拒（原因正確回傳），收斂後成功。
- **指令**：`goto`（誤差 0.1 m）、`change_speed` 2（實測 2.04 m/s）、`hold`。
- **往返比對**：任務、圍欄、Rally 都往返無差異；AUTO 任務依 `DO_CHANGE_SPEED` 以約 3 m/s 跑完。
- **直連搖桿**（1.5 m/s、0.3 rad/s，10 Hz 持續 4 秒）：速度 1.5–1.77 m/s，轉 64°（理論 69°）。放開後立刻開始減速，1.9 秒內停下；剩下的時間是 Rover 本身的減速度限制。

**SITL 抓到並已修正的問題**：
- **任務比對誤報**：ArduPilot 對沒有座標的指令（DO_CHANGE_SPEED、RTL…）回傳 frame 0 與零座標。地面站的上傳後比對原本會誤報差異，現在這類指令只比 p1–p4。
- **4.7 參數更名**：
  - 更名成 SI 單位：`RTL_ALT`→`RTL_ALT_M`、`RTL_SPEED`→`RTL_SPEED_MS`、`LAND_SPEED`→`LAND_SPD_MS`、`WPNAV_SPEED`→`WP_SPD`。
  - `SYSID_MYGCS`→`MAV_GCS_SYSID`；`ARMING_CHECK`→`ARMING_SKIPCHK`（位元意義相反）。
  - 安全設定頁原本只列舊名，在 4.7 上會默默少掉這些欄位，現在新舊名稱都列。Rover 的速度參數沒有更名。
- **mavlink-router 在新版 Debian/Ubuntu 編不過**（`systemd.pc` 移到 `systemd-dev`）。安裝腳本已改為明確指定 unit 目錄。

**回歸測試**：兩次開機的 tlog 存成 `companion/tests/fixtures/sitl/*.tlog`，由 `tests/test_sitl_replay.py` 重播，檢查真實 ArduPilot 訊息產生的狀態快照。

**仍未驗證**：
- 實機：Pixhawk、STorM32、Pi 相機、ESP32。
- SITL 下的雲台。
- MP 連 Rover 的同時連線（只在 Copter 上測）。
- 真正的 Pi 上的 mavlink-router systemd 服務；容器內用的是同一份建置與設定。
