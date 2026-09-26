/**
 * Merges the ground-station ("Gcs") strings into the three Control Center
 * locale files and drops the namespaces of the retired vehicle drawer.
 *   node scripts/i18n/gcs-m1.mjs
 * Idempotent; the locale JSON files remain the source of truth afterwards.
 */
import { readFileSync, writeFileSync } from "node:fs";

const cmdNames = {
  "zh-TW": {
    arm: "解鎖", disarm: "上鎖", set_mode: "切換模式", takeoff: "起飛", land: "降落", hold: "停住", goto: "飛到/開到",
    change_alt: "改高度", change_speed: "改速度", rtl: "返航", mission_start: "開始任務", mission_pause: "暫停任務",
    mission_resume: "繼續任務", mission_set_current: "跳到航點", mission_upload: "上傳任務", mission_download: "下載任務",
    mission_clear: "清除任務", set_home: "設定 Home", run_prearm: "執行 PreArm 檢查", reboot: "重開飛控",
    param_get: "讀取參數", param_set: "寫入參數",
  },
  "en-US": {
    arm: "Arm", disarm: "Disarm", set_mode: "Set mode", takeoff: "Take off", land: "Land", hold: "Hold", goto: "Go to",
    change_alt: "Change altitude", change_speed: "Change speed", rtl: "Return to launch", mission_start: "Start mission",
    mission_pause: "Pause mission", mission_resume: "Resume mission", mission_set_current: "Set waypoint",
    mission_upload: "Upload mission", mission_download: "Download mission", mission_clear: "Clear mission",
    set_home: "Set home", run_prearm: "Run pre-arm checks", reboot: "Reboot autopilot", param_get: "Read parameters",
    param_set: "Write parameters",
  },
  "ja-JP": {
    arm: "アーム", disarm: "ディスアーム", set_mode: "モード変更", takeoff: "離陸", land: "着陸", hold: "停止", goto: "指定地点へ",
    change_alt: "高度変更", change_speed: "速度変更", rtl: "帰還", mission_start: "ミッション開始", mission_pause: "ミッション一時停止",
    mission_resume: "ミッション再開", mission_set_current: "ウェイポイント指定", mission_upload: "ミッション書き込み",
    mission_download: "ミッション読み込み", mission_clear: "ミッション消去", set_home: "ホーム設定",
    run_prearm: "プリアームチェック実行", reboot: "フライトコントローラー再起動", param_get: "パラメーター読み込み",
    param_set: "パラメーター書き込み",
  },
};

const prefix = (obj, p) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [`${p}${k}`, v]));

