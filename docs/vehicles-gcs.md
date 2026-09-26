# 網頁地面站（Vehicles GCS）

`/iot-control-center/vehicles/[id]` 是每台載具的地面站，參考 Mission Planner 的畫面分工，再加上社群常提的實用功能。車隊頁（`/iot-control-center/vehicles`）有總覽地圖與清單，點任一台進入它的地面站。

程式位置：
- 頁面：`components/control-center/vehicles/gcs/`
- 狀態與鏈路：`store/useGcsStore.ts`、`lib/control-center/vehicles/link/`
- 純函式：`lib/control-center/vehicles/gcs/`（HUD 幾何、健康燈號、警示、圖磚、地理計算）

## 兩條鏈路

| | 雲端（Cloud） | 直連（Direct） |
|:--|:--|:--|
| 路徑 | 瀏覽器 → Control Center `/live`（每秒輪詢）← companion HTTPS | 瀏覽器 ⇄ companion WebSocket |
| 更新率 | 約 1 Hz | 10 Hz |
| 用途 | 任何地方（4G）監看與下指令 | 近距離或 VPN；搖桿、連續雲台控制只走這條 |
| 需要 | 登入 Control Center | 載具「設定」頁填直連網址，companion 設定 `[direct]` |

- **自動選擇**：直連新鮮時用直連，否則退回雲端。
- **狀態列分開顯示**：瀏覽器鏈路（直連/雲端/斷線）與「FC」（Pi ⇄ 飛控心跳年齡）。
- **過期門檻**：直連 1.5 s、雲端 5 s，都加了遲滯，避免 4G 抖動時 LINK LOST 反覆閃爍。
- **斷線時**：HUD 變灰、顯示 LINK LOST，指令按鈕全部停用。
- **直連驗證**：
  - 網頁向 Control Center 取一張 15 分鐘的票證（`POST /api/control-center/vehicles/[id]/direct-ticket`），當作 WebSocket 第一則訊息送出。
  - 票證以每台載具的金鑰 HMAC 簽署；金鑰由 `VEHICLE_DIRECT_SIGNING_KEY`（未設時用 `NEXTAUTH_SECRET`）+ vehicleId + tokenId 衍生。
  - 產生 device token 時，設定檔片段會一併帶出 `[direct] ticket_key`；重發 token 就會換金鑰。
- **瀏覽器限制**：
  - HTTPS 頁面只能連 `wss://`，建議在 Pi 上 `tailscale serve --bg --https=443 http://127.0.0.1:8765`。
  - 從公開網站連到區網或 Tailscale 位址時，Chrome 可能跳出「存取區域網路裝置」的授權，要按允許。
  - 「設定」頁會顯示直連失敗的原因。
- **稽核**：直連下的指令由 companion 記錄，下一次雲端遙測時補寫進指令紀錄（`via: "direct"`）。

## 飛行資料頁籤

- **HUD**：
  - 地平線、俯仰刻度、滾轉弧、對地速度帶、高度帶、爬升率、航向帶。
  - 模式與解鎖狀態、電池/GPS。
  - 第一條 PreArm 失敗訊息（和 MP 一樣）。
  - 舊版 companion（契約 v1）沒有姿態資料，會標示「無姿態資料」。
- **狀態列**：鏈路、FC、GPS（fix/衛星/HDOP）、電池（總電壓、每芯電壓、%）、EKF、震動、RC/數傳 RSSI、Pi 溫度與欠壓、PreArm、其他 GCS。
  - 燈號門檻在 `gcs/health.ts`：EKF 0.5/0.8、震動 30/60 m/s²、每芯 3.6/3.45 V。
  - 類比電流計只量得到總電壓，每芯電壓前面會加 `~`，表示是平均值。
- **數值**：大字的高度、速度、爬升率、距 Home、距航點、電壓/電流/mAh、航向、油門、風。Rover 另外顯示偏航誤差。
- **動作**：
  - 必須先打開「取得控制權」才能下指令，避免觀看者誤觸。
  - 模式切換（Copter/Rover 完整模式表，PX4 基本）。
  - **滑動解鎖**：PreArm 未通過時停用。
  - 上鎖；**強制上鎖**要另開對話框並輸入 `DISARM`。
  - RTL、Brake/Hold、降落、PreArm 檢查。
  - 起飛、改速度、改高度（起飛與改高度要確認）。
  - 任務開始/暫停/繼續、跳到第 N 點。
  - 重開飛控（僅上鎖時）。
  - 下方是指令紀錄，標示經雲端或直連。
