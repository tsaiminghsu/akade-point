/** Video strings (Gcs.video) and the video_record command name.   node scripts/i18n/gcs-m3.mjs */
import { readFileSync, writeFileSync } from "node:fs";

const VIDEO = {
  "zh-TW": {
    map: "地圖", video: "影像", noUrl: "還沒設定影像網址。到「設定」頁籤填入 MediaMTX 的 WHEP 網址。",
    snapshotSaved: "已存下截圖", problem_badUrl: "影像網址格式錯誤", problem_mixedContent: "HTTPS 頁面不能播放 http:// 影像，請改用 https://（例如 tailscale serve）",
    error: "影像中斷（{detail}），3 秒後重試", retry: "重試", connecting: "連線影像中…",
    snapshot: "截圖", record: "開始在樹莓派錄影", stopRecord: "停止錄影", recordUnavailable: "companion 沒有設定 [video]，無法控制錄影",
  },
  "en-US": {
    map: "Map", video: "Video", noUrl: "No video URL yet. Enter MediaMTX's WHEP URL in the Setup tab.",
    snapshotSaved: "Snapshot saved", problem_badUrl: "Invalid video URL", problem_mixedContent: "An https page cannot play http:// video; use https:// (e.g. tailscale serve)",
    error: "Video lost ({detail}); retrying in 3 s", retry: "Retry", connecting: "Connecting video…",
    snapshot: "Snapshot", record: "Start recording on the Pi", stopRecord: "Stop recording", recordUnavailable: "The companion has no [video] section, so it cannot control recording",
  },
  "ja-JP": {
    map: "地図", video: "映像", noUrl: "映像URLが未設定です。「設定」タブで MediaMTX の WHEP URL を入力してください。",
    snapshotSaved: "スナップショットを保存しました", problem_badUrl: "映像URLの形式が不正です", problem_mixedContent: "HTTPSページでは http:// の映像を再生できません。https://（tailscale serve など）を使用してください",
    error: "映像が途切れました（{detail}）。3秒後に再接続します", retry: "再試行", connecting: "映像に接続中…",
    snapshot: "スナップショット", record: "Piで録画開始", stopRecord: "録画停止", recordUnavailable: "コンパニオンに [video] 設定がないため録画を制御できません",
  },
};
const CMD = { "zh-TW": "錄影開關", "en-US": "Recording on/off", "ja-JP": "録画の切り替え" };

const locales = ["zh-TW", "en-US", "ja-JP"];
for (const locale of locales) {
  const path = new URL(`../../messages/control-center/${locale}.json`, import.meta.url);
  const m = JSON.parse(readFileSync(path, "utf8"));
  m.Gcs.video = VIDEO[locale];
  m.Gcs.actions.cmd_video_record = CMD[locale];
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
