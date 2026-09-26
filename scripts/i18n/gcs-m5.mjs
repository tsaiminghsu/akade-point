/** Gimbal strings (Gcs.gimbal) and gimbal command names.   node scripts/i18n/gcs-m5.mjs */
import { readFileSync, writeFileSync } from "node:fs";

const S = {
  "zh-TW": {
    tab: "雲台",
    cmd: { gimbal_pitchyaw: "雲台角度", gimbal_mode: "雲台模式", roi_location: "雲台看這裡", roi_none: "取消注視點" },
    gimbal: {
      axis_p: "俯仰", axis_y: "偏航", axis_r: "滾轉", noAttitude: "還沒收到雲台姿態（GIMBAL_DEVICE_ATTITUDE_STATUS / MOUNT_STATUS）。",
      pitch: "俯仰", yaw: "偏航（相對機頭）",
      streamHint: "直連中：拖曳時即時送出（companion 限制每秒 10 次，避免 STorM32 堆積延遲），放開時再送一次確認。",
      cloudHint: "經雲端：放開滑桿時才送出。連續操作請用直連。",
      nadir: "朝正下方", forward: "朝正前方", neutral: "回中（Neutral）", retract: "收起（Retract）",
      yawLocked: "偏航鎖定北方", yawFollow: "偏航跟隨機頭", rcControl: "交給遙控器", roiNone: "取消注視點（ROI）",
      tips: "在地圖按右鍵選「雲台看這裡」可讓鏡頭持續對準地面一點；影像主畫面時點擊畫面也能瞄準。",
    },
  },
  "en-US": {
    tab: "Gimbal",
    cmd: { gimbal_pitchyaw: "Gimbal angles", gimbal_mode: "Gimbal mode", roi_location: "Point camera here", roi_none: "Cancel ROI" },
    gimbal: {
      axis_p: "Pitch", axis_y: "Yaw", axis_r: "Roll", noAttitude: "No gimbal attitude yet (GIMBAL_DEVICE_ATTITUDE_STATUS / MOUNT_STATUS).",
      pitch: "Pitch", yaw: "Yaw (relative to nose)",
      streamHint: "Direct link: angles stream while dragging (the companion caps them at 10 per second so a STorM32 does not lag), then one confirmed command on release.",
      cloudHint: "Over the cloud only the release is sent. Use the direct link for continuous control.",
      nadir: "Straight down", forward: "Straight ahead", neutral: "Neutral", retract: "Retract",
      yawLocked: "Yaw locked to north", yawFollow: "Yaw follows nose", rcControl: "Hand to RC", roiNone: "Cancel ROI",
      tips: "Right-click the map and choose “Point camera here” to keep the camera on a spot; with video as the main view, click the picture to aim.",
    },
  },
  "ja-JP": {
    tab: "ジンバル",
    cmd: { gimbal_pitchyaw: "ジンバル角度", gimbal_mode: "ジンバルモード", roi_location: "カメラをここへ", roi_none: "ROI 解除" },
    gimbal: {
      axis_p: "ピッチ", axis_y: "ヨー", axis_r: "ロール", noAttitude: "ジンバル姿勢をまだ受信していません（GIMBAL_DEVICE_ATTITUDE_STATUS / MOUNT_STATUS）。",
      pitch: "ピッチ", yaw: "ヨー（機首基準）",
      streamHint: "直接接続中：ドラッグ中はリアルタイム送信（STorM32 の遅延を防ぐためコンパニオンが毎秒10回に制限）、離したときに確認付きで送信します。",
      cloudHint: "クラウド経由ではスライダーを離したときだけ送信します。連続操作には直接接続を使ってください。",
      nadir: "真下", forward: "正面", neutral: "ニュートラル", retract: "格納",
      yawLocked: "ヨーを北に固定", yawFollow: "ヨーは機首に追従", rcControl: "送信機に戻す", roiNone: "ROI 解除",
      tips: "地図を右クリックして「カメラをここへ」を選ぶと地上の一点を注視し続けます。映像メイン表示では画面クリックでも照準できます。",
    },
  },
};

const locales = ["zh-TW", "en-US", "ja-JP"];
for (const locale of locales) {
  const path = new URL(`../../messages/control-center/${locale}.json`, import.meta.url);
  const m = JSON.parse(readFileSync(path, "utf8"));
  const x = S[locale];
  m.Gcs.tabs.gimbal = x.tab;
  for (const [k, v] of Object.entries(x.cmd)) m.Gcs.actions[`cmd_${k}`] = v;
  m.Gcs.gimbal = x.gimbal;
  writeFileSync(path, `${JSON.stringify(m, null, 2)}\n`);
}
const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
const sets = locales.map((l) => new Set(flat(JSON.parse(readFileSync(new URL(`../../messages/control-center/${l}.json`, import.meta.url), "utf8")))));
const diff = [...sets[0]].filter((k) => !sets[1].has(k) || !sets[2].has(k));
if (diff.length || sets[1].size !== sets[0].size || sets[2].size !== sets[0].size) {
  console.error("locale key mismatch", diff.slice(0, 10));
  process.exit(1);
}
console.log(`ok — ${sets[0].size} keys in each locale`);
