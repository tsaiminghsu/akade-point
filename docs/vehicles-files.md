# 照片與日誌上雲

companion 會把 Pi 相機拍的照片（含拍攝位置）、從飛控下載的 DataFlash 日誌、每次飛行的遙測日誌（.tlog）上傳到雲端。上傳後，載具關機或離線時，地面站仍然看得到：
- **「日誌」頁籤的「雲端檔案」**：照片牆與日誌清單，可下載，也可刪除。
- **「回放」頁籤**：每趟飛行顯示照片張數，地圖上用紫點標出拍攝位置，點開可看照片。

## 流程

```
companion                               Control Center                     儲存
   │ POST /api/device/vehicles/files     │                                   │
   │ {kind,name,bytes,sha256,t,geo}  ──▶ │ 寫 pending 紀錄                    │
   │ ◀── {fileId, upload:{url,headers}}  │ 預簽 PUT（S3）或自己的路由（本機）  │
   │ PUT 檔案 ──────────────────────────────────────────────────────────────▶│ S3 驗證 SHA-256
   │ POST …/files/{fileId}/complete  ──▶ │ 確認物件存在且大小相符 → stored    │
```

- **`fileId`**：格式為 `<種類>.<時間 13 位>.<SHA-256 前 16 碼>`，由內容決定。
  - companion 當機遺失上傳狀態時，再次宣告會落在同一筆紀錄，伺服器回 `already`，不會存兩份。
- **S3 模式**：
  - 檔案直接從 Pi 傳到 S3，不經過 Next.js 伺服器。
  - 預簽 URL 簽了 `Content-Type`、`Content-Length` 和 `x-amz-checksum-sha256`，所以大小或內容不符時，S3 會拒收。
  - SDK 預設會加上 CRC32 checksum，這裡已關閉，因為 companion 不會送它。
- **本機模式**：上傳走 `PUT /api/device/vehicles/files/{fileId}/content`，伺服器邊寫邊驗大小與 SHA-256，不符就丟棄。

## companion 設定

```toml
[upload]
enabled = true
photos = true
tlogs = "flights"        # off | flights（只傳飛行中的日誌）| all
dataflash = true
logs_while_armed = false # 飛行中只傳照片，日誌等上鎖後再傳
max_kbps = 0             # 上行速率上限（kbit/s），4G 上可設例如 2000，保留頻寬給影像與遙測
state_file = "/var/lib/vehicle-companion/drone/upload-state.json"
```

- **上傳順序**：照片（小，而且最想馬上看到）→ DataFlash → tlog；同種類由舊到新。
- **雲端斷線時**不嘗試上傳；恢復後會自動補傳。
- **tlog 分檔**：解鎖時開新檔（`-flight`），上鎖時再開新檔（`-ground`）。
  - 所以一趟飛行一上鎖就是一個已關閉的檔案，約 2 秒內就會上傳（SITL 實測）。
  - 正在寫入的檔案永遠不會上傳。
- **拍照後**會立刻觸發上傳，飛行中也會傳（SITL：每張 1 秒內到雲端）。
- **伺服器錯誤的處理**：
  - 伺服器沒設儲存（503 `NO_STORAGE`）：暫停 10 分鐘後再試。
  - 伺服器拒收（400，例如檔名或大小不合規定）：記進 `rejected`，不再嘗試。
  - S3 回 403（預簽 URL 過期）：30 秒後重新宣告，取得新的 URL。
- **狀態回報**：`state.upload` 會回報佇列數與大小、正在上傳的檔案與百分比、累計已傳數量和最後的錯誤，地面站的「雲端檔案」區會顯示。

## 伺服器設定

| 環境變數 | 說明 |
|:---|:---|
| `VEHICLE_FILES_BUCKET` | S3 bucket 名稱。設定後使用 S3 模式 |
| `VEHICLE_FILES_REGION` | bucket 區域，預設 `AWS_REGION` |
| `VEHICLE_FILES_ENDPOINT` | 選填，S3 相容服務（MinIO 等），使用 path-style |
| `VEHICLE_FILES_DIR` | 本機模式的目錄；開發環境預設 `.data/vehicle-files` |
| `VEHICLE_FILES_RETENTION_DAYS` | 保存天數（DynamoDB TTL），預設 90 |

