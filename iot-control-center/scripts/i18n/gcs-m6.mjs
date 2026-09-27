/** ESP32 payload node and Remote ID strings (Gcs.payload, Gcs.status.rid*).   node scripts/i18n/gcs-m6.mjs */
import { readFileSync, writeFileSync } from "node:fs";

const S = {
  "zh-TW": {
    tab: "酬載",
    cmd: { payload_relay: "酬載繼電器", payload_pulse: "酬載脈衝", payload_servo: "酬載伺服" },
    status: { ridOk: "Remote ID", ridBad: "Remote ID 異常", ridTitle: "Remote ID 模組的解鎖狀態（OPEN_DRONE_ID_ARM_STATUS）" },
    payload: {
      component: "元件 {comp}",
      sensors: "感測值",
      noValues: "還沒收到數值（NAMED_VALUE_FLOAT）。",
      relays: "繼電器",
      relay: "繼電器 {index}",
      on: "開",
      off: "關",
      pulse: "脈衝",
      pulseTitle: "開啟 {ms} 毫秒後自動關閉（例如投放器、快門）",
      servos: "伺服輸出",
      servo: "伺服 {index}",
      hint: "指令直接送到酬載節點（預設 MAVLink 元件 25），開關狀態以節點回報為準。飛控要把該 TELEM 埠設成 MAVLink（SERIALx_PROTOCOL=2）才會轉送。",
    },
  },
  "en-US": {
    tab: "Payload",
    cmd: { payload_relay: "Payload relay", payload_pulse: "Payload pulse", payload_servo: "Payload servo" },
    status: { ridOk: "Remote ID", ridBad: "Remote ID fault", ridTitle: "Remote ID module arming status (OPEN_DRONE_ID_ARM_STATUS)" },
    payload: {
      component: "Component {comp}",
      sensors: "Sensor values",
      noValues: "No values yet (NAMED_VALUE_FLOAT).",
      relays: "Relays",
      relay: "Relay {index}",
      on: "On",
      off: "Off",
      pulse: "Pulse",
      pulseTitle: "On for {ms} ms, then off (e.g. a dropper or shutter)",
      servos: "Servo outputs",
      servo: "Servo {index}",
      hint: "Commands go straight to the payload node (MAVLink component 25 by default); switch states are what the node reports. The autopilot forwards them only if that TELEM port runs MAVLink (SERIALx_PROTOCOL=2).",
    },
  },
  "ja-JP": {
    tab: "ペイロード",
    cmd: { payload_relay: "ペイロードリレー", payload_pulse: "ペイロードパルス", payload_servo: "ペイロードサーボ" },
    status: { ridOk: "Remote ID", ridBad: "Remote ID 異常", ridTitle: "Remote ID モジュールのアーム状態（OPEN_DRONE_ID_ARM_STATUS）" },
    payload: {
      component: "コンポーネント {comp}",
      sensors: "センサー値",
      noValues: "まだ値を受信していません（NAMED_VALUE_FLOAT）。",
      relays: "リレー",
      relay: "リレー {index}",
      on: "オン",
      off: "オフ",
      pulse: "パルス",
      pulseTitle: "{ms} ミリ秒オンにしてからオフ（投下装置やシャッターなど）",
      servos: "サーボ出力",
      servo: "サーボ {index}",
      hint: "コマンドはペイロードノード（既定は MAVLink コンポーネント 25）へ直接送信され、スイッチ状態はノードの報告に従います。フライトコントローラーの該当 TELEM ポートが MAVLink（SERIALx_PROTOCOL=2）の場合のみ転送されます。",
    },
  },
};

const locales = ["zh-TW", "en-US", "ja-JP"];
for (const locale of locales) {
  const path = new URL(`../../messages/control-center/${locale}.json`, import.meta.url);
  const m = JSON.parse(readFileSync(path, "utf8"));
  const x = S[locale];
  m.Gcs.tabs.payload = x.tab;
  for (const [k, v] of Object.entries(x.cmd)) m.Gcs.actions[`cmd_${k}`] = v;
  Object.assign(m.Gcs.status, x.status);
  m.Gcs.payload = x.payload;
  writeFileSync(path, `${JSON.stringify(m, null, 2)}\n`);
}
const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
const sets = locales.map((l) => new Set(flat(JSON.parse(readFileSync(new URL(`../../messages/control-center/${l}.json`, import.meta.url), "utf8")))));
const diff = [...sets[0]].filter((k) => !sets[1].has(k) || !sets[2].has(k));
if (diff.length || sets[1].size !== sets[0].size || sets[2].size !== sets[0].size) {
  console.error("locale key mismatch", diff.slice(0, 10));
  process.exit(1);
}
console.log("ok", sets[0].size, "keys per locale");
