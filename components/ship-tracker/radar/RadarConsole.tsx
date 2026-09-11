'use client';

/**
 * The radar console: scope in the middle, controls either side, target list
 * below, alarms across the top.
 */

import { useCallback, useState } from 'react';

import { RadarScope } from './RadarScope';
import {
  AlarmBanner,
  DisplayPanel,
  GuardPanel,
  HelmPanel,
  SourcePanel,
  StatusBar,
  TargetDetail,
  TargetTable,
  TuningPanel,
} from './RadarPanels';
import styles from './radar.module.css';
import { useRadar } from './useRadar';

export default function RadarConsole() {
  const radar = useRadar();
  const [eblEnabled, setEblEnabled] = useState(false);
  const [ebl, setEbl] = useState({ bearing: 0, range: 1 });

  const handleEblChange = useCallback((bearing: number, range: number) => {
    setEbl({ bearing, range });
    setEblEnabled(true);
  }, []);

  return (
    <div className={styles.root}>
      <AlarmBanner snapshot={radar.snapshot} />

      <div className={styles.main}>
        <aside className={styles.rail}>
          <DisplayPanel config={radar.config} setConfig={radar.setConfig} />
          <TuningPanel
            config={radar.config}
            environment={radar.environment}
            setConfig={radar.setConfig}
            setEnvironment={radar.setEnvironment}
          />
          <GuardPanel config={radar.config} setConfig={radar.setConfig} />
        </aside>

        <div className={styles.center}>
          <RadarScope
            config={radar.config}
            snapshot={radar.snapshot}
            selectedTrackId={radar.selectedTrackId}
            onSelect={radar.setSelectedTrackId}
            onFrame={radar.onFrame}
            eblEnabled={eblEnabled}
            eblBearing={ebl.bearing}
            vrmRange={ebl.range}
            onEblChange={handleEblChange}
          />
          <TargetTable
            snapshot={radar.snapshot}
            selectedTrackId={radar.selectedTrackId}
            onSelect={radar.setSelectedTrackId}
          />
        </div>

        <aside className={styles.rail}>
          <SourcePanel
            source={radar.source}
            setSource={radar.setSource}
            liveStatus={radar.liveStatus}
            liveMessage={radar.liveMessage}
            paused={radar.paused}
            setPaused={radar.setPaused}
            onReset={radar.reset}
            config={radar.config}
            setConfig={radar.setConfig}
          />
          <HelmPanel own={radar.own} setOrdered={radar.setOrdered} />
          <TargetDetail target={radar.selectedTarget} />
        </aside>
      </div>

      <StatusBar
        snapshot={radar.snapshot}
        config={radar.config}
        source={radar.source}
        paused={radar.paused}
      />
    </div>
  );
}
