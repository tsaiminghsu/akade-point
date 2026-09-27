"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Clock, Loader2, ShieldAlert, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { VehicleStateV2 } from "@/lib/control-center/vehicles/types";
import type { GcsCommand, GcsMessage } from "@/store/useGcsStore";

const SEV_CLASS: Record<number, string> = {
  0: "text-status-alarm font-semibold",
  1: "text-status-alarm font-semibold",
  2: "text-status-alarm",
  3: "text-status-alarm",
  4: "text-status-warning",
  5: "text-foreground",
  6: "text-muted-foreground",
  7: "text-muted-foreground/70",
};

function time(t: number) {
  return new Date(t).toLocaleTimeString(undefined, { hour12: false });
}

/** STATUSTEXT history plus a block listing every current pre-arm failure. */
export function MessagesPanel({ messages, state }: { messages: GcsMessage[]; state: VehicleStateV2 | null }) {
  const t = useTranslations("Gcs.messages");
  const [importantOnly, setImportantOnly] = useState(false);
  const shown = useMemo(() => {
    const list = importantOnly ? messages.filter((m) => m.sev <= 4) : messages;
    return [...list].reverse();
  }, [messages, importantOnly]);
  const prearm = state?.health.msgs ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {prearm.length > 0 && (
        <div className="rounded-md border border-status-alarm/40 bg-status-alarm/10 p-2">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-status-alarm">
            <ShieldAlert className="h-3.5 w-3.5" /> {t("prearmTitle", { count: prearm.length })}
          </p>
          <ul className="space-y-0.5 text-xs text-foreground">
            {prearm.map((m) => (
              <li key={m}>• {m.replace(/^(PreArm|Arm):\s*/, "")}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{t("count", { count: messages.length })}</span>
        <Button size="sm" variant={importantOnly ? "secondary" : "ghost"} className="h-7 text-xs" onClick={() => setImportantOnly((v) => !v)}>
          {t("importantOnly")}
        </Button>
      </div>
      <ol className="min-h-0 flex-1 space-y-0.5 overflow-y-auto font-mono text-xs">
        {shown.length === 0 && <li className="text-muted-foreground">{t("empty")}</li>}
        {shown.map((m) => (
          <li key={m.key} className={SEV_CLASS[m.sev] ?? ""}>
            <span className="mr-2 text-muted-foreground">{time(m.t)}</span>
            {m.comp !== 1 && <span className="mr-1 text-muted-foreground">[{m.comp}]</span>}
            {m.text}
          </li>
        ))}
      </ol>
    </div>
  );
}

const STATUS_ICON = {
  pending: <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />,
  sent: <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />,
  acked: <CheckCircle2 className="h-3.5 w-3.5 text-status-online" />,
  failed: <XCircle className="h-3.5 w-3.5 text-status-alarm" />,
  timeout: <Clock className="h-3.5 w-3.5 text-status-warning" />,
} as const;

export function CommandLog({ commands, limit = 12 }: { commands: GcsCommand[]; limit?: number }) {
  const t = useTranslations("Gcs.commands");
  if (commands.length === 0) return <p className="text-xs text-muted-foreground">{t("empty")}</p>;
  return (
    <ul className="space-y-1 text-xs">
      {commands.slice(0, limit).map((c) => (
        <li key={c.id} className="flex items-start gap-1.5">
          <span className="mt-0.5">{STATUS_ICON[c.status]}</span>
          <span className="min-w-0 flex-1">
            <span className="font-medium text-foreground">{c.type}</span>
            <span className="ml-1.5 text-muted-foreground">
              {time(c.createdAt)} · {c.via === "direct" ? t("viaDirect") : t("viaCloud")}
            </span>
            {c.code && c.status !== "acked" && <span className="block text-status-alarm">{c.code}</span>}
            {c.msg && <span className="block break-words text-muted-foreground">{c.msg}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
