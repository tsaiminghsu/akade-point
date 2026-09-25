"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, KeyRound, Unplug } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ClawConfig } from "@/lib/control-center/claw/config";
import type { Machine } from "@/lib/control-center/types";
import { useClawConfigsStore, type MachineTokenInfo } from "@/store/useClawConfigsStore";
import { DeliveryBadge } from "./DeliveryStatus";
import { useRelativeTime } from "./useRelativeTime";

interface BoardLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  machine: Machine;
  /** The machine's saved config (what its board should be running). */
  saved: ClawConfig;
}

/** secrets.h for firmware/esp32-claw-config, filled in with this server and token. */
function secretsSnippet(origin: string, token: string) {
  return [
    "#pragma once",
    '#define WIFI_SSID "your-wifi"',
    '#define WIFI_PASSWORD "your-password"',
    `#define API_BASE "${origin}"`,
    `#define DEVICE_TOKEN "${token}"`,
    "// https: paste Amazon Root CA 1 (amazontrust.com/repository/AmazonRootCA1.pem)",
    'static const char ROOT_CA[] = R"PEM(',
    ')PEM";',
  ].join("\n");
}

/** Connect a machine's ESP32: delivery status, and issuing or revoking its token. */
export function BoardLinkDialog({ open, onOpenChange, machine, saved }: BoardLinkDialogProps) {
  const t = useTranslations("ClawConfigs");
  const tCommon = useTranslations("Common");
  const relativeTime = useRelativeTime();
  const sync = useClawConfigsStore((s) => s.sync[machine.id]);

  const [tokens, setTokens] = useState<MachineTokenInfo[] | null>(null);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"rotate" | "revoke" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPlaintext(null);
    setConfirming(null);
    setTokens(null);
    void useClawConfigsStore.getState().listTokens(machine.id).then(setTokens);
  }, [open, machine.id]);

  const active = tokens?.find((tk) => tk.revokedAt === null) ?? null;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(origin);

  const issue = async () => {
    setBusy(true);
    const issued = await useClawConfigsStore.getState().issueToken(machine.id, "ESP32");
    setBusy(false);
    setConfirming(null);
    if (!issued) return;
    setPlaintext(issued.token);
    toast.success(t("tokenIssued"));
    setTokens(await useClawConfigsStore.getState().listTokens(machine.id));
  };

  const revoke = async () => {
    setBusy(true);
    const count = await useClawConfigsStore.getState().revokeTokens(machine.id);
    setBusy(false);
    setConfirming(null);
    if (count === null) return;
    setPlaintext(null);
    toast.success(t("tokensRevoked", { count }));
    setTokens(await useClawConfigsStore.getState().listTokens(machine.id));
  };

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text);
    toast.success(t("copiedToast"));
  };

  const ack = sync?.lastAck;
  const rows: [string, string][] = [
    [t("lastSeen"), sync?.pulledAt ? relativeTime(sync.pulledAt) : "—"],
    [t("savedVersion"), saved.revision ? t("versionValue", { rev: saved.revision }) : t("factoryShort")],
    [
      t("boardVersion"),
      sync?.appliedSha ? t("versionValue", { rev: sync.appliedRevision ?? 0 }) + ` · ${relativeTime(sync.appliedAt ?? 0)}` : "—",
    ],
    [t("firmware"), sync?.fw ?? "—"],
    [
      t("lastReport"),
      ack
        ? `${ack.st === "applied" ? t("reportApplied") : t("reportFailed", { code: ack.code })}${ack.msg ? ` · ${ack.msg}` : ""} · ${relativeTime(ack.t)}`
        : "—",
    ],
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("boardLinkTitle", { name: machine.name })}</DialogTitle>
          <DialogDescription>{t("boardLinkDescription")}</DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">{t("statusHeading")}</h3>
          <DeliveryBadge savedSettings={saved.settings} sync={sync} className="text-sm" />
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="min-w-0 break-words text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="space-y-2 border-t border-border pt-3">
          <h3 className="text-sm font-medium text-foreground">{t("tokenHeading")}</h3>
          <p className="text-xs text-muted-foreground">
            {tokens === null
              ? "…"
              : active
                ? t("tokenActive", { label: active.label, time: relativeTime(active.createdAt) })
                : t("tokenNone")}
          </p>

          {confirming ? (
            <div className="space-y-2 rounded-md border border-status-warning/50 bg-status-warning/10 p-3">
              <p className="text-xs text-foreground">
                {confirming === "rotate" ? t("rotateWarning") : t("revokeWarning")}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={confirming === "revoke" ? "destructive" : "default"}
                  disabled={busy}
                  onClick={() => void (confirming === "rotate" ? issue() : revoke())}
                >
                  {confirming === "rotate" ? t("confirmRotate") : t("confirmRevoke")}
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirming(null)}>
                  {tCommon("cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="gap-1.5"
                disabled={busy || tokens === null}
                onClick={() => (active ? setConfirming("rotate") : void issue())}
              >
                <KeyRound className="h-3.5 w-3.5" /> {active ? t("rotateToken") : t("issueToken")}
              </Button>
              {active && (
                <Button size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={() => setConfirming("revoke")}>
                  <Unplug className="h-3.5 w-3.5" /> {t("revokeToken")}
                </Button>
              )}
            </div>
          )}

          {plaintext && (
            <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
              <p className="text-xs font-medium text-foreground">{t("tokenOnce")}</p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-[11px]">{plaintext}</code>
                <Button size="icon-sm" variant="outline" aria-label={t("copy")} onClick={() => copy(plaintext)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("snippetHeading")}</p>
              <div className="flex items-start gap-2">
                <pre className="min-w-0 flex-1 overflow-x-auto rounded bg-background px-2 py-1.5 text-[11px] leading-relaxed">
                  {secretsSnippet(origin, plaintext)}
                </pre>
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label={t("copy")}
                  onClick={() => copy(secretsSnippet(origin, plaintext))}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              {isLocalhost && <p className="text-xs text-status-warning">{t("localhostWarning")}</p>}
            </div>
          )}
        </section>

        <p className="border-t border-border pt-3 text-xs text-muted-foreground">{t("firmwareHint")}</p>
      </DialogContent>
    </Dialog>
  );
}
