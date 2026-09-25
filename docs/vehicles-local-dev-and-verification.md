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

## SITL + companion

```bash
sim_vehicle.py -v ArduCopter --out udp:127.0.0.1:14550 --out udp:127.0.0.1:14551
cd companion && python -m venv .venv && . .venv/bin/activate && pip install -e .
# 把 seed 腳本印出的設定貼進 companion.toml（mavlink_url = "udpin:127.0.0.1:14550"）
python -m vehicle_companion --config companion.toml
```

## 冒煙腳本

`node scripts/vehicles-smoke.mjs` 會等載具 online，然後依序 set_mode GUIDED → arm → takeoff 10 → 等相對高度 >8 → goto → rtl，逐一輪詢至終結；任一 failed/timeout 非零退出。

## 瀏覽器檢查清單（`/iot-control-center/vehicles`）

- companion 啟動 ~2s 內載具轉 online，欄位（模式、電量、GPS、座標）持續更新。
- 抽屜「即時」分頁顯示完整遙測與 Google Maps 連結。
- 抽屜「指令」：arm/takeoff/goto/RTL 呈 pending → sent → acked；前置條件失敗顯示 failed + code。
- 關掉 companion：10s 後 stale、60s 後 offline；此時指令按鈕停用。
- 抽屜「任務」：匯入 `.waypoints` → 編輯 → 匯出內容相等 → 上傳至 SITL → 從 SITL 下載得到同項目的新任務。
- 「設定」分頁：產生 token 只顯示一次，可複製；輪替後舊 token 得 401。

## 單元測試

```bash
npm test                    # 前端／伺服器：waypoints、commandState、linkState、schemas、token、
                            # cc-vehicle-commands、useVehiclesStore 等
cd companion && pytest      # companion：commands 執行器、mission 協定（fake link，免 SITL）
```

## 本 session 已驗證（無 SITL，以 curl 模擬 companion）

- 建立載具 → 產生 token → 發 takeoff（local 模式停在 pending）→ 遙測 POST 把它帶回並標 sent → ack → 重複 ack 得 409。
- 逾時後的遲到 ack 正確標 `late` 並轉 acked。
- 遙測歷史寫入；`before` 游標；壞 token 401；重複 companionId 409；空 PATCH 400；rover 送 takeoff 400；跨載具 ack 404；刪除載具連帶撤 token（舊 token 立刻 401）。
- 瀏覽器：頁面列出載具與即時遙測，抽屜「即時」顯示完整狀態格，指令列「設定模式」成功發出並在紀錄顯示 pending，零 console 錯誤。

> 待實機／SITL 補驗：真正的 arm→takeoff→goto→rtl 飛行序列、任務上傳下載往返、MissionPlanner 同時連線。
