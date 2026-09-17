'use client';
import { useState } from 'react';
import { GraphicsSettings, Preset, detectPreset } from './graphicsSettings';
import { SegmentedRow, SettingsRow, SliderRow, ToggleRow, SegmentedControl } from './SettingsControls';

interface Props {
  open: boolean;
  settings: GraphicsSettings;
  gpuName: string;
  onChange: (patch: Partial<GraphicsSettings>) => void;
  onPreset: (preset: Preset) => void;
  onAutoDetect: () => void;
  onClose: () => void;
  onRestart: () => void;
  onExit: () => void;
  isMobile?: boolean;
}

type Tab = 'display' | 'audio' | 'controls';

const TABS: { id: Tab; label: string }[] = [
  { id: 'display',  label: '顯示' },
  { id: 'audio',    label: '音效' },
  { id: 'controls', label: '控制' },
];

const KEY_HELP: [string, string][] = [
  ['WASD / 方向鍵', '移動 · 駕駛'],
  ['滑鼠 / 滾輪', '環視 · 縮放'],
  ['Space', '跳躍 · 手煞車 · 上升'],
  ['Shift', '跑步 · 競速加速'],
  ['F', '上車 · 劫車 · 下車'],
  ['C', '自動駕駛'],
  ['E / X', '接受任務 · 放棄任務'],
  ['R / Tab', '競速重生 · FPV 視角'],
  ['P / M / T / G', '手機 · 地圖 · 辦事處 · 天氣'],
  ['Esc', '暫停選單'],
];

const MUTED = 'rgba(255,255,255,0.35)';
const LABEL = 'rgba(255,255,255,0.82)';

