# AWS IoT Core 佈建（正式環境）

本機開發（`VEHICLE_TRANSPORT=local`）**不需**本文件——指令走遙測回應。以下只在要用 MQTT 低延遲推指令的正式環境需要。

## 1. 建表與 TTL

對正式帳號執行（會建立五張 `akade-cc-vehicle-*` 表並開啟 telemetry/commands 的 TTL；可重複執行）：

```bash
node scripts/create-tables.mjs
```

## 2. 每台載具建立 IoT Thing 與憑證

`<companionId>` 必須等於該載具在 app 中的 `companionId`。

```bash
aws iot create-thing --thing-name <companionId>

aws iot create-keys-and-certificate --set-as-active \
  --certificate-pem-outfile device.pem.crt \
  --public-key-outfile public.pem.key \
  --private-key-outfile private.pem.key
# 記下回傳的 certificateArn

curl -o AmazonRootCA1.pem https://www.amazontrust.com/repository/AmazonRootCA1.pem
```

## 3. Policy（一次即可，服務所有 companion）

編輯 `infra/iot/companion-policy.json`，替換 `REGION`、`ACCOUNT_ID`，然後：

```bash
aws iot create-policy --policy-name AkadeCompanionPolicy \
  --policy-document file://infra/iot/companion-policy.json

aws iot attach-policy --policy-name AkadeCompanionPolicy --target <certificateArn>
aws iot attach-thing-principal --thing-name <companionId> --principal <certificateArn>
```

## 4. 資料端點

```bash
aws iot describe-endpoint --endpoint-type iot:Data-ATS
# → xxxxxxxx-ats.iot.<region>.amazonaws.com  ← 這是 IOT_DATA_ENDPOINT，也是 companion mqtt.endpoint
```

## 5. 伺服器端（Amplify）

- 在 Amplify 的 SSR compute IAM role（已具 DynamoDB 權限）加上：
  `iot:Publish` 於 `arn:aws:iot:<region>:<account>:topic/vehicles/*`
- 環境變數：
  - `VEHICLE_TRANSPORT=iot`
  - `IOT_DATA_ENDPOINT=<上一步的端點>`
  - `AWS_REGION=<region>`

`lib/iot/publish.ts` 只在 `VEHICLE_TRANSPORT=iot` 且有 `IOT_DATA_ENDPOINT` 時才載入 IoT SDK 並發佈；發佈失敗永不丟錯，指令自動退回遙測回應通道。

## 6. companion 端

把 `device.pem.crt`、`private.pem.key`、`AmazonRootCA1.pem` 放到樹莓派，於 `companion.toml` 設 `transport = "iot"` 並填 `[mqtt]` 區塊（`endpoint`、`companion_id`、三個憑證路徑）。見 [`vehicles-companion.md`](./vehicles-companion.md)。