const GCS = {
  "zh-TW": {
    back: "返回車隊",
    notFound: "找不到這台載具",
    px4Basic: "PX4：僅支援基本功能",
    control: "取得控制權",
    controlHint: "目前為觀看模式。開啟「取得控制權」才能下指令，避免誤觸。",
    cloudControlNote: "目前經雲端連線（約 1 秒更新）。搖桿與連續雲台控制需要直連。",
    voiceOn: "語音開",
    voiceOff: "語音關",
    tabs: { flight: "飛行資料", plan: "任務規劃", setup: "設定", quick: "數值", actions: "動作", messages: "訊息", graph: "圖表", drive: "駕駛" },
    hud: { linkLost: "LINK LOST", noData: "等待遙測…", noAttitude: "無姿態資料（舊版 companion）", armed: "已解鎖", disarmed: "已上鎖", fcLost: "飛控無回應" },
    status: {
      cloud: "雲端", direct: "直連", noLink: "斷線", ok: "正常", down: "中斷", directOff: "未設定",
      direct_connecting: "連線中", direct_open: "已連線", direct_unauthorized: "驗證失敗", direct_blocked: "瀏覽器阻擋", direct_error: "連不上",
      fcTitle: "樹莓派 ⇄ 飛控：最近一次心跳距今秒數",
      gpsTitle: "定位類型 · 衛星數 · HDOP（≤1.5 良好）",
      batTitle: "電壓 · 每芯電壓 · 剩餘 %",
      cellAvgTitle: "類比電流計只量總電壓，每芯電壓是平均值（~）",
      ekfTitle: "EKF 變異數最大值：<0.5 良好、0.5–0.8 注意、>0.8 危險",
      vibeTitle: "震動 m/s²：≤30 良好、>60 危險",
      rssiTitle: "遙控器 RSSI · 數傳 RSSI",
      piTitle: "樹莓派溫度與電源狀態",
      underVoltage: "欠壓！",
      prearmFail: "PreArm ×{count}", prearmOk: "PreArm 通過", prearmUnknown: "PreArm —",
      prearmTitle: "飛控的解鎖前檢查",
      otherGcs: "另有 {count} 個 GCS", otherGcsTitle: "偵測到其他地面站（例如 Mission Planner）連線中",
    },
    quick: {
      alt: "高度", groundspeed: "對地速度", climb: "爬升率", homeDist: "距 Home", wpDist: "距航點", waypoint: "航點",
      voltage: "電壓", cell: "每芯", current: "電流", used: "已用", heading: "航向", throttle: "油門", crosstrack: "偏航誤差", wind: "風",
    },
    actions: {
      sent: "已送出：{command}",
      ...prefix(cmdNames["zh-TW"], "cmd_"),
      modePlaceholder: "選擇模式", setMode: "切換",
      slideToArm: "滑動解鎖", armBlocked: "PreArm 未通過，請先看「訊息」頁籤排除問題。",
      disarm: "上鎖", forceDisarm: "強制上鎖", brake: "煞停", hold: "停住", land: "降落", prearm: "PreArm 檢查",
      takeoffAlt: "起飛高度（公尺）", takeoff: "起飛",
      confirmTakeoffTitle: "起飛到 {alt} 公尺？", confirmTakeoffDescription: "會切到 GUIDED、解鎖並爬升到 {alt} 公尺。請確認周圍淨空。",
      speed: "速度（m/s）", changeSpeed: "改速度", alt: "高度（公尺）", changeAlt: "改高度",
      confirmAltTitle: "改到 {alt} 公尺？", confirmAltDescription: "載具會在目前位置切到 GUIDED 並爬升或下降到 {alt} 公尺（相對 Home）。",
      mission: "任務", start: "開始", pause: "暫停", resume: "繼續", waypoint: "航點編號", setWaypoint: "跳到此航點",
      confirmMissionStartTitle: "開始任務？", confirmMissionStartDescription: "會切到 AUTO 並從目前航點開始執行已上傳的任務。",
      reboot: "重開飛控", confirmRebootTitle: "重開飛控？", confirmRebootDescription: "飛控會重新開機，約 10–20 秒內沒有遙測。只在上鎖時可用。",
      forceTitle: "強制上鎖", forceDescription: "飛行中強制上鎖會讓馬達立即停止，無人機會直接墜落。只在緊急情況使用。輸入 DISARM 確認。",
      forceType: "輸入 DISARM", forceConfirm: "強制上鎖",
    },
    messages: { prearmTitle: "解鎖前檢查未通過（{count} 項）", count: "{count} 則訊息", importantOnly: "只看重要", empty: "尚無訊息" },
    commands: { title: "指令紀錄", empty: "尚無指令", viaDirect: "直連", viaCloud: "雲端" },
    graph: {
      alt: "高度", gs: "對地速度", vs: "爬升率", batV: "電壓", cellV: "每芯電壓", cur: "電流", roll: "滾轉", pitch: "俯仰",
      vibe: "震動", ekf: "EKF", sats: "衛星數", waiting: "收集資料中…",
    },
    drive: {
      reqDirect: "直連已連線", reqGuided: "GUIDED 模式", reqArmed: "已解鎖", enterGuided: "切到 GUIDED",
      pad: "駕駛搖桿", maxSpeed: "最高速度", gamepadOn: "遊戲手把：{name}", gamepadOff: "可接遊戲手把（左搖桿）",
      hint: "放開搖桿立即停車；超過 0.3 秒沒收到指令，companion 也會自動停車。",
    },
    alerts: {
      mode: "模式 {mode}", armed: "已解鎖", disarmed: "已上鎖", batteryLow: "電池偏低，{value}{unit}", batteryCritical: "電池危險，{value}{unit}",
      linkLost: "連線中斷", linkRestored: "連線恢復", fcLost: "飛控沒有回應", gpsLost: "GPS 定位不良", ekfBad: "EKF 異常",
      vibeHigh: "震動過高", fenceBreach: "超出電子圍籬", voiceOn: "語音警示已開啟",
    },
    map: {
      layers: "底圖", layers_nlscPhoto: "國土測繪 正射影像", layers_nlscEmap: "國土測繪 通用版電子地圖", layers_esri: "Esri 衛星影像", layers_osm: "OpenStreetMap",
      follow: "跟隨載具", prefetch: "預抓此區離線圖磚",
      prefetchNoWorker: "離線快取尚未啟動，請重新整理頁面再試。", prefetchTooBig: "範圍太大，請放大地圖後再預抓。",
      prefetchProgress: "預抓圖磚 {done}/{total}", prefetchDone: "已快取 {total} 張圖磚（失敗 {failed}）",
      clearMeasure: "清除量測", driveHere: "開到這裡", flyHere: "飛到這裡", lookHere: "雲台看這裡", setHomeHere: "設為 Home", measure: "量距離",
    },
    fly: {
      title: "飛到這裡？", driveTitle: "開到這裡？", guidedNote: "載具會切換到 GUIDED 模式。",
      alt: "高度（公尺，相對 Home）", cancel: "取消", confirm: "飛過去", driveConfirm: "開過去",
    },
    home: { title: "設定新的 Home？", description: "RTL 會回到 {lat}, {lon}。" },
    setup: {
      saved: "已儲存",
      linksTitle: "連線", linksDescription: "直連讓網頁直接連到樹莓派：10 Hz 更新、雲端斷線時仍可操作；影像由樹莓派上的 MediaMTX 提供。",
      directUrl: "直連網址（WebSocket）", directHint: "HTTPS 頁面只能連 wss://。建議用 Tailscale（tailscale serve）取得有效憑證；本機 http://localhost 開啟時可用 ws://。",
      directStatus: "直連狀態", statusIdle: "未設定",
      status_connecting: "連線中", status_open: "已連線", status_unauthorized: "驗證失敗（token 或 ticket_key 不符）",
      status_blocked: "瀏覽器阻擋", status_error: "連不上",
      detail_mixedContent: "HTTPS 頁面不能連 ws://，請改用 wss://", detail_badUrl: "網址格式錯誤",
      detail_unreachable: "連不到：確認樹莓派在線、網址與埠號，並在瀏覽器詢問時允許存取區域網路裝置",
      detail_closed: "連線被關閉",
      videoUrl: "影像網址（WebRTC / WHEP）", videoHint: "MediaMTX 的 WHEP 端點，例如 https://…:8889/cam/whep。",
      save: "儲存",
      howTitle: "設定步驟",
      how1: "在右側產生 Token，把設定檔存成樹莓派上的 /etc/vehicle-companion/<名稱>.toml（含 [direct] 區塊）。",
      how2: "在樹莓派執行 tailscale serve --bg --https=443 http://127.0.0.1:8765，把得到的 wss:// 網址填在上方。",
      how3: "重新啟動 vehicle-companion@<名稱>，狀態會變成「已連線」。",
    },
  },
  "en-US": {
    back: "Back to fleet",
    notFound: "Vehicle not found",
    px4Basic: "PX4: basic support only",
    control: "Take control",
    controlHint: "View only. Turn on “Take control” to send commands, so a stray click can't.",
    cloudControlNote: "Connected through the cloud (about 1 update/s). Joystick and continuous gimbal control need the direct link.",
    voiceOn: "Voice on",
    voiceOff: "Voice off",
    tabs: { flight: "Flight data", plan: "Flight plan", setup: "Setup", quick: "Quick", actions: "Actions", messages: "Messages", graph: "Graph", drive: "Drive" },
    hud: { linkLost: "LINK LOST", noData: "Waiting for telemetry…", noAttitude: "No attitude (older companion)", armed: "ARMED", disarmed: "DISARMED", fcLost: "NO AUTOPILOT" },
    status: {
      cloud: "Cloud", direct: "Direct", noLink: "No link", ok: "OK", down: "down", directOff: "not set up",
      direct_connecting: "connecting", direct_open: "connected", direct_unauthorized: "rejected", direct_blocked: "blocked by browser", direct_error: "unreachable",
      fcTitle: "Pi ⇄ autopilot: seconds since the last heartbeat",
      gpsTitle: "Fix · satellites · HDOP (≤1.5 good)",
      batTitle: "Voltage · per cell · remaining %",
      cellAvgTitle: "An analog power module only measures the pack; per-cell voltage is an average (~)",
      ekfTitle: "Worst EKF variance: <0.5 good, 0.5–0.8 caution, >0.8 bad",
      vibeTitle: "Vibration m/s²: ≤30 good, >60 bad",
      rssiTitle: "RC RSSI · telemetry radio RSSI",
      piTitle: "Pi temperature and power",
      underVoltage: "UNDER-VOLTAGE",
      prearmFail: "PreArm ×{count}", prearmOk: "PreArm OK", prearmUnknown: "PreArm —",
      prearmTitle: "Autopilot pre-arm checks",
      otherGcs: "{count} other GCS", otherGcsTitle: "Another ground station (e.g. Mission Planner) is connected",
    },
    quick: {
      alt: "Altitude", groundspeed: "Groundspeed", climb: "Climb", homeDist: "To home", wpDist: "To WP", waypoint: "Waypoint",
      voltage: "Voltage", cell: "Per cell", current: "Current", used: "Used", heading: "Heading", throttle: "Throttle", crosstrack: "Cross-track", wind: "Wind",
    },
    actions: {
      sent: "Sent: {command}",
      ...prefix(cmdNames["en-US"], "cmd_"),
      modePlaceholder: "Choose mode", setMode: "Set",
      slideToArm: "Slide to arm", armBlocked: "Pre-arm checks failing — see the Messages tab.",
      disarm: "Disarm", forceDisarm: "Force disarm", brake: "Brake", hold: "Hold", land: "Land", prearm: "Pre-arm check",
      takeoffAlt: "Takeoff altitude (m)", takeoff: "Take off",
      confirmTakeoffTitle: "Take off to {alt} m?", confirmTakeoffDescription: "Switches to GUIDED, arms and climbs to {alt} m. Make sure the area is clear.",
      speed: "Speed (m/s)", changeSpeed: "Change speed", alt: "Altitude (m)", changeAlt: "Change altitude",
      confirmAltTitle: "Go to {alt} m?", confirmAltDescription: "The vehicle switches to GUIDED and climbs or descends to {alt} m above home where it is.",
      mission: "Mission", start: "Start", pause: "Pause", resume: "Resume", waypoint: "Waypoint #", setWaypoint: "Go to this waypoint",
      confirmMissionStartTitle: "Start the mission?", confirmMissionStartDescription: "Switches to AUTO and runs the uploaded mission from the current waypoint.",
      reboot: "Reboot autopilot", confirmRebootTitle: "Reboot the autopilot?", confirmRebootDescription: "No telemetry for 10–20 s while it restarts. Only while disarmed.",
      forceTitle: "Force disarm", forceDescription: "Force-disarming in flight stops the motors at once and a drone will fall. Emergencies only. Type DISARM to confirm.",
      forceType: "Type DISARM", forceConfirm: "Force disarm",
    },
    messages: { prearmTitle: "Pre-arm checks failing ({count})", count: "{count} messages", importantOnly: "Important only", empty: "No messages yet" },
    commands: { title: "Command log", empty: "No commands yet", viaDirect: "direct", viaCloud: "cloud" },
    graph: {
      alt: "Altitude", gs: "Groundspeed", vs: "Climb", batV: "Voltage", cellV: "Cell voltage", cur: "Current", roll: "Roll", pitch: "Pitch",
      vibe: "Vibration", ekf: "EKF", sats: "Satellites", waiting: "Collecting data…",
    },
    drive: {
      reqDirect: "Direct link connected", reqGuided: "GUIDED mode", reqArmed: "Armed", enterGuided: "Switch to GUIDED",
      pad: "Drive stick", maxSpeed: "Max speed", gamepadOn: "Gamepad: {name}", gamepadOff: "A gamepad works too (left stick)",
      hint: "Release the stick and the rover stops; if commands stop for 0.3 s the companion stops it as well.",
    },
    alerts: {
      mode: "Mode {mode}", armed: "Armed", disarmed: "Disarmed", batteryLow: "Battery low, {value} {unit}", batteryCritical: "Battery critical, {value} {unit}",
      linkLost: "Link lost", linkRestored: "Link restored", fcLost: "Autopilot not responding", gpsLost: "GPS degraded", ekfBad: "EKF error",
      vibeHigh: "High vibration", fenceBreach: "Fence breach", voiceOn: "Voice alerts on",
    },
    map: {
      layers: "Base map", layers_nlscPhoto: "NLSC orthophoto", layers_nlscEmap: "NLSC map", layers_esri: "Esri imagery", layers_osm: "OpenStreetMap",
      follow: "Follow vehicle", prefetch: "Save this area for offline use",
      prefetchNoWorker: "The offline cache is not running yet; reload the page and try again.", prefetchTooBig: "Area too large — zoom in first.",
      prefetchProgress: "Fetching tiles {done}/{total}", prefetchDone: "Cached {total} tiles ({failed} failed)",
      clearMeasure: "Clear measurement", driveHere: "Drive here", flyHere: "Fly here", lookHere: "Point camera here", setHomeHere: "Set home here", measure: "Measure distance",
    },
    fly: {
      title: "Fly here?", driveTitle: "Drive here?", guidedNote: "The vehicle switches to GUIDED mode.",
      alt: "Altitude (m above home)", cancel: "Cancel", confirm: "Fly there", driveConfirm: "Drive there",
    },
    home: { title: "Set a new home?", description: "RTL will return to {lat}, {lon}." },
    setup: {
      saved: "Saved",
      linksTitle: "Links", linksDescription: "The direct link connects this page straight to the Pi: 10 updates/s, and it keeps working when the cloud is down. Video comes from MediaMTX on the Pi.",
      directUrl: "Direct link URL (WebSocket)", directHint: "An https page can only open wss://. Tailscale (tailscale serve) gives a valid certificate; ws:// works when this app runs on http://localhost.",
      directStatus: "Direct link", statusIdle: "not set up",
      status_connecting: "connecting", status_open: "connected", status_unauthorized: "rejected (token or ticket_key mismatch)",
      status_blocked: "blocked by the browser", status_error: "unreachable",
      detail_mixedContent: "an https page cannot open ws:// — use wss://", detail_badUrl: "invalid URL",
      detail_unreachable: "check the Pi is up, the URL and port, and allow local-network access if the browser asks",
      detail_closed: "connection closed",
      videoUrl: "Video URL (WebRTC / WHEP)", videoHint: "MediaMTX WHEP endpoint, e.g. https://…:8889/cam/whep.",
      save: "Save",
      howTitle: "Setting it up",
      how1: "Generate a token on the right and save the config on the Pi as /etc/vehicle-companion/<name>.toml (including [direct]).",
      how2: "On the Pi run tailscale serve --bg --https=443 http://127.0.0.1:8765 and enter the resulting wss:// URL above.",
      how3: "Restart vehicle-companion@<name>; the status changes to “connected”.",
    },
  },
  "ja-JP": {
    back: "機体一覧へ",
    notFound: "機体が見つかりません",
    px4Basic: "PX4：基本機能のみ",
    control: "操作権を取得",
    controlHint: "閲覧モードです。コマンドを送るには「操作権を取得」をオンにしてください（誤操作防止）。",
    cloudControlNote: "クラウド経由で接続中（約1秒ごとに更新）。ジョイスティックと連続ジンバル操作には直接接続が必要です。",
    voiceOn: "音声オン",
    voiceOff: "音声オフ",
    tabs: { flight: "フライトデータ", plan: "フライトプラン", setup: "設定", quick: "数値", actions: "操作", messages: "メッセージ", graph: "グラフ", drive: "走行" },
    hud: { linkLost: "LINK LOST", noData: "テレメトリー待機中…", noAttitude: "姿勢データなし（旧コンパニオン）", armed: "アーム中", disarmed: "ディスアーム", fcLost: "FC応答なし" },
    status: {
      cloud: "クラウド", direct: "直接", noLink: "切断", ok: "正常", down: "切断", directOff: "未設定",
      direct_connecting: "接続中", direct_open: "接続済み", direct_unauthorized: "認証失敗", direct_blocked: "ブラウザがブロック", direct_error: "接続不可",
      fcTitle: "Pi ⇄ フライトコントローラー：最後のハートビートからの秒数",
      gpsTitle: "測位 · 衛星数 · HDOP（1.5以下が良好）",
      batTitle: "電圧 · セル電圧 · 残量 %",
      cellAvgTitle: "アナログ電流計はパック電圧のみ測定するため、セル電圧は平均値（~）です",
      ekfTitle: "EKF分散の最大値：0.5未満良好、0.5–0.8注意、0.8超危険",
      vibeTitle: "振動 m/s²：30以下良好、60超危険",
      rssiTitle: "送信機RSSI · テレメトリーRSSI",
      piTitle: "Piの温度と電源状態",
      underVoltage: "電圧不足！",
      prearmFail: "PreArm ×{count}", prearmOk: "PreArm OK", prearmUnknown: "PreArm —",
      prearmTitle: "フライトコントローラーのアーム前チェック",
      otherGcs: "他のGCS {count}台", otherGcsTitle: "他の地上局（Mission Plannerなど）が接続中です",
    },
    quick: {
      alt: "高度", groundspeed: "対地速度", climb: "上昇率", homeDist: "ホームまで", wpDist: "WPまで", waypoint: "ウェイポイント",
      voltage: "電圧", cell: "セル", current: "電流", used: "消費", heading: "方位", throttle: "スロットル", crosstrack: "横ずれ", wind: "風",
    },
    actions: {
      sent: "送信しました：{command}",
      ...prefix(cmdNames["ja-JP"], "cmd_"),
      modePlaceholder: "モードを選択", setMode: "変更",
      slideToArm: "スライドしてアーム", armBlocked: "アーム前チェックが未通過です。「メッセージ」タブを確認してください。",
      disarm: "ディスアーム", forceDisarm: "強制ディスアーム", brake: "ブレーキ", hold: "停止", land: "着陸", prearm: "プリアームチェック",
      takeoffAlt: "離陸高度（m）", takeoff: "離陸",
      confirmTakeoffTitle: "{alt} m まで離陸しますか？", confirmTakeoffDescription: "GUIDEDに切り替え、アームして {alt} m まで上昇します。周囲の安全を確認してください。",
      speed: "速度（m/s）", changeSpeed: "速度変更", alt: "高度（m）", changeAlt: "高度変更",
      confirmAltTitle: "{alt} m に変更しますか？", confirmAltDescription: "現在地でGUIDEDに切り替え、ホーム基準 {alt} m まで上昇または下降します。",
      mission: "ミッション", start: "開始", pause: "一時停止", resume: "再開", waypoint: "WP番号", setWaypoint: "このWPへ",
      confirmMissionStartTitle: "ミッションを開始しますか？", confirmMissionStartDescription: "AUTOに切り替え、書き込み済みミッションを現在のWPから実行します。",
      reboot: "FC再起動", confirmRebootTitle: "フライトコントローラーを再起動しますか？", confirmRebootDescription: "再起動中の10〜20秒間テレメトリーが途切れます。ディスアーム時のみ可能です。",
      forceTitle: "強制ディスアーム", forceDescription: "飛行中の強制ディスアームはモーターを即停止し、機体は落下します。緊急時のみ使用してください。確認のため DISARM と入力してください。",
      forceType: "DISARM と入力", forceConfirm: "強制ディスアーム",
    },
    messages: { prearmTitle: "アーム前チェック未通過（{count}件）", count: "{count}件のメッセージ", importantOnly: "重要のみ", empty: "メッセージはまだありません" },
    commands: { title: "コマンド履歴", empty: "コマンドはまだありません", viaDirect: "直接", viaCloud: "クラウド" },
    graph: {
      alt: "高度", gs: "対地速度", vs: "上昇率", batV: "電圧", cellV: "セル電圧", cur: "電流", roll: "ロール", pitch: "ピッチ",
      vibe: "振動", ekf: "EKF", sats: "衛星数", waiting: "データ収集中…",
    },
    drive: {
      reqDirect: "直接接続済み", reqGuided: "GUIDEDモード", reqArmed: "アーム中", enterGuided: "GUIDEDに切り替え",
      pad: "走行スティック", maxSpeed: "最高速度", gamepadOn: "ゲームパッド：{name}", gamepadOff: "ゲームパッドも使えます（左スティック）",
      hint: "スティックを離すと停止します。0.3秒以上コマンドが途切れるとコンパニオン側でも停止します。",
    },
    alerts: {
      mode: "モード {mode}", armed: "アームしました", disarmed: "ディスアームしました", batteryLow: "バッテリー低下、{value}{unit}", batteryCritical: "バッテリー危険、{value}{unit}",
      linkLost: "通信が途切れました", linkRestored: "通信が回復しました", fcLost: "フライトコントローラーが応答しません", gpsLost: "GPS測位不良", ekfBad: "EKF異常",
      vibeHigh: "振動が大きすぎます", fenceBreach: "ジオフェンス逸脱", voiceOn: "音声アラートをオンにしました",
    },
    map: {
      layers: "背景地図", layers_nlscPhoto: "台湾NLSC オルソ画像", layers_nlscEmap: "台湾NLSC 電子地図", layers_esri: "Esri 衛星画像", layers_osm: "OpenStreetMap",
      follow: "機体を追従", prefetch: "この範囲をオフライン保存",
      prefetchNoWorker: "オフラインキャッシュがまだ起動していません。ページを再読み込みしてください。", prefetchTooBig: "範囲が広すぎます。拡大してからお試しください。",
      prefetchProgress: "タイル取得中 {done}/{total}", prefetchDone: "{total}枚のタイルを保存しました（失敗 {failed}）",
      clearMeasure: "計測をクリア", driveHere: "ここへ走行", flyHere: "ここへ飛行", lookHere: "カメラをここへ", setHomeHere: "ホームに設定", measure: "距離を計測",
    },
    fly: {
      title: "ここへ飛行しますか？", driveTitle: "ここへ走行しますか？", guidedNote: "機体はGUIDEDモードに切り替わります。",
      alt: "高度（ホーム基準 m）", cancel: "キャンセル", confirm: "飛行", driveConfirm: "走行",
    },
    home: { title: "新しいホームを設定しますか？", description: "RTLは {lat}, {lon} に戻ります。" },
    setup: {
      saved: "保存しました",
      linksTitle: "接続", linksDescription: "直接接続ではこのページがPiに直接つながります（毎秒10回更新、クラウド停止時も操作可能）。映像はPi上のMediaMTXから配信されます。",
      directUrl: "直接接続URL（WebSocket）", directHint: "HTTPSページからは wss:// のみ接続できます。Tailscale（tailscale serve）なら有効な証明書が得られます。http://localhost で開いた場合は ws:// も使えます。",
      directStatus: "直接接続", statusIdle: "未設定",
      status_connecting: "接続中", status_open: "接続済み", status_unauthorized: "認証失敗（トークンまたは ticket_key が不一致）",
      status_blocked: "ブラウザがブロック", status_error: "接続不可",
      detail_mixedContent: "HTTPSページから ws:// には接続できません。wss:// を使用してください", detail_badUrl: "URLの形式が不正です",
      detail_unreachable: "Piが起動しているか、URLとポートを確認し、ブラウザに聞かれたらローカルネットワークへのアクセスを許可してください",
      detail_closed: "接続が閉じられました",
      videoUrl: "映像URL（WebRTC / WHEP）", videoHint: "MediaMTXのWHEPエンドポイント（例：https://…:8889/cam/whep）。",
      save: "保存",
      howTitle: "設定手順",
      how1: "右側でトークンを発行し、設定ファイルをPiの /etc/vehicle-companion/<名前>.toml に保存します（[direct] を含む）。",
      how2: "Piで tailscale serve --bg --https=443 http://127.0.0.1:8765 を実行し、表示された wss:// URLを上に入力します。",
      how3: "vehicle-companion@<名前> を再起動すると「接続済み」になります。",
    },
  },
};

for (const locale of ["zh-TW", "en-US", "ja-JP"]) {
  const path = new URL(`../../messages/control-center/${locale}.json`, import.meta.url);
  const messages = JSON.parse(readFileSync(path, "utf8"));
  delete messages.VehicleDrawer;
  delete messages.VehicleCommands;
  messages.Gcs = { ...(messages.Gcs ?? {}), ...GCS[locale] };
  writeFileSync(path, `${JSON.stringify(messages, null, 2)}\n`);
}

// Parity check: every locale must have the same keys.
const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
const sets = ["zh-TW", "en-US", "ja-JP"].map((l) => new Set(flat(JSON.parse(readFileSync(new URL(`../../messages/control-center/${l}.json`, import.meta.url), "utf8")))));
const [a, b, c] = sets;
const diff = [...a].filter((k) => !b.has(k) || !c.has(k)).concat([...b, ...c].filter((k) => !a.has(k)));
if (diff.length) {
  console.error("locale key mismatch:", [...new Set(diff)].slice(0, 20));
  process.exit(1);
}
console.log(`ok — ${a.size} keys in each locale`);
