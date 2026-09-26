# 載具資料模型

六張 DynamoDB 表，由 `scripts/create-tables.mjs` 建立，`lib/dynamo/client.ts` 的 `TABLES` 登記，DAL 在 `lib/dynamo/cc-vehicle-*.ts`。

| 表 | 主鍵 | GSI | TTL | 主要欄位 |
|:---|:---|:---|:---|:---|
| `akade-cc-vehicles` | `id` | `companion-index`(companionId) | — | `name, type, companionId, notes, state（v1 或 v2 快照）, stateAt, lastSeenAt, operatorSeenAt?, createdAt, updatedAt` |
| `akade-cc-vehicle-tokens` | `tokenId` | `vehicle-index`(vehicleId) | — | `vehicleId, hash, label, createdAt, revokedAt?` |
| `akade-cc-vehicle-commands` | `id` | `vehicle-index`(vehicleId + createdAt) | `expiresAt` 30 天 | `type, args, status, timeoutMs, issuedBy, createdAt, sentAt?, ackedAt?, code?, msg?, result?, late?` |
| `akade-cc-vehicle-telemetry` | `vehicleId` + `t` | — | `expiresAt` 7 天 | 攤平：`lat, lon, alt, rel, hdg, gs, batPct, batV, mode, armed, sats, fix`（只存有位置的點；其餘欄位可為 null） |
| `akade-cc-vehicle-events` | `vehicleId` + `sk`（S） | — | `expiresAt` 7 天 | STATUSTEXT：`t, sev, text, comp`；`sk` = 補零的 `t` + `#` + companion 序號，同毫秒不互蓋，也是分頁游標 |
| `akade-cc-vehicle-missions` | `id` | `vehicle-index`(vehicleId) | — | `name, items[]（≤500）, source` |

TTL 常數在 `lib/dynamo/ttl.ts`（`VEHICLE_TELEMETRY_TTL_SECONDS`、`VEHICLE_EVENT_TTL_SECONDS`、`VEHICLE_COMMAND_TTL_SECONDS`）。

`operatorSeenAt` 由地面站頁面的即時輪詢寫入；遙測回應的 `op` 旗標以它判斷「最近 5 s 有人在看」。DynamoDB Local 接受 TTL 設定但不會真的刪除。

## linkState（不儲存，讀取時推導）

由 `lib/control-center/vehicles/linkState.ts` 依 `lastSeenAt` 計算：

- `lastSeenAt` 距今 < 10s → `online`
- < 60s → `stale`
- 否則（或從未回報）→ `offline`

閾值常數 `VEHICLE_ONLINE_MS`、`VEHICLE_STALE_MS`。

## 指令狀態機

```
              publish 成功 / 遙測回應帶回
   pending ─────────────────────────────▶ sent
     │                                      │
     │  逾時（resolveTimeouts，讀取時）      │  逾時
     ▼                                      ▼
   timeout ◀──────────────────────────── timeout
     │                                      │
     │  遲到 ack（late=true）                │  ack
     ▼                                      ▼
  acked / failed  ◀───── ack ──────  acked / failed
```

- `resolveTimeouts`（純函式，`commandState.ts`）在讀取指令時把超過 `timeoutMs`（自 `sentAt`，否則 `createdAt` 起算）的 `pending`/`sent` 標為 `timeout`，並由 route 以條件式更新持久化。
- `applyAck` 對已 `acked`/`failed` 的指令拒絕覆寫（回 null → API 回 409）；對 `timeout` 的指令接受遲到 ack 並標 `late`。
- DAL 的 `markSent`、`markTimedOut`、`applyAckUpdate` 皆用 DynamoDB 條件式更新（`status` 需 `#s` 別名，因為它是保留字），避免並發覆寫。

## 型別

- 客戶端型別：`lib/control-center/vehicles/types.ts`（`Vehicle`、`VehicleState` = `VehicleStateV1 | VehicleStateV2`、`VehicleCommand`、`MissionItem`、`VehicleEvent`…）。
- 兩版快照一律經 `summarize()`（`summary.ts`）讀取共通數值；v2 的未知值是 `null`。
- 伺服器型別：`lib/dynamo/cc-vehicle-*.ts` 各自的 `CCVehicle` 等（與客戶端結構相同、獨立維護，沿用本 repo 既有慣例）。
- zod schema：`lib/control-center/vehicles/schemas.ts`（route 與 UI 共用）。

## 保留字

DynamoDB 保留字 `status`（→ `#s`）、`state`（cc-vehicles 用 `#st`）、`t`（telemetry 排序鍵用 `#t`，僅在有 `since` 條件時宣告）。`createdAt`、`timestamp` 在此模組未作為需別名的條件欄位。