- **production 沒有 bucket 也沒有目錄時**：上傳關閉。companion 會收到 503，地面站顯示「伺服器沒有設定檔案儲存」。
  - Amplify 這類 serverless 主機的磁碟不會保留，所以 production 不會自動使用本機模式。
- `amplify.yml` 已經把 `VEHICLE_*` 寫進 `.env.production`。

### S3 準備

1. 建立 bucket，保持 Block Public Access 全開（所有存取都經預簽 URL）。
2. 把 `infra/s3/vehicle-files-policy.json` 裡的 bucket 名稱換掉，掛到伺服器執行身分上。
   - Amplify 用 SSR compute role，其他主機用對應的 IAM 身分。
3. 套用生命週期規則 `infra/s3/vehicle-files-lifecycle.json`：
   - `vehicles/` 前綴 90 天後刪除（與 `VEHICLE_FILES_RETENTION_DAYS` 一致）。
   - 未完成的 multipart 7 天後清掉。
4. 建表：`node scripts/create-tables.mjs`（新增 `akade-cc-vehicle-files`，TTL `expiresAt`）。

- **預簽 URL 的時效**：上傳時效依檔案大小計算，15 分鐘到 12 小時，以 50 KB/s 估算。
  - 但伺服器若用臨時憑證（Amplify SSR role），URL 最長只到憑證到期為止。
  - 過期時 companion 會重新宣告，拿到新的 URL。
- **瀏覽器的讀取連結**：預簽 GET，1 小時。
  - `GET /api/control-center/vehicles/{id}/files/{fileId}/content` 每次都會轉址到新的預簽連結，可以當成穩定網址使用。

## 權限

- **查看、下載**：載具所屬門市的檢視者以上。
- **刪除**：該門市的門市管理員以上。
- **跨門市**：其他門市的人一律 403。
- **刪除載具時**：它的檔案與紀錄會一併刪除。

## API

| 方法 路徑 | 說明 |
|:---|:---|
| `POST /api/device/vehicles/files` | 宣告檔案，回傳 `{ fileId, upload }` 或 `{ fileId, already: true }`；未設定儲存時回 503 `NO_STORAGE` |
| `PUT /api/device/vehicles/files/{fileId}/content` | 僅本機模式：上傳內容，大小或 SHA 不符時回 400 `SIZE`／`SHA` |
| `POST /api/device/vehicles/files/{fileId}/complete` | 確認上傳完成；沒有物件時回 409 `MISSING` |
| `GET /api/control-center/vehicles/{id}/files?kind=photo\|tlog\|dataflash&before&limit` | `{ files, nextBefore, storage }`，新到舊，只列已完成的檔案 |
| `GET /api/control-center/vehicles/{id}/files/{fileId}/content` | 內容（本機直接串流，S3 轉址），`?download=1` 以附件下載 |
| `DELETE /api/control-center/vehicles/{id}/files/{fileId}` | 刪除物件與紀錄 |

## 驗證紀錄（2026-09-28，ArduCopter 4.7.1 SITL，本機模式）

- **啟動補傳**：既有的 12 張照片、1 個 8.7 MB DataFlash、5 個飛行 tlog，約 1.2 秒全部上傳。
  - 開機（boot）日誌依 `flights` 設定略過。
  - 雲端下載的 SHA-256 與原檔一致。
- **飛行中拍照**：6 張照片每張 1 秒內到雲端；日誌在解鎖期間暫緩。
- **上鎖後**：這趟的 tlog 約 2 秒內上傳。
- **重啟 companion**：已傳的檔案不重傳。
- **錯誤處理**：損壞或長度不符的上傳被拒；尚未上傳就送 complete 回 409。
- **權限**：其他門市的使用者列表與下載都回 403。
- **S3 模式**：只以單元測試驗證預簽內容（簽入的標頭、沒有 CRC32、SHA-256 以 base64 傳送），尚未對真的 bucket 或 MinIO 實測。
