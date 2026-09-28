"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { KeyRound, ShieldCheck, ShieldOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/control-center/shared/ConfirmDialog";
import { useGcsStore } from "@/store/useGcsStore";

/**
 * MAVLink2 signing (system-admins). The companion signs everything once its
 * [signing] passphrase is set; this hands the key to the autopilot (or a zero
 * key to switch signing off). After that the autopilot refuses unsigned
 * MAVLink on every port except USB and ports with MAVn_OPTIONS bit 0 — so
 * Mission Planner needs the same passphrase, and a STorM32 or ESP32 on an
 * autopilot port needs that bit (and a reboot) to keep working.
 */
export function SigningPanel() {
  const t = useTranslations("Gcs.signing");
  const sendAndWait = useGcsStore((s) => s.sendAndWait);
  const on = useGcsStore((s) => s.state?.signing?.on ?? null);
  const armed = useGcsStore((s) => s.state?.armed === true);
  const control = useGcsStore((s) => s.control);
  const stale = useGcsStore((s) => s.stale);
  const [confirm, setConfirm] = useState<"enable" | "disable" | null>(null);
  const [busy, setBusy] = useState(false);

  async function apply(enable: boolean) {
    setBusy(true);
    const c = await sendAndWait({ type: "signing_apply", enable }, { cloudOnly: true, timeoutMs: 20_000 });
    setBusy(false);
    if (c?.status === "acked") toast.success(t(enable ? "enabledToast" : "disabledToast"));
    else toast.error(t("failed", { reason: c?.msg || c?.code || "—" }));
  }

  const ready = control && !stale && !armed && on === true;

  return (
    <section className="space-y-3">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <KeyRound className="h-4 w-4 text-primary" /> {t("title")}
        </h3>
        <p className="text-xs text-muted-foreground">{t("description")}</p>
      </div>
      <p className="text-xs">
        {t("companion")}:{" "}
        <span className={`font-medium ${on ? "text-status-online" : "text-muted-foreground"}`}>{on === null ? "—" : on ? t("companionOn") : t("companionOff")}</span>
      </p>
      {on === false && <p className="rounded-md border border-border/60 bg-muted/30 p-2 font-mono text-[11px]">{t("configHint")}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="gap-1.5" disabled={!ready || busy} onClick={() => setConfirm("enable")}>
          <ShieldCheck className="h-3.5 w-3.5" /> {t("enable")}
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={!ready || busy} onClick={() => setConfirm("disable")}>
          <ShieldOff className="h-3.5 w-3.5" /> {t("disable")}
        </Button>
      </div>
      {!control && <p className="text-[11px] text-muted-foreground">{t("needControl")}</p>}
      {armed && <p className="text-[11px] text-status-warning">{t("armed")}</p>}
      <ul className="list-disc space-y-1 pl-4 text-[11px] text-muted-foreground">
        <li>{t("noteMp")}</li>
        <li>{t("notePorts")}</li>
        <li>{t("noteUsb")}</li>
      </ul>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t(confirm === "disable" ? "confirmDisableTitle" : "confirmEnableTitle")}
        description={t(confirm === "disable" ? "confirmDisable" : "confirmEnable")}
        destructive={confirm === "enable"}
        onConfirm={() => {
          const enable = confirm === "enable";
          setConfirm(null);
          void apply(enable);
        }}
      />
    </section>
  );
}