export default function PauseMenu({
  open, settings, gpuName, onChange, onPreset, onAutoDetect,
  onClose, onRestart, onExit, isMobile = false,
}: Props) {
  const [tab, setTab] = useState<Tab>('display');
  const [confirmRestart, setConfirmRestart] = useState(false);

  if (!open) return null;

  const preset = detectPreset(settings);
  const ssrUnavailable = isMobile;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        padding: isMobile ? '12px' : '24px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'rgba(7,11,19,0.96)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 20,
          padding: isMobile ? '16px' : '24px',
          width: isMobile ? '100%' : 520,
          maxWidth: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          fontFamily: 'monospace',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: '0.03em' }}>
              ⏸ 暫停
            </div>
            <div style={{ fontSize: 10, color: MUTED, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              AKADE CITY
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="繼續遊戲"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8,
              color: 'rgba(255,255,255,0.5)',
              fontSize: 16,
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1,
                  padding: isMobile ? '10px 8px' : '7px 8px',
                  minHeight: isMobile ? 44 : undefined,
                  fontSize: 12,
                  fontFamily: 'monospace',
                  borderRadius: 9,
                  cursor: 'pointer',
                  color: active ? '#fff' : 'rgba(255,255,255,0.45)',
                  background: active ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${active ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.08)'}`,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ── Display ─────────────────────────────────────────────────── */}
        {tab === 'display' && (
          <div>
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>畫質預設</div>
              <SegmentedControl
                value={preset}
                isMobile={isMobile}
                onChange={(p) => onPreset(p as Preset)}
                options={[
                  { value: 'low',    label: '低' },
                  { value: 'medium', label: '中' },
                  { value: 'high',   label: '高' },
                  { value: 'ultra',  label: '極致' },
                  ...(preset === 'custom' ? [{ value: 'custom' as const, label: '自訂' }] : []),
                ]}
              />
            </div>

            <SegmentedRow
              label="陰影品質"
              value={settings.shadowQuality}
              onChange={(v) => onChange({ shadowQuality: v })}
              isMobile={isMobile}
              options={[
                { value: 'off',    label: '關' },
                { value: 'low',    label: '低' },
                { value: 'medium', label: '中' },
                { value: 'high',   label: '高' },
                { value: 'ultra',  label: '極致' },
              ]}
            />

            <SliderRow
              label="陰影距離"
              value={settings.shadowDistance}
              min={40} max={200} step={10}
              onChange={(v) => onChange({ shadowDistance: v })}
              format={(v) => `${v}`}
              disabled={settings.shadowQuality === 'off'}
            />

            <ToggleRow
              label="光線追蹤反射（模擬）"
              hint={ssrUnavailable
                ? '行動裝置不支援'
                : '螢幕空間反射。效能成本高，建議搭配高階顯示卡'}
              value={settings.ssr}
              onChange={(v) => onChange({ ssr: v })}
              disabled={ssrUnavailable}
            />

            <SegmentedRow
              label="反射品質"
              value={settings.ssrQuality}
              onChange={(v) => onChange({ ssrQuality: v })}
              isMobile={isMobile}
              disabled={!settings.ssr || ssrUnavailable}
              options={[
                { value: 'low',  label: '半解析度' },
                { value: 'high', label: '全解析度' },
              ]}
            />

            <SegmentedRow
              label="環境光遮蔽"
              value={settings.ao}
              onChange={(v) => onChange({ ao: v })}
              isMobile={isMobile}
              options={[
                { value: 'off',  label: '關' },
                { value: 'ssao', label: 'SSAO' },
                { value: 'gtao', label: 'GTAO' },
              ]}
            />

            <ToggleRow
              label="泛光"
              value={settings.bloom}
              onChange={(v) => onChange({ bloom: v })}
            />

            <SliderRow
              label="泛光強度"
              value={settings.bloomStrength}
              min={0} max={1} step={0.05}
              onChange={(v) => onChange({ bloomStrength: v })}
              format={(v) => v.toFixed(2)}
              disabled={!settings.bloom}
            />

            <SegmentedRow
              label="抗鋸齒"
              value={settings.antiAliasing}
              onChange={(v) => onChange({ antiAliasing: v })}
              isMobile={isMobile}
              options={[
                { value: 'off',  label: '關' },
                { value: 'msaa', label: 'MSAA' },
                { value: 'fxaa', label: 'FXAA' },
                { value: 'smaa', label: 'SMAA' },
              ]}
            />

            <SliderRow
              label="解析度"
              hint="高於 100% 會以超取樣消除鋸齒，成本隨面積增加"
              value={settings.resolutionScale}
              min={0.5} max={2} step={0.05}
              onChange={(v) => onChange({ resolutionScale: v })}
              format={(v) => `${Math.round(v * 100)}%`}
            />

            <SliderRow
              label="繪製距離"
              value={settings.drawDistance}
              min={0.5} max={1.5} step={0.05}
              onChange={(v) => onChange({ drawDistance: v })}
              format={(v) => `${Math.round(v * 100)}%`}
            />

            <SliderRow
              label="視野角度"
              value={settings.fov}
              min={50} max={90} step={1}
              onChange={(v) => onChange({ fov: v })}
              format={(v) => `${v}°`}
            />

            <SliderRow
              label="車流密度"
              value={settings.trafficDensity}
              min={0} max={40} step={1}
              onChange={(v) => onChange({ trafficDensity: v })}
            />

            <SliderRow
              label="行人密度"
              value={settings.pedestrianDensity}
              min={0} max={128} step={4}
              onChange={(v) => onChange({ pedestrianDensity: v })}
            />

            <SliderRow
              label="停放車輛"
              value={settings.parkedCars}
              min={0} max={24} step={1}
              onChange={(v) => onChange({ parkedCars: v })}
            />

            <SegmentedRow
              label="路燈光源"
              hint="改變數量會重新編譯著色器，短暫停頓屬正常"
              value={settings.streetLightCount}
              onChange={(v) => onChange({ streetLightCount: v })}
              isMobile={isMobile}
              options={[
                { value: 0,  label: '關' },
                { value: 2,  label: '2' },
                { value: 6,  label: '6' },
                { value: 12, label: '12' },
              ]}
            />

            <SliderRow
              label="天氣粒子"
              value={settings.particleDensity}
              min={0} max={1} step={0.1}
              onChange={(v) => onChange({ particleDensity: v })}
              format={(v) => `${Math.round(v * 100)}%`}
            />

            <SegmentedRow
              label="更新率上限"
              value={settings.fpsCap}
              onChange={(v) => onChange({ fpsCap: v })}
              isMobile={isMobile}
              options={[
                { value: 0,  label: '不限' },
                { value: 60, label: '60' },
                { value: 30, label: '30' },
              ]}
            />

            <ToggleRow
              label="顯示 FPS"
              value={settings.showFps}
              onChange={(v) => onChange({ showFps: v })}
            />

            <SettingsRow label="重設為自動偵測" hint={gpuName || '未知顯示卡'}>
              <button
                onClick={onAutoDetect}
                style={{
                  padding: isMobile ? '10px 14px' : '6px 14px',
                  minHeight: isMobile ? 40 : undefined,
                  fontSize: 11,
                  fontFamily: 'monospace',
                  borderRadius: 8,
                  cursor: 'pointer',
                  color: 'rgba(255,255,255,0.7)',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.14)',
                }}
              >
                重設
              </button>
            </SettingsRow>
          </div>
        )}

        {/* ── Audio ───────────────────────────────────────────────────── */}
        {tab === 'audio' && (
          <div style={{ padding: '28px 0', textAlign: 'center', color: MUTED, fontSize: 12, lineHeight: 1.8 }}>
            🔇 遊戲目前沒有音效
            <div style={{ fontSize: 10, marginTop: 6 }}>音量設定會在加入配樂後開放</div>
          </div>
        )}

        {/* ── Controls ────────────────────────────────────────────────── */}
        {tab === 'controls' && (
          <div style={{ paddingTop: 4 }}>
            {KEY_HELP.map(([keys, what]) => (
              <div
                key={keys}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 16,
                  padding: '8px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                  fontSize: 11,
                }}
              >
                <span style={{ color: '#fff' }}>{keys}</span>
                <span style={{ color: MUTED, textAlign: 'right' }}>{what}</span>
              </div>
            ))}
          </div>
        )}

        {/* Footer actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              minWidth: 120,
              padding: isMobile ? '14px 16px' : '11px 16px',
              minHeight: isMobile ? 44 : undefined,
              fontSize: 13,
              fontFamily: 'monospace',
              fontWeight: 700,
              borderRadius: 10,
              cursor: 'pointer',
              color: '#06131a',
              background: '#00e5ff',
              border: '1px solid #00e5ff',
            }}
          >
            ▶ 繼續遊戲
          </button>

          {confirmRestart ? (
            <>
              <button
                onClick={() => { setConfirmRestart(false); onRestart(); }}
                style={{
                  flex: 1,
                  minWidth: 110,
                  padding: isMobile ? '14px 12px' : '11px 12px',
                  minHeight: isMobile ? 44 : undefined,
                  fontSize: 12,
                  fontFamily: 'monospace',
                  borderRadius: 10,
                  cursor: 'pointer',
                  color: '#fff',
                  background: 'rgba(248,113,113,0.22)',
                  border: '1px solid rgba(248,113,113,0.6)',
                }}
              >
                確定重新開始
              </button>
              <button
                onClick={() => setConfirmRestart(false)}
                style={{
                  padding: isMobile ? '14px 12px' : '11px 12px',
                  minHeight: isMobile ? 44 : undefined,
                  fontSize: 12,
                  fontFamily: 'monospace',
                  borderRadius: 10,
                  cursor: 'pointer',
                  color: 'rgba(255,255,255,0.6)',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                }}
              >
                取消
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmRestart(true)}
              style={{
                flex: 1,
                minWidth: 110,
                padding: isMobile ? '14px 12px' : '11px 12px',
                minHeight: isMobile ? 44 : undefined,
                fontSize: 12,
                fontFamily: 'monospace',
                borderRadius: 10,
                cursor: 'pointer',
                color: 'rgba(255,255,255,0.7)',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
              }}
            >
              重新開始
            </button>
          )}

          <button
            onClick={onExit}
            style={{
              flex: 1,
              minWidth: 110,
              padding: isMobile ? '14px 12px' : '11px 12px',
              minHeight: isMobile ? 44 : undefined,
              fontSize: 12,
              fontFamily: 'monospace',
              borderRadius: 10,
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.7)',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            回到大廳
          </button>
        </div>

        <div style={{ fontSize: 10, color: MUTED, textAlign: 'center', marginTop: 12 }}>
          設定即時套用並自動儲存 · 按 <span style={{ color: LABEL }}>Esc</span> 繼續
        </div>
      </div>
    </div>
  );
}
