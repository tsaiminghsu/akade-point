"use client";

import { useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { AlertEngine, type Alert } from "@/lib/control-center/vehicles/gcs/alerts";
import { useGcsStore } from "@/store/useGcsStore";

const LANG: Record<string, string> = { "zh-TW": "zh-TW", "en-US": "en-US", "ja-JP": "ja-JP" };

/**
 * Turns alert-engine output into toasts and, when `enabled`, speech (Web
 * Speech API). Browsers only allow speech after a user gesture, which is why
 * voice is off until the operator presses the button.
 */
export function useVoiceAlerts(enabled: boolean) {
  const t = useTranslations("Gcs.alerts");
  const locale = useLocale();
  const engineRef = useRef(new AlertEngine());
  const lastMsgKey = useRef<string | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    const speak = (text: string, urgent: boolean) => {
      if (!enabledRef.current || typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = LANG[locale] ?? "en-US";
      u.rate = urgent ? 1.1 : 1.0;
      if (urgent) window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    };
    const announce = (a: Alert) => {
      const text = a.kind === "text" ? String(a.params.text) : t(a.kind, a.params);
      if (a.severity === "critical") toast.error(text);
      else if (a.severity === "warn") toast.warning(text);
      speak(text, a.severity === "critical");
    };

    const unsub = useGcsStore.subscribe((s, prev) => {
      if (s.vehicleId === null) return;
      if (s.now !== prev.now || s.state !== prev.state) {
        for (const a of engineRef.current.update({ state: s.state, linkOk: !s.stale, now: s.now })) announce(a);
      }
      if (s.messages !== prev.messages && s.messages.length > 0) {
        // Only messages that arrive while the page is open, not the backlog.
        const newest = s.messages[s.messages.length - 1];
        if (lastMsgKey.current === null) {
          lastMsgKey.current = newest.key;
          return;
        }
        for (const m of s.messages) {
          if (m.key <= lastMsgKey.current) continue;
          const alert = engineRef.current.text(m, s.now);
          if (alert) announce(alert);
        }
        lastMsgKey.current = newest.key;
      }
    });
    return unsub;
  }, [t, locale]);
}