- **訊息**：STATUSTEXT 依嚴重度上色；頂端列出**所有**目前未通過的 PreArm 項目，不只第一條。
- **圖表**：最近 5 分鐘的即時曲線，可選高度、速度、電壓、每芯、電流、姿態、震動、EKF、衛星數。
- **駕駛（Rover）**：
  - 畫面搖桿或遊戲手把左搖桿。
  - 經直連以 10 Hz 送出 GUIDED 速度與轉向率；放開搖桿就送 0。
  - companion 超過 0.3 s 沒收到指令會自動送停車；ArduPilot 本身 3 s 沒指令也會停。

## 任務規劃頁籤

Mission Planner 的 Flight Plan：左邊是計畫與工具，右邊是可編輯的地圖。分成三種，各自對應飛控的一份計畫（MAVLink `mission_type`）：

| 頁籤 | 內容 | 存檔 `kind` / 上傳 `mtype` |
|:--|:--|:--|
| 任務 | Home + 航點與 DO 指令 | `mission` / 0 |
| 電子圍籬 | 包含區、禁飛區（多邊形或圓）、返回點 | `fence` / 1 |
| Rally 點 | RTL 時可前往的點 | `rally` / 2 |

**任務編輯**：
- 按「新增航點」後點地圖，會插在選取項之後。
- 拖曳編號標記可移動航點；點航段中間的「+」可插入航點；Home 標記也能拖曳。
- 選取一項會展開，可編輯指令（依 Copter/Rover 過濾）、座標、高度、高度基準（相對 Home / 海拔 / 地形），以及依指令顯示的參數名稱（`lib/control-center/vehicles/plan/mavCmdMeta.ts`）。
- 統計：航程、預估時間、最高高度、最遠距離（`missionTools.ts` 的 `missionStats`）。
- 驗證（`validateMission`）：
  - 多旋翼第一個航行指令不是起飛。
  - 高度超過 120 m 法規上限、高度為 0。
  - 座標 0,0、離 Home 超過 1 km、航點在圍籬外、DO_JUMP 目標超出範圍。
  - 無人車帶了高度（會被忽略）。
  - 有錯誤時不能上傳。
- **測繪**：
  - 在地圖點出範圍，再選相機（Pi Camera 3、Pi HQ + 6 mm、運動相機）、高度、前後/左右重疊、航線方向，就會產生來回航線，凹多邊形也可以。
  - 依距離拍照（`DO_SET_CAM_TRIGG_DIST`）預設關閉：Pi 相機目前不會回應它。
- **續飛**（仿 MP 的 Resume）：
  - 從第 N 項產生一份新任務。
  - Copter 會先起飛到該航點高度，並補上 N 之前最後的速度、拍照、ROI、雲台設定。
  - 跳回 N 之前的 DO_JUMP 會移除，其餘重新編號。
- **匯入**：`.waypoints`（依內容自動判斷是任務、圍欄或 Rally），或 GeoJSON 多邊形（在圍欄頁籤成為包含區，在任務頁籤成為測繪範圍）。
- **匯出**：`.waypoints`。

**電子圍籬**：
- 可畫包含區/禁飛區多邊形、放置包含/禁飛圓（先填半徑再點地圖），以及設定返回點。
- 多邊形頂點可以拖曳。
- 「飛控圍籬參數」讀寫 `FENCE_ENABLE`、`FENCE_TYPE`（位元勾選）、`FENCE_ACTION`、`FENCE_ALT_MAX`、`FENCE_RADIUS`。
- 有上傳多邊形但 `FENCE_TYPE` 沒勾多邊形時會警告：這種情況下圍籬上傳了也不會生效。

**上傳與比對**：
- 按「上傳到載具」會先存檔，再送 `mission_upload`。
- 走直連時航點直接夾在指令裡；走雲端時由 companion 以 HTTPS 取回。
- 上傳後會自動讀回，逐項比對（忽略飛控自己的 Home 與 float32 誤差），一致時顯示綠色勾勾。
- 「從載具下載」會把飛控上的內容載入編輯器；走雲端時同時存成一筆 `source: download` 的紀錄。

## 參數頁籤

對應 Mission Planner 的 Config/Tuning。參數讀寫都在 companion 的慢速道執行，不會卡住 RTL 或上鎖。

