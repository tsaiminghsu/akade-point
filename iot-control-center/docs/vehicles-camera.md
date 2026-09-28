# Pi 相機當 MAVLink 相機（地理標記照片、測繪拍照）

companion 在載具的 MAVLink 網路上扮演一台相機：
- **身分**：載具的 sysid、元件 100（MAV_COMP_ID_CAMERA），走 MAVLink Camera Protocol v2。
- **觸發方式**：飛控、地面站都能叫它拍照。
- **照片**：寫入拍攝當下的 GPS 位置、海拔、航向與時間（EXIF），存在 Pi 上，地面站經直連查看與下載。

驗證（2026-09-28，ArduCopter 4.7.1 SITL，`source = "test"`）：
- **飛控觸發**：`CAM1_TYPE = 6` 時，飛控會把 `DO_DIGICAM_CONTROL` 轉給相機拍照。
- **測繪任務**：`DO_SET_CAM_TRIGG_DIST 20` 在 30 公尺高度飛 160 公尺，拍了 10 張，間距 19.2–21.8 公尺。
- **EXIF**：地理標記與位置紀錄一致到小數第 7 位，另用 Windows GDI+ 讀回確認。
- **尚未在實機驗證**：真實 Pi 相機、ffmpeg／rpicam 擷取。

## 運作方式

```
飛控（CAM1_TYPE=6）──MAV_CMD_IMAGE_START_CAPTURE──▶ companion 相機（元件 100）
地面站「拍照」──camera_capture 指令──────────────▶      │ 擷取一張 → 寫 EXIF GPS → 存檔
                                                        ├─▶ CAMERA_IMAGE_CAPTURED（回給飛控與 GCS）
                                                        └─▶ photos/index.jsonl、直連 /files/photos
```

- **地理標記的時機**：用「收到拍照要求那一刻」的載具位置（`GLOBAL_POSITION_INT`）。擷取本身的延遲（ffmpeg 約 0.3–1 秒）不會讓位置偏掉，但照片內容仍是稍後那一刻的畫面。
- **相機支援的請求**：`CAMERA_INFORMATION`、`CAMERA_SETTINGS`、`STORAGE_INFORMATION`、`CAMERA_CAPTURE_STATUS`（含舊式 `REQUEST_*` 指令）。
- **拍照指令**：`IMAGE_START_CAPTURE`（單張或定時）、`IMAGE_STOP_CAPTURE`、`DO_DIGICAM_CONTROL`（`CAM1_TYPE = 5` 的舊式觸發）、`REQUEST_CAMERA_IMAGE_CAPTURE`（補發某張的回報）。

## 設定

### companion

```toml
[camera]
enabled = true
# rtsp：從 MediaMTX 的串流抓一張（串流照常進行；解析度＝串流解析度）
# rpicam：rpicam-still 全解析度（相機不能同時被 MediaMTX 占用）
# test：內建測試畫面（SITL 用）
source = "rtsp"
rtsp_url = "rtsp://127.0.0.1:8554/cam"
photos_dir = "/var/lib/vehicle-companion/drone/photos"
model = "Raspberry Pi Camera Module 3"
```

- **`rtsp`** 需要 ffmpeg：`sudo apt install ffmpeg`。
  - 照片解析度等於串流解析度（例如 1920×1080）。
  - 測繪要高解析度的話，把 MediaMTX 的 `rpiCameraWidth/Height` 調高，或改用 `rpicam`。
- **`rpicam`** 用 `rpicam-still --immediate`。
  - Pi 相機同一時間只能被一個程式使用，所以要停掉 MediaMTX 的 `rpiCamera` 來源，也就是沒有即時影像。
- **鏡頭參數**：`focal_mm`、`sensor_w_mm`、`sensor_h_mm`、`width`、`height` 會放進 `CAMERA_INFORMATION`，預設是 Camera Module 3。

### 飛控（ArduPilot）

| 參數 | 值 | 說明 |
|:---|:---|:---|
| `CAM1_TYPE` | 6（MAVLinkCamV2） | 改完要重開 |
| `SERIALx_PROTOCOL` | 2 | 接 Pi 的那個埠。本來就該如此，mavlink-router 靠它 |

飛控從 companion 的相機心跳認得它，之後以下動作都會拍照：
- 任務中的 `DO_SET_CAM_TRIGG_DIST` 或 `DO_DIGICAM_CONTROL`。
- 遙控器的相機觸發開關。

## 地面站

- **「相機」頁籤**：companion 回報 `camera` 能力時出現。
  - 立即拍照；定時連拍（間隔秒數、張數，0＝直到停止）與停止。
  - 顯示張數與最後一張的時間。
  - 最近 12 張縮圖，點開看原圖或下載。✈ 標示由飛控觸發。
  - 飛行資料的地圖上，紫點是每張照片的拍攝位置。
- **任務規劃的測繪工具**：勾「依距離觸發相機」就會插入 `DO_SET_CAM_TRIGG_DIST`。
- **照片存放**：照片不上雲，存在 Pi 上，經直連下載（`GET /files/photos`、`/files/photos/{name}`，與 tlog 相同的票證驗證）。

## 限制與後續

- 照片目前只在 Pi 上。上傳雲端（S3）與在回放頁顯示照片點，列為後續。
- `rtsp` 的照片是影片畫格，品質取決於串流的位元率與解析度。
- 沒有實作相機定義檔（`cam_definition_uri`），所以 MP/QGC 裡沒有曝光等可調設定。
