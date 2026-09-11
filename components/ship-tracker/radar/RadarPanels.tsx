'use client';

/**
 * Console panels around the scope.
 *
 * These are deliberately grouped the way a real bridge display groups them:
 * what the picture shows, how the receiver is tuned, what counts as dangerous,
 * and what own ship is doing. The tuning panel separates conditions from
 * controls, because the operator can only change one of those two.
 */

import { formatBearing, formatDuration, formatRange } from './geo';
import { RANGE_SCALES } from './engine';
import styles from './radar.module.css';
import type { Environment } from './radar';
import type {
  ArpaTarget,
  DataSource,
  NavStatus,
  Orientation,
  OwnShip,
  RadarConfig,
  RadarSnapshot,
  TrackStatus,
  VesselKind,
} from './types';
import type { LiveStatus } from './useRadar';

// ── Labels ────────────────────────────────────────────────────────

const ORIENTATION_LABELS: Record<Orientation, string> = {
  'north-up': '北向上',
  'head-up': '船首向上',
  'course-up': '航向向上',
};

const STATUS_LABELS: Record<TrackStatus, string> = {
  tentative: '暫定',
  confirmed: '已確認',
  coasting: '推算中',
  lost: '已失去',
};

const NAV_STATUS_LABELS: Record<NavStatus, string> = {
  underway: '航行中',
  anchored: '錨泊',
  moored: '繫泊',
  fishing: '漁撈作業',
  restricted: '操縱受限',
};

const KIND_LABELS: Record<VesselKind, string> = {
  container: '貨櫃船',
  tanker: '油輪',
  bulker: '散裝船',
  fishing: '漁船',
  tug: '拖船',
  pilot: '引水船',
  patrol: '巡防艇',
  cargo: '貨船',
};

function targetName(target: ArpaTarget): string {
  const name = target.ais?.name?.trim();
  if (name) return name;
  // A radar track with no AIS behind it has no name, and pretending otherwise
  // would hide exactly the thing the operator needs to notice.
  return target.aisOnly ? 'AIS 目標' : `不明目標 T${Math.abs(target.trackId)}`;
}

// ── Shared pieces ─────────────────────────────────────────────────

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>{title}</h2>
      {children}
    </section>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className={styles.slider}>
      <span className={styles.sliderLabel}>
        {label}
        <em>{format ? format(value) : value.toFixed(2)}</em>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className={styles.segmented}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? styles.segmentActive : styles.segment}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ── Panels ────────────────────────────────────────────────────────

