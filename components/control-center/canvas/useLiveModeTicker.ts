"use client";

import { useEffect } from "react";

import { LIVE_TICK_MS } from "@/lib/control-center/constants";
import { useControlCenterStore } from "@/store/useControlCenterStore";
import { useMachinesStore } from "@/store/useMachinesStore";
import { useAlertStore } from "@/store/useAlertStore";

/** Drives Live Mode: every ~1s while mode === 'live', advances the mock
 * telemetry simulation and fans out any newly-crossed thresholds to the
 * alert store (toast + Alert Center). Decoupled from the store itself so a
 * future real data source (WebSocket/SSE) can call the same setters. */
export function useLiveModeTicker() {
  const mode = useControlCenterStore((s) => s.mode);

  useEffect(() => {
    if (mode !== "live") return;
    const interval = setInterval(() => {
      const { alerts } = useMachinesStore.getState().runLiveTick();
      if (alerts.length > 0) {
        useAlertStore.getState().pushAlerts(alerts);
      }
    }, LIVE_TICK_MS);
    return () => clearInterval(interval);
  }, [mode]);
}
