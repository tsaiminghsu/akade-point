"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Copy, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/control-center/apiClient";
import { useVehiclesStore } from "@/store/useVehiclesStore";
import type { Vehicle } from "@/lib/control-center/vehicles/types";

interface TokenMeta {
  tokenId: string;
  label: string;
  createdAt: number;
  revokedAt: number | null;
}

export function VehicleTokenPanel({ vehicle }: { vehicle: Vehicle }) {
  const t = useTranslations("VehicleToken");
  const issueToken = useVehiclesStore((s) => s.issueToken);

  const [tokens, setTokens] = useState<TokenMeta[]>([]);
  const [plaintext, setPlaintext] = useState<string | null>(null);

  async function loadTokens() {
    const res = await apiRequest<{ tokens: TokenMeta[] }>(`/api/control-center/vehicles/${vehicle.id}/token`, undefined, {
      silent: true,
    });
    if (res) setTokens(res.tokens);
  }

  useEffect(() => {
    void loadTokens();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle.id]);

  async function generate() {
    const issued = await issueToken(vehicle.id, "companion");
    if (issued) {
      setPlaintext(issued.token);
      void loadTokens();
    }
  }

  function copy(text: string) {
    void navigator.clipboard?.writeText(text);
    toast.success(t("copyToast"));
  }

  const toml = plaintext
    ? [
        `vehicle_id = "${vehicle.id}"`,
        `api_base = "<your-server-url>"`,
        `token = "${plaintext}"`,
        `transport = "http"`,
        `mavlink_url = "udpin:127.0.0.1:14550"`,
      ].join("\n")
    : "";

  const active = tokens.filter((t) => t.revokedAt === null);

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1 text-sm font-medium text-foreground">{t("title")}</p>
        <p className="text-xs text-muted-foreground">{t("description")}</p>
      </div>

      <Button size="sm" className="gap-1.5" onClick={generate}>
        <KeyRound className="h-3.5 w-3.5" /> {t("generate")}
      </Button>
      <p className="text-xs text-status-warning">{t("rotateWarn")}</p>

      {plaintext && (
        <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
          <p className="text-xs font-medium text-foreground">{t("oneTime")}</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-[11px]">{plaintext}</code>
            <Button size="icon-sm" variant="outline" aria-label={t("copy")} onClick={() => copy(plaintext)}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("tomlHint")}</p>
          <div className="flex items-start gap-2">
            <pre className="min-w-0 flex-1 overflow-x-auto rounded bg-background px-2 py-1.5 text-[11px] leading-relaxed">{toml}</pre>
            <Button size="icon-sm" variant="outline" aria-label={t("copy")} onClick={() => copy(toml)}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("activeTokens")}</p>
        {active.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("noToken")}</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {active.map((tk) => (
              <li key={tk.tokenId} className="flex items-center justify-between rounded border border-border/60 px-2 py-1">
                <span className="font-mono text-muted-foreground">{tk.tokenId.slice(0, 12)}…</span>
                <span className="text-muted-foreground">{new Date(tk.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
