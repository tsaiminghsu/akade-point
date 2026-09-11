'use client';

/**
 * Ship tracker shell.
 *
 * Two views over the same subject. The radar console is the primary one and
 * runs entirely in the browser. The optical view is the original YOLO detector,
 * which needs the Python service on port 8000, so it is mounted only once the
 * operator selects it rather than opening a WebSocket to a service that is
 * usually not running.
 */

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState } from 'react';

import styles from './shell.module.css';

type View = 'radar' | 'optical';

function Loading({ mark, label }: { mark: string; label: string }) {
  return (
    <div className={styles.loading}>
      <span className={styles.loadingMark}>{mark}</span>
      <span>{label}</span>
    </div>
  );
}

const RadarConsole = dynamic(() => import('./radar/RadarConsole'), {
  ssr: false,
  loading: () => <Loading mark="📡" label="雷達系統啟動中..." />,
});

const OpticalDashboard = dynamic(() => import('./ShipTrackerDashboard'), {
  ssr: false,
  loading: () => <Loading mark="🎥" label="連線至光學辨識後端..." />,
});

export default function ShipTrackerApp() {
  const [view, setView] = useState<View>('radar');
  /**
   * Once the optical view has been opened it stays mounted, so switching back
   * to the radar does not drop its WebSocket and video stream and force a
   * reconnect every time.
   */
  const [opticalOpened, setOpticalOpened] = useState(false);

  const select = (next: View) => {
    if (next === 'optical') setOpticalOpened(true);
    setView(next);
  };

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <div className={styles.brand}>
          <span className={styles.brandName}>船舶監控台</span>
          <span className={styles.brandSub}>Radar / ARPA</span>
        </div>

        <nav className={styles.tabs}>
          <button
            type="button"
            className={view === 'radar' ? styles.tabActive : styles.tab}
            onClick={() => select('radar')}
          >
            雷達 ARPA
          </button>
          <button
            type="button"
            className={view === 'optical' ? styles.tabActive : styles.tab}
            onClick={() => select('optical')}
          >
            光學辨識
          </button>
        </nav>

        <div className={styles.spacer} />
        <Link href="/games" className={styles.backLink}>
          ← 返回遊戲大廳
        </Link>
      </header>

      <main className={styles.body}>
        {/* Both panes stay mounted once opened. Unmounting the radar would
            throw away every track it has built, and unmounting the optical
            view would drop its socket and video stream. */}
        <div className={styles.pane} hidden={view !== 'radar'}>
          <RadarConsole />
        </div>
        {opticalOpened && (
          <div className={styles.pane} hidden={view !== 'optical'}>
            <OpticalDashboard />
          </div>
        )}
      </main>
    </div>
  );
}