export function DisplayPanel({
  config,
  setConfig,
}: {
  config: RadarConfig;
  setConfig: (patch: Partial<RadarConfig>) => void;
}) {
  return (
    <Panel title="顯示">
      <div className={styles.field}>
        <span className={styles.fieldLabel}>量程</span>
        <div className={styles.rangeGrid}>
          {RANGE_SCALES.map((nm) => (
            <button
              key={nm}
              type="button"
              className={nm === config.rangeNm ? styles.rangeActive : styles.rangeButton}
              onClick={() => setConfig({ rangeNm: nm })}
            >
              {nm < 1 ? nm.toFixed(2) : nm}
            </button>
          ))}
        </div>
        <span className={styles.hint}>單位：浬 (NM)</span>
      </div>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>方位模式</span>
        <SegmentedControl
          value={config.orientation}
          onChange={(orientation) => setConfig({ orientation })}
          options={[
            { value: 'north-up', label: ORIENTATION_LABELS['north-up'] },
            { value: 'head-up', label: ORIENTATION_LABELS['head-up'] },
            { value: 'course-up', label: ORIENTATION_LABELS['course-up'] },
          ]}
        />
      </div>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>向量模式</span>
        <SegmentedControl
          value={config.motionMode}
          onChange={(motionMode) => setConfig({ motionMode })}
          options={[
            { value: 'relative', label: '相對運動' },
            { value: 'true', label: '真運動' },
          ]}
        />
        <span className={styles.hint}>
          {config.motionMode === 'relative'
            ? '虛線指向目標相對本船的移動方向，指向中心即為碰撞航路'
            : '實線為目標對地的真實航向與航速'}
        </span>
      </div>

      <Slider
        label="向量長度"
        value={config.vectorMinutes}
        min={1}
        max={30}
        step={1}
        format={(v) => `${v} 分鐘`}
        onChange={(vectorMinutes) => setConfig({ vectorMinutes })}
      />
      <Slider
        label="航跡尾跡"
        value={config.trailMinutes}
        min={0}
        max={12}
        step={0.5}
        format={(v) => (v === 0 ? '關閉' : `${v} 分鐘`)}
        onChange={(trailMinutes) => setConfig({ trailMinutes })}
      />

      <div className={styles.toggleRow}>
        <Toggle
          label="AIS 疊加"
          checked={config.showAisOverlay}
          onChange={(showAisOverlay) => setConfig({ showAisOverlay })}
        />
        <Toggle
          label="向量"
          checked={config.showVectors}
          onChange={(showVectors) => setConfig({ showVectors })}
        />
        <Toggle
          label="尾跡"
          checked={config.showTrails}
          onChange={(showTrails) => setConfig({ showTrails })}
        />
      </div>
    </Panel>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={styles.toggle}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function TuningPanel({
  config,
  environment,
  setConfig,
  setEnvironment,
}: {
  config: RadarConfig;
  environment: Environment;
  setConfig: (patch: Partial<RadarConfig>) => void;
  setEnvironment: (patch: Partial<Environment>) => void;
}) {
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <Panel title="接收機調校">
      <Slider
        label="增益 GAIN"
        value={config.gain}
        min={0}
        max={1}
        step={0.01}
        format={pct}
        onChange={(gain) => setConfig({ gain })}
      />
      <Slider
        label="海浪抑制 STC"
        value={config.seaClutter}
        min={0}
        max={1}
        step={0.01}
        format={pct}
        onChange={(seaClutter) => setConfig({ seaClutter })}
      />
      <Slider
        label="雨雪抑制 FTC"
        value={config.rainClutter}
        min={0}
        max={1}
        step={0.01}
        format={pct}
        onChange={(rainClutter) => setConfig({ rainClutter })}
      />
      <p className={styles.hint}>
        增益過高會浮現雜訊，海浪抑制過強會連近距離的小船一併吃掉。
      </p>

      <div className={styles.divider} />
      <span className={styles.fieldLabel}>海況（無法由操作者控制）</span>
      <Slider
        label="浪級"
        value={environment.seaState}
        min={0}
        max={6}
        step={1}
        format={(v) => `${v} 級`}
        onChange={(seaState) => setEnvironment({ seaState })}
      />
      <Slider
        label="降雨"
        value={environment.rainRate}
        min={0}
        max={1}
        step={0.05}
        format={(v) => (v === 0 ? '無' : pct(v))}
        onChange={(rainRate) => setEnvironment({ rainRate })}
      />
    </Panel>
  );
}

export function GuardPanel({
  config,
  setConfig,
}: {
  config: RadarConfig;
  setConfig: (patch: Partial<RadarConfig>) => void;
}) {
  const zone = config.guardZone;
  return (
    <Panel title="警戒與碰撞判準">
      <Slider
        label="CPA 警戒距離"
        value={config.cpaLimitNm}
        min={0.1}
        max={3}
        step={0.1}
        format={(v) => `${v.toFixed(1)} NM`}
        onChange={(cpaLimitNm) => setConfig({ cpaLimitNm })}
      />
      <Slider
        label="TCPA 警戒時間"
        value={config.tcpaLimitMin}
        min={1}
        max={30}
        step={1}
        format={(v) => `${v} 分鐘`}
        onChange={(tcpaLimitMin) => setConfig({ tcpaLimitMin })}
      />

      <div className={styles.divider} />
      <Toggle
        label="啟用警戒區"
        checked={zone.enabled}
        onChange={(enabled) => setConfig({ guardZone: { ...zone, enabled } })}
      />
      <Slider
        label="內圈"
        value={zone.innerNm}
        min={0}
        max={6}
        step={0.1}
        format={(v) => `${v.toFixed(1)} NM`}
        onChange={(innerNm) =>
          setConfig({ guardZone: { ...zone, innerNm: Math.min(innerNm, zone.outerNm - 0.1) } })
        }
      />
      <Slider
        label="外圈"
        value={zone.outerNm}
        min={0.2}
        max={12}
        step={0.1}
        format={(v) => `${v.toFixed(1)} NM`}
        onChange={(outerNm) =>
          setConfig({ guardZone: { ...zone, outerNm: Math.max(outerNm, zone.innerNm + 0.1) } })
        }
      />
      <Slider
        label="扇形起始（相對船首）"
        value={zone.startRelBearing}
        min={0}
        max={359}
        step={1}
        format={formatBearing}
        onChange={(startRelBearing) => setConfig({ guardZone: { ...zone, startRelBearing } })}
      />
      <Slider
        label="扇形結束（相對船首）"
        value={zone.endRelBearing}
        min={0}
        max={359}
        step={1}
        format={formatBearing}
        onChange={(endRelBearing) => setConfig({ guardZone: { ...zone, endRelBearing } })}
      />
    </Panel>
  );
}

export function HelmPanel({
  own,
  setOrdered,
}: {
  own: OwnShip | null;
  setOrdered: (course?: number, speed?: number) => void;
}) {
  return (
    <Panel title="本船操縱">
      <dl className={styles.readout}>
        <div>
          <dt>船首向</dt>
          <dd>{own ? formatBearing(own.heading) : '--'}</dd>
        </div>
        <div>
          <dt>對地航速</dt>
          <dd>{own ? `${own.sog.toFixed(1)} kn` : '--'}</dd>
        </div>
        <div>
          <dt>緯度</dt>
          <dd>{own ? `${own.pos.lat.toFixed(5)}°` : '--'}</dd>
        </div>
        <div>
          <dt>經度</dt>
          <dd>{own ? `${own.pos.lon.toFixed(5)}°` : '--'}</dd>
        </div>
      </dl>

      <Slider
        label="指定航向"
        value={own?.orderedCourse ?? 0}
        min={0}
        max={359}
        step={1}
        format={formatBearing}
        onChange={(course) => setOrdered(course, undefined)}
      />
      <Slider
        label="指定航速"
        value={own?.orderedSpeed ?? 0}
        min={0}
        max={24}
        step={0.5}
        format={(v) => `${v.toFixed(1)} kn`}
        onChange={(speed) => setOrdered(undefined, speed)}
      />
      <p className={styles.hint}>改變航向或航速後，所有目標的 CPA 與 TCPA 會隨之重算。</p>
    </Panel>
  );
}

export function SourcePanel({
  source,
  setSource,
  liveStatus,
  liveMessage,
  paused,
  setPaused,
  onReset,
  config,
  setConfig,
}: {
  source: DataSource;
  setSource: (source: DataSource) => void;
  liveStatus: LiveStatus;
  liveMessage: string | null;
  paused: boolean;
  setPaused: (paused: boolean) => void;
  onReset: () => void;
  config: RadarConfig;
  setConfig: (patch: Partial<RadarConfig>) => void;
}) {
  return (
    <Panel title="資料來源">
      <SegmentedControl
        value={source}
        onChange={setSource}
        options={[
          { value: 'simulation', label: '模擬' },
          { value: 'live-ais', label: '真實 AIS' },
        ]}
      />
      <p className={styles.hint}>
        {source === 'simulation'
          ? '高雄港航道模擬：船名與 MMSI 取自真實 AIS 紀錄，航跡由運動模型產生。'
          : liveMessage ?? '透過伺服器轉送 AISStream.io 的即時位置報告。'}
      </p>
      {source === 'live-ais' && (
        <div className={`${styles.liveStatus} ${styles[`live_${liveStatus}`] ?? ''}`}>
          {liveStatus === 'connected' ? '● 已連線' : liveStatus === 'connecting' ? '● 連線中' : '● 未連線'}
        </div>
      )}

      <div className={styles.divider} />
      <Slider
        label="天線轉速"
        value={config.sweepRpm}
        min={12}
        max={48}
        step={1}
        format={(v) => `${v} rpm`}
        onChange={(sweepRpm) => setConfig({ sweepRpm })}
      />
      <div className={styles.btnRow}>
        <button type="button" className={styles.btn} onClick={() => setPaused(!paused)}>
          {paused ? '繼續' : '暫停'}
        </button>
        <button type="button" className={styles.btn} onClick={onReset}>
          重設場景
        </button>
      </div>
    </Panel>
  );
}

// ── Target list and detail ────────────────────────────────────────

export function TargetTable({
  snapshot,
  selectedTrackId,
  onSelect,
}: {
  snapshot: RadarSnapshot | null;
  selectedTrackId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const targets = snapshot?.targets ?? [];

  // Only acquired targets belong in the numeric list. A tentative track is a
  // plot the tracker has seen once or twice and has not yet decided is a
  // vessel, so it has no velocity worth reporting and no CPA worth trusting.
  // Some of them are sea clutter. They still paint on the scope as unacquired
  // contacts, which is where an operator expects to judge them.
  const acquired = targets.filter((t) => t.status !== 'tentative');
  const unacquired = targets.length - acquired.length;

  // Sort by threat first, then by range: the list should read in the order the
  // watchkeeper would deal with them.
  const rank = { danger: 0, warning: 1, safe: 2 } as const;
  const ordered = [...acquired].sort(
    (a, b) => rank[a.danger] - rank[b.danger] || a.rangeNm - b.rangeNm
  );

  return (
    <div className={styles.tableWrap}>
      <div className={styles.tableHead}>
        <h2 className={styles.panelTitle}>目標清單</h2>
        <span className={styles.tableCount}>
          {ordered.length} 個目標
          {unacquired > 0 && ` · ${unacquired} 個未擷取回波`}
        </span>
      </div>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>目標</th>
              <th>方位</th>
              <th>距離</th>
              <th>航向</th>
              <th>航速</th>
              <th>CPA</th>
              <th>TCPA</th>
              <th>狀態</th>
            </tr>
          </thead>
          <tbody>
            {ordered.length === 0 && (
              <tr>
                <td colSpan={8} className={styles.tableEmpty}>
                  尚未擷取到目標
                </td>
              </tr>
            )}
            {ordered.map((target) => (
              <tr
                key={target.trackId}
                className={[
                  target.trackId === selectedTrackId ? styles.rowSelected : '',
                  target.danger === 'danger' ? styles.rowDanger : '',
                  target.danger === 'warning' ? styles.rowWarning : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onSelect(target.trackId)}
              >
                <td className={styles.cellName}>
                  {targetName(target)}
                  {target.aisOnly && <span className={styles.tagAis}>AIS</span>}
                  {!target.ais && !target.aisOnly && <span className={styles.tagDark}>無 AIS</span>}
                </td>
                <td>{formatBearing(target.bearing)}</td>
                <td>{formatRange(target.rangeNm)}</td>
                <td>{target.sog > 0.4 ? formatBearing(target.cog) : '--'}</td>
                <td>{target.sog.toFixed(1)}</td>
                <td>{formatRange(target.cpaNm)}</td>
                <td>{target.tcpaSec > 0 ? formatDuration(target.tcpaSec) : '--'}</td>
                <td>{STATUS_LABELS[target.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TargetDetail({ target }: { target: ArpaTarget | null }) {
  if (!target) {
    return (
      <Panel title="目標資訊">
        <p className={styles.hint}>在雷達畫面或清單中點選一個目標以顯示詳細解算。</p>
      </Panel>
    );
  }

  const ais = target.ais;

  return (
    <Panel title="目標資訊">
      <div className={styles.detailName}>
        {targetName(target)}
        <span className={`${styles.badge} ${styles[`badge_${target.danger}`]}`}>
          {target.danger === 'danger' ? '危險' : target.danger === 'warning' ? '注意' : '安全'}
        </span>
      </div>

      <dl className={styles.readout}>
        <div>
          <dt>真方位</dt>
          <dd>{formatBearing(target.bearing)}</dd>
        </div>
        <div>
          <dt>相對方位</dt>
          <dd>{formatBearing(target.relativeBearing)}</dd>
        </div>
        <div>
          <dt>距離</dt>
          <dd>{formatRange(target.rangeNm)}</dd>
        </div>
        <div>
          <dt>追蹤狀態</dt>
          <dd>{STATUS_LABELS[target.status]}</dd>
        </div>
        <div>
          <dt>真航向</dt>
          <dd>{formatBearing(target.cog)}</dd>
        </div>
        <div>
          <dt>真航速</dt>
          <dd>{target.sog.toFixed(1)} kn</dd>
        </div>
        <div>
          <dt>相對航向</dt>
          <dd>{formatBearing(target.relCourse)}</dd>
        </div>
        <div>
          <dt>相對航速</dt>
          <dd>{target.relSpeed.toFixed(1)} kn</dd>
        </div>
        <div>
          <dt>CPA</dt>
          <dd className={target.danger !== 'safe' ? styles.valueAlarm : undefined}>
            {formatRange(target.cpaNm)}
          </dd>
        </div>
        <div>
          <dt>TCPA</dt>
          <dd className={target.danger !== 'safe' ? styles.valueAlarm : undefined}>
            {target.tcpaSec > 0 ? formatDuration(target.tcpaSec) : '已通過'}
          </dd>
        </div>
        <div>
          <dt>船首穿越距離</dt>
          <dd>
            {Number.isFinite(target.bowCrossRangeNm) && target.bowCrossTimeSec > 0
              ? formatRange(target.bowCrossRangeNm)
              : '--'}
          </dd>
        </div>
        <div>
          <dt>船首穿越時間</dt>
          <dd>
            {Number.isFinite(target.bowCrossTimeSec) && target.bowCrossTimeSec > 0
              ? formatDuration(target.bowCrossTimeSec)
              : '--'}
          </dd>
        </div>
      </dl>

      {(target.steadyBearing || target.manoeuvring || target.inGuardZone) && (
        <ul className={styles.flags}>
          {target.steadyBearing && <li className={styles.flagDanger}>方位不變且距離縮短：碰撞航路</li>}
          {target.manoeuvring && <li className={styles.flagWarn}>目標正在轉向，解算暫不可靠</li>}
          {target.inGuardZone && <li className={styles.flagWarn}>已進入警戒區</li>}
        </ul>
      )}

      <div className={styles.divider} />
      <span className={styles.fieldLabel}>AIS 靜態資料</span>
      {ais ? (
        <dl className={styles.readout}>
          <div>
            <dt>MMSI</dt>
            <dd>{ais.mmsi}</dd>
          </div>
          <div>
            <dt>船型</dt>
            <dd>{KIND_LABELS[ais.kind]}</dd>
          </div>
          <div>
            <dt>船長</dt>
            <dd>{ais.lengthM} m</dd>
          </div>
          <div>
            <dt>航行狀態</dt>
            <dd>{NAV_STATUS_LABELS[ais.navStatus]}</dd>
          </div>
          <div>
            <dt>目的港</dt>
            <dd>{ais.destination || '--'}</dd>
          </div>
          <div>
            <dt>AIS 位置</dt>
            <dd>
              {ais.lat.toFixed(4)}, {ais.lon.toFixed(4)}
            </dd>
          </div>
        </dl>
      ) : (
        <p className={styles.hint}>
          此目標僅由雷達回波追蹤，未收到對應的 AIS 報告。可能是未裝設或未開啟 AIS 的船舶。
        </p>
      )}
    </Panel>
  );
}

export function AlarmBanner({ snapshot }: { snapshot: RadarSnapshot | null }) {
  const alarms = snapshot?.alarms ?? [];
  const guard = snapshot?.guardAlarms ?? [];
  if (alarms.length === 0 && guard.length === 0) return null;

  const worst = alarms[0] ?? guard[0];

  return (
    <div className={alarms.length > 0 ? styles.alarmDanger : styles.alarmWarn}>
      <strong>{alarms.length > 0 ? '碰撞警報' : '警戒區警報'}</strong>
      <span>
        {targetName(worst)} · 方位 {formatBearing(worst.bearing)} · 距離{' '}
        {formatRange(worst.rangeNm)}
        {alarms.length > 0 &&
          ` · CPA ${formatRange(worst.cpaNm)} · TCPA ${formatDuration(worst.tcpaSec)}`}
      </span>
      {alarms.length + guard.length > 1 && (
        <em>另有 {alarms.length + guard.length - 1} 個目標告警</em>
      )}
    </div>
  );
}

export function StatusBar({
  snapshot,
  config,
  source,
  paused,
}: {
  snapshot: RadarSnapshot | null;
  config: RadarConfig;
  source: DataSource;
  paused: boolean;
}) {
  const targets = snapshot?.targets ?? [];
  const radarTracks = targets.filter((t) => !t.aisOnly && t.status !== 'tentative').length;
  const tentative = targets.filter((t) => t.status === 'tentative').length;
  const aisOnly = targets.filter((t) => t.aisOnly).length;

  return (
    <footer className={styles.statusBar}>
      <span>量程 {config.rangeNm} NM</span>
      <span>{ORIENTATION_LABELS[config.orientation]}</span>
      <span>{config.motionMode === 'true' ? '真運動向量' : '相對運動向量'}</span>
      <span>天線 {config.sweepRpm} rpm</span>
      <span>掃描 {snapshot?.scanCount ?? 0}</span>
      <span>雷達追蹤 {radarTracks}</span>
      <span>未擷取 {tentative}</span>
      <span>僅 AIS {aisOnly}</span>
      <span className={targets.some((t) => t.danger === 'danger') ? styles.statusAlarm : undefined}>
        危險 {targets.filter((t) => t.danger === 'danger').length}
      </span>
      <span>{source === 'simulation' ? '模擬資料' : '真實 AIS'}</span>
      {paused && <span className={styles.statusAlarm}>已暫停</span>}
    </footer>
  );
}
