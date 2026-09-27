/** Parameters and logs strings (Gcs.params, Gcs.logs).   node scripts/i18n/gcs-m4.mjs */
import { readFileSync, writeFileSync } from "node:fs";

const S = {
  "zh-TW": {
    tabs: { params: "參數", logs: "日誌" },
    cmd: "讀取全部參數",
    params: {
      fetched: "已讀取 {n} 個參數", fetchFailed: "讀取參數失敗", written: "已寫入 {n} 個參數", writePartial: "寫入 {ok} 個；失敗：{failed}",
      rebootNeeded: "這些參數要重開飛控才會生效：{names}", importEmpty: "檔案裡沒有參數", importBadLines: "有幾行看不懂，已略過（第 {lines} 行）",
      fetch: "從載具讀取全部", fetching: "讀取中…", noSnapshot: "還沒有參數快照", live: "剛讀取",
      loadFile: "載入 .param 比對", saveFile: "存成 .param", discard: "放棄修改", write: "寫入 {n} 項", writing: "寫入中…",
      source: "{when} 的參數（{n} 個，{fw}）", empty: "還沒有參數。按「從載具讀取全部」。",
      metaLoading: "正在載入 ArduPilot 參數說明…", metaError: "無法載入參數說明（沒有網路？）",
      metaNote: "說明取自 ArduPilot 開發版，少數參數可能與你的韌體版本不同",
      tabAll: "全部參數", tabSafety: "安全設定", tabCompare: "比對",
      confirmTitle: "寫入 {n} 個參數？", confirmDescription: "會直接改變飛控設定。標示「需重開」的參數要重開飛控後才生效。",
      reboot: "需重開", cancel: "取消", confirmWrite: "寫入",
      emptyHint: "先從載具讀取參數，或選一份快照。", search: "搜尋名稱或說明", onlyChanged: "只看修改中", showAdvanced: "顯示進階",
      count: "{n} 個", range: "範圍 {lo} – {hi} {units}", rebootRequired: "修改後要重開飛控才會生效", noMeta: "沒有這個參數的說明",
      more: "再顯示（剩 {n} 個）",
      problem_belowRange: "低於建議範圍 {lo}–{hi}", problem_aboveRange: "高於建議範圍 {lo}–{hi}", problem_notInList: "不在選項清單中", problem_notInteger: "位元遮罩必須是整數",
      check: {
        operatorSysid: "companion 用「operator」心跳（sysid {sysid}），但飛控的 SYSID_MYGCS 是 {current}，GCS 失控保護不會認得它。",
        operatorNoFs: "FS_GCS_ENABLE 是 0：operator 心跳不會觸發任何保護。",
        alwaysMasks: "companion 設成 always 心跳且 SYSID_MYGCS 對上它：操作者斷線時飛控仍會以為 GCS 在線。",
        noBattery: "BATT_MONITOR 是 0：沒有電池監測，電池失控保護不會動作。",
        battNoAction: "有設低電壓，但 BATT_FS_LOW_ACT 是 0（不動作）。",
        armingOff: "ARMING_CHECK 是 0：已關閉解鎖前檢查。",
        fenceOff: "電子圍籬沒有啟用。",
        rcFsOff: "遙控器失控保護（FS_THR_ENABLE）已關閉。",
        storm32Mavlink: "STorM32 走 MAVLink（MNT1_TYPE=4）：雲台那個序列埠的 SRx_* 都要設 0，否則會塞滿雲台。",
        storm32Serial: "MNT1_TYPE=5 是舊的 STorM32 serial 方式，olliw 建議改用 4（MAVLink）。",
        telem2NotMavlink2: "SERIAL2_PROTOCOL 是 {value}：如果樹莓派接 TELEM2，應設為 2（MAVLink2）。",
      },
      group: { battery: "電池", radio: "遙控器失控保護", gcs: "地面站失控保護", ekf: "EKF / 震動", fence: "電子圍籬", rtl: "返航與降落", arming: "解鎖檢查", gimbal: "雲台", failsafe: "失控保護", nav: "導航速度" },
      compareHint: "Mission Planner 的 Compare Params：和 .param 檔或另一份快照比對，只列出不同的參數，勾選後加入待寫入。",
      compareSnapshot: "和另一份快照比對", comparing: "比對：{label}", diffCount: "{n} 個不同", missingHere: "（這裡沒有）", missingThere: "（那裡沒有）",
      applied: "已把 {n} 項加入待寫入", apply: "套用勾選的 {n} 項",
    },
    logs: {
      tlogTitle: "遙測日誌（tlog）", tlogDescription: "companion 在樹莓派上錄下所有 MAVLink 封包，每次解鎖一個檔。Mission Planner、MAVExplorer 都能開。",
      refresh: "重新整理", needDirect: "下載 tlog 需要直連。到「設定」頁籤設定直連網址。", listFailed: "無法取得清單：確認直連已連線。",
      disabled: "companion 沒有開啟 tlog 錄製（tlog_dir 為空）。", none: "還沒有日誌。", recording: "錄製中", download: "下載 {name}", downloadFailed: "下載失敗",
      analyseTitle: "分析日誌", analyseDescription: "用 ArduPilot 官方的網頁工具分析：UAV Log Viewer 可以畫圖；WebTools 有濾波器、PID、磁力計等檢查。直接把檔案拖進去即可。",
      dataflashTitle: "飛控的 DataFlash 日誌（.bin）",
      dataflashDescription: "經序列埠下載很慢，而且解鎖時飛控會拒絕。建議取出 SD 卡，或上鎖後用 Mission Planner 經 mavlink-router 下載。",
    },
  },
  "en-US": {
    tabs: { params: "Parameters", logs: "Logs" },
    cmd: "Read all parameters",
    params: {
      fetched: "Read {n} parameters", fetchFailed: "Could not read parameters", written: "Wrote {n} parameters", writePartial: "Wrote {ok}; failed: {failed}",
      rebootNeeded: "Reboot the autopilot for these to take effect: {names}", importEmpty: "No parameters in that file", importBadLines: "Skipped unreadable lines ({lines})",
      fetch: "Read all from vehicle", fetching: "Reading…", noSnapshot: "No parameter snapshot yet", live: "just read",
      loadFile: "Load .param to compare", saveFile: "Save as .param", discard: "Discard changes", write: "Write {n}", writing: "Writing…",
      source: "Parameters from {when} ({n}, {fw})", empty: "No parameters yet. Press “Read all from vehicle”.",
      metaLoading: "Loading ArduPilot parameter documentation…", metaError: "Could not load parameter documentation (offline?)",
      metaNote: "documentation is ArduPilot's development version and may differ slightly from your firmware",
      tabAll: "All parameters", tabSafety: "Safety", tabCompare: "Compare",
      confirmTitle: "Write {n} parameters?", confirmDescription: "This changes the autopilot configuration. Parameters marked “reboot” take effect after rebooting it.",
      reboot: "reboot", cancel: "Cancel", confirmWrite: "Write",
      emptyHint: "Read the parameters from the vehicle or pick a snapshot first.", search: "Search name or description", onlyChanged: "Only changes", showAdvanced: "Show advanced",
      count: "{n} shown", range: "Range {lo} – {hi} {units}", rebootRequired: "Takes effect after rebooting the autopilot", noMeta: "No documentation for this parameter",
      more: "Show more ({n} left)",
      problem_belowRange: "Below the documented range {lo}–{hi}", problem_aboveRange: "Above the documented range {lo}–{hi}", problem_notInList: "Not one of the documented values", problem_notInteger: "A bitmask must be an integer",
      check: {
        operatorSysid: "The companion sends an “operator” heartbeat as sysid {sysid}, but SYSID_MYGCS is {current}, so the GCS failsafe will not recognise it.",
        operatorNoFs: "FS_GCS_ENABLE is 0: the operator heartbeat triggers nothing.",
        alwaysMasks: "The companion sends heartbeats always and SYSID_MYGCS matches it: losing the operator will not trigger the GCS failsafe.",
        noBattery: "BATT_MONITOR is 0: no battery monitoring, so battery failsafes cannot act.",
        battNoAction: "A low voltage is set but BATT_FS_LOW_ACT is 0 (no action).",
        armingOff: "ARMING_CHECK is 0: pre-arm checks are disabled.",
        fenceOff: "The geofence is not enabled.",
        rcFsOff: "The RC failsafe (FS_THR_ENABLE) is off.",
        storm32Mavlink: "STorM32 over MAVLink (MNT1_TYPE=4): set every SRx_* stream rate on the gimbal's serial port to 0 or it floods the gimbal.",
        storm32Serial: "MNT1_TYPE=5 is the legacy STorM32 serial driver; olliw recommends 4 (MAVLink).",
        telem2NotMavlink2: "SERIAL2_PROTOCOL is {value}: if the Pi is on TELEM2 it should be 2 (MAVLink2).",
      },
      group: { battery: "Battery", radio: "RC failsafe", gcs: "GCS failsafe", ekf: "EKF / vibration", fence: "Geofence", rtl: "Return and land", arming: "Arming checks", gimbal: "Gimbal", failsafe: "Failsafes", nav: "Navigation speed" },
      compareHint: "Mission Planner's Compare Params: compare with a .param file or another snapshot, see only what differs, tick what to stage for writing.",
      compareSnapshot: "Compare with a snapshot", comparing: "Comparing with {label}", diffCount: "{n} differ", missingHere: "(not here)", missingThere: "(not there)",
      applied: "Staged {n} changes", apply: "Stage {n} ticked",
    },
    logs: {
      tlogTitle: "Telemetry logs (tlog)", tlogDescription: "The companion records every MAVLink packet on the Pi, one file per arming. Mission Planner and MAVExplorer open them.",
      refresh: "Refresh", needDirect: "Downloading tlogs needs the direct link. Set its URL in the Setup tab.", listFailed: "Could not list files: check the direct link is connected.",
      disabled: "tlog recording is off in the companion (tlog_dir is empty).", none: "No logs yet.", recording: "recording", download: "Download {name}", downloadFailed: "Download failed",
      analyseTitle: "Analysing logs", analyseDescription: "Use ArduPilot's own web tools: UAV Log Viewer for plots; WebTools for filter, PID and compass reviews. Drop the file in.",
      dataflashTitle: "Autopilot DataFlash logs (.bin)",
      dataflashDescription: "Downloading over a serial link is slow and refused while armed. Pull the SD card, or use Mission Planner through mavlink-router while disarmed.",
    },
  },
  "ja-JP": {
    tabs: { params: "パラメーター", logs: "ログ" },
    cmd: "全パラメーター読み込み",
    params: {
      fetched: "{n}個のパラメーターを読み込みました", fetchFailed: "パラメーターを読み込めませんでした", written: "{n}個書き込みました", writePartial: "{ok}個書き込み、失敗：{failed}",
      rebootNeeded: "次のパラメーターは再起動後に有効になります：{names}", importEmpty: "ファイルにパラメーターがありません", importBadLines: "読めない行をスキップしました（{lines}行目）",
      fetch: "機体から全て読み込み", fetching: "読み込み中…", noSnapshot: "スナップショットはまだありません", live: "読み込み直後",
      loadFile: ".param を読み込んで比較", saveFile: ".param で保存", discard: "変更を破棄", write: "{n}件書き込み", writing: "書き込み中…",
      source: "{when} のパラメーター（{n}個、{fw}）", empty: "パラメーターがありません。「機体から全て読み込み」を押してください。",
      metaLoading: "ArduPilot のパラメーター説明を読み込み中…", metaError: "パラメーター説明を読み込めませんでした（オフライン？）",
      metaNote: "説明は ArduPilot 開発版のもので、ファームウェアと一部異なる場合があります",
      tabAll: "全パラメーター", tabSafety: "安全設定", tabCompare: "比較",
      confirmTitle: "{n}個のパラメーターを書き込みますか？", confirmDescription: "フライトコントローラーの設定が変わります。「再起動」表示のものは再起動後に有効になります。",
      reboot: "再起動", cancel: "キャンセル", confirmWrite: "書き込み",
      emptyHint: "まず機体からパラメーターを読み込むか、スナップショットを選んでください。", search: "名前や説明で検索", onlyChanged: "変更のみ", showAdvanced: "詳細を表示",
      count: "{n}件", range: "範囲 {lo} – {hi} {units}", rebootRequired: "変更後、再起動で有効になります", noMeta: "このパラメーターの説明はありません",
      more: "さらに表示（残り{n}件）",
      problem_belowRange: "推奨範囲 {lo}–{hi} を下回っています", problem_aboveRange: "推奨範囲 {lo}–{hi} を上回っています", problem_notInList: "選択肢にない値です", problem_notInteger: "ビットマスクは整数にしてください",
      check: {
        operatorSysid: "コンパニオンは「operator」ハートビートを sysid {sysid} で送っていますが、SYSID_MYGCS が {current} のため GCS フェイルセーフが認識しません。",
        operatorNoFs: "FS_GCS_ENABLE が 0：operator ハートビートは何も発動しません。",
        alwaysMasks: "コンパニオンが常時ハートビートを送り SYSID_MYGCS も一致：操作者が切断しても GCS フェイルセーフが働きません。",
        noBattery: "BATT_MONITOR が 0：バッテリー監視がなく、バッテリーフェイルセーフが働きません。",
        battNoAction: "低電圧は設定済みですが BATT_FS_LOW_ACT が 0（動作なし）です。",
        armingOff: "ARMING_CHECK が 0：アーム前チェックが無効です。",
        fenceOff: "ジオフェンスが有効になっていません。",
        rcFsOff: "送信機フェイルセーフ（FS_THR_ENABLE）がオフです。",
        storm32Mavlink: "STorM32 を MAVLink で接続（MNT1_TYPE=4）：ジンバル側シリアルポートの SRx_* はすべて 0 にしてください。",
        storm32Serial: "MNT1_TYPE=5 は旧式の STorM32 シリアル方式です。olliw は 4（MAVLink）を推奨しています。",
        telem2NotMavlink2: "SERIAL2_PROTOCOL が {value}：Pi を TELEM2 に接続している場合は 2（MAVLink2）にしてください。",
      },
      group: { battery: "バッテリー", radio: "送信機フェイルセーフ", gcs: "GCS フェイルセーフ", ekf: "EKF / 振動", fence: "ジオフェンス", rtl: "帰還と着陸", arming: "アームチェック", gimbal: "ジンバル", failsafe: "フェイルセーフ", nav: "航行速度" },
      compareHint: "Mission Planner の Compare Params：.param ファイルや別のスナップショットと比較し、異なるものだけを表示。チェックしたものを書き込み待ちに追加します。",
      compareSnapshot: "別のスナップショットと比較", comparing: "比較中：{label}", diffCount: "{n}件が異なります", missingHere: "（こちらになし）", missingThere: "（あちらになし）",
      applied: "{n}件を書き込み待ちに追加しました", apply: "チェックした{n}件を適用",
    },
    logs: {
      tlogTitle: "テレメトリーログ（tlog）", tlogDescription: "コンパニオンが Pi 上ですべての MAVLink パケットを記録します（アームごとに1ファイル）。Mission Planner や MAVExplorer で開けます。",
      refresh: "更新", needDirect: "tlog のダウンロードには直接接続が必要です。「設定」タブで URL を設定してください。", listFailed: "一覧を取得できません：直接接続を確認してください。",
      disabled: "コンパニオンの tlog 記録がオフです（tlog_dir が空）。", none: "ログはまだありません。", recording: "記録中", download: "{name} をダウンロード", downloadFailed: "ダウンロード失敗",
      analyseTitle: "ログ解析", analyseDescription: "ArduPilot 公式の Web ツールで解析できます：グラフは UAV Log Viewer、フィルター・PID・コンパスの確認は WebTools。ファイルをドロップするだけです。",
      dataflashTitle: "フライトコントローラーの DataFlash ログ（.bin）",
      dataflashDescription: "シリアル経由のダウンロードは遅く、アーム中は拒否されます。SD カードを取り出すか、ディスアーム中に mavlink-router 経由で Mission Planner から取得してください。",
    },
  },
};

const locales = ["zh-TW", "en-US", "ja-JP"];
for (const locale of locales) {
  const path = new URL(`../../messages/control-center/${locale}.json`, import.meta.url);
  const m = JSON.parse(readFileSync(path, "utf8"));
  const x = S[locale];
  m.Gcs.tabs = { ...m.Gcs.tabs, ...x.tabs };
  m.Gcs.actions.cmd_param_fetch = x.cmd;
  m.Gcs.params = x.params;
  m.Gcs.logs = x.logs;
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
