# 即時影像（Pi 相機 + MediaMTX）

地面站的影像來自樹莓派上的 [MediaMTX](https://mediamtx.org/)。

- MediaMTX 直接讀 Pi 相機（CSI，`rpiCamera` 來源）並硬體編碼 H.264。
- 同一路影像提供三種出口：
  - WebRTC（WHEP）：給網頁，延遲約 200 ms。
  - RTSP：給 Mission Planner / QGC。
  - 錄影檔。
- companion 不處理影像本身，只透過 MediaMTX 的控制 API 回報串流狀態、切換錄影。

```
Pi Camera ──CSI── MediaMTX ──WHEP :8889──▶ 網頁地面站（影像頁/子母畫面/HUD 疊加）
                       ├────RTSP :8554──▶ Mission Planner / QGC
                       └────API :9997 ◀── vehicle_companion（狀態、錄影開關）
```

## 安裝 MediaMTX（Raspberry Pi OS 64-bit）

1. 從 [MediaMTX releases](https://github.com/bluenviron/mediamtx/releases) 下載 `linux_arm64` 版本，解壓到 `/opt/mediamtx`。
2. 用下面的設定取代 `/opt/mediamtx/mediamtx.yml` 中對應的部分。
3. 建立 systemd 服務（`ExecStart=/opt/mediamtx/mediamtx /opt/mediamtx/mediamtx.yml`、`Restart=always`）並啟用。

```yaml
# 控制 API：只給本機的 companion 用
api: yes
apiAddress: 127.0.0.1:9997

# WebRTC（WHEP）：網頁用
webrtc: yes
webrtcAddress: :8889
webrtcAllowOrigin: "*"
# 4G / Tailscale：寫上 Pi 在 tailnet 的位址，讓對方收得到候選位址
# webrtcAdditionalHosts: [100.x.y.z]

rtsp: yes
rtspAddress: :8554

paths:
  cam:
    source: rpiCamera
    rpiCameraWidth: 1280
    rpiCameraHeight: 720
    rpiCameraFPS: 30
    rpiCameraBitrate: 2500000
    # 低延遲：短 GOP，丟包後能快速恢復
    rpiCameraIDRPeriod: 30
    # 錄影由地面站的錄影鈕切換（companion 呼叫 API）
    record: no
    recordPath: /var/lib/mediamtx/recordings/%path/%Y-%m-%d_%H-%M-%S-%f
```

## companion 設定

```toml
[video]
api_url = "http://127.0.0.1:9997"
path = "cam"
```

設定後，遙測會帶 `video: { ready, readers, rec }`，地面站的錄影鈕才能使用（指令 `video_record {on}`）。

## 地面站設定

在載具的「設定」頁籤填 **影像網址**，也就是 MediaMTX 路徑的網址（結尾 `/whep` 可省略）：

| 情境 | 影像網址 |
|:--|:--|
| 同一個區網、Control Center 在本機 `http://localhost` 開 | `http://<Pi IP>:8889/cam` |
| Control Center 是 HTTPS（正式環境） | 必須是 `https://`。在 Pi 上 `tailscale serve --bg --https=8889 http://127.0.0.1:8889`，填 `https://<pi>.<tailnet>.ts.net:8889/cam` |

- HTTPS 頁面不能播放 `http://` 的影像（混合內容）；「設定」頁會提示原因。
- 從公開網站連到區網或 Tailscale 位址時，Chrome 可能跳出「存取區域網路裝置」的授權，要允許。

## 使用

- **地圖與影像互換**：飛行資料頁右側上方的「地圖／影像」切換主畫面，另一個顯示在左下角的子母畫面。
- **HUD 疊加**：影像主畫面時按「HUD」，把姿態儀表（只畫刻度、不畫天空地面）疊在影像上。
- **截圖**：在瀏覽器存成 PNG，檔名帶時間與座標。
- **錄影**：錄在 Pi 上（`recordPath`），不經網路；錄影中畫面角落顯示 REC。
- **斷線重連**：影像中斷（4G 切換基地台、Pi 重開）會每 3 秒自動重連。

## 4G 注意事項

- **MTU**：Tailscale / WireGuard 建議 MTU 1280，避免大封包被丟。
- **位元率**：4G 上行不穩時，把 `rpiCameraBitrate` 降到 1–1.5 Mbps、解析度 960×540。
- **Mission Planner 看 RTSP**：`rtsp://<Pi>:8554/cam`（HUD 右鍵 → Video → Set GStreamer Source）。