- **從載具讀取全部**：
  - `param_fetch` 會補抓漏掉的 index，完整表格存成伺服器上的快照（`akade-cc-vehicle-params`）。
  - 走直連時也會直接帶回網頁。
  - 快照有歷史，可以切回任一份。
- **說明**：
  - 瀏覽器直接抓 ArduPilot 發布的 `apm.pdef.json`（Copter 或 Rover，約 2 MB，有 CORS），整理成名稱 → 說明、單位、範圍、選項、位元遮罩、是否需重開。
  - 這份說明是 ArduPilot 開發版，少數參數可能和機上韌體不同。
- **全部參數**：
  - 可搜尋名稱或說明，可切換只看修改中、隱藏進階。
  - 選項型參數用下拉選單；位元遮罩展開成勾選框；超出範圍會提示。
  - 需重開的參數標 ⟳。
- **安全設定**：
  - 依機型整理的失控保護相關參數：電池、遙控器、地面站、EKF/震動、圍籬、RTL/降落、解鎖檢查、雲台（Rover 另有 FS_ACTION、導航速度）。
  - 上方的設定健檢（`configChecks`）會指出：
    - companion 心跳策略與 `SYSID_MYGCS`/`MAV_GCS_SYSID` 對不上。
    - 沒有電池監測、解鎖檢查被關閉、遙控器失控保護關閉。
    - STorM32 那個埠的 SRx 要設 0。
    - TELEM2 不是 MAVLink2。
- **比對**（MP 的 Compare Params）：
  - 載入 `.param`（MP 或 QGC 格式）或選另一份快照，只列出不同的參數。
  - 勾選後加入待寫入。
- **寫入**：
  - 列出「舊值 → 新值」確認後，每 50 個一批送 `param_set`。
  - companion 以參數名稱比對回聲、以 float32 比較數值。
  - 寫入後提醒哪些參數要重開飛控才生效。
- **存成 .param**：MP 格式，含待寫入的修改。

## 日誌頁籤

- **tlog**：
  - companion 在 Pi 上錄下所有 MAVLink 封包，每次解鎖一個檔，超過容量會刪最舊的。
  - 日誌頁經直連的 HTTP（`/files/tlogs`，帶 `Authorization: Ticket …`）列出並下載。
  - Mission Planner、MAVExplorer 都能開。
- **分析**：連到 ArduPilot 官方的 UAV Log Viewer 與 WebTools，不在這裡重做。
- **DataFlash（.bin）**：經序列埠下載很慢，解鎖時也會被拒絕，建議取 SD 卡或用 Mission Planner。

## 影像

設定影像網址（MediaMTX 的 WHEP）後，飛行資料頁右側可以切換地圖/影像主畫面，另一個顯示成子母畫面；影像上可疊 HUD、截圖、控制 Pi 上的錄影。設定方式見 [`vehicles-video.md`](./vehicles-video.md)。

## 地圖

- **底圖**：國土測繪中心正射影像（預設）、通用版電子地圖、Esri 衛星、OSM。
- **圖層內容**：載具圖示（依航向旋轉）、軌跡、Home、GUIDED 目標與連線。
- **右鍵或長按**：飛到/開到這裡（確認高度）、設為 Home、量距離與方位；「雲台看這裡」在雲台里程碑啟用。
- **離線圖磚**：
  - `public/tile-sw.js` 以 cache-first 快取看過的圖磚，範圍限在 `/iot-control-center/vehicles/`。
  - 國土測繪圖層可以「預抓此區」，一次最多 3000 張。
  - OSM 與 Esri 的使用條款不允許大量預抓，所以只做被動快取。
  - 所有圖磚來源都支援 CORS，快取存的是真實回應，不是 opaque 回應。

## 語音警示

- 按「語音開」後，用瀏覽器的 Web Speech API 以目前語系播報（瀏覽器規定要先有使用者點擊）。
- **播報時機**：模式變更、解鎖/上鎖、電池偏低/危險、連線中斷/恢復、飛控無回應、GPS 不良、EKF 異常、震動過高、超出圍籬，以及嚴重度 CRITICAL 以上的 STATUSTEXT（例如 failsafe）。
- **防誤報**：
  - 缺資料不會觸發或清除任何警示（避免 MP 的「電池 0 伏」誤報）。
  - 條件要持續一段時間才播報：電池 5 s、其他 3 s。
- 語音關閉時仍會跳出畫面提示。
