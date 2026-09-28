"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Link2, Save, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/control-center/apiClient";
import type { Vehicle } from "@/lib/control-center/vehicles/types";
import { useGcsStore } from "@/store/useGcsStore";
import { VehicleTokenPanel } from "../../VehicleTokenPanel";
import { useCan } from "@/store/useAccessStore";

/** Links (direct WebSocket, video) and companion provisioning for one vehicle. */
export function VehicleSetupPanel({ vehicle }: { vehicle: Vehicle }) {
  // Links and tokens are vehicle provisioning: system-admin (lib/control-center/access.ts).
  const mayManage = useCan("vehicle.manage");
  const mayTokens = useCan("token.manage");
  const t = useTranslations("Gcs.setup");
  const reconnect = useGcsStore((s) => s.reconnectDirect);
  const link = useGcsStore((s) => s.link.direct);
  const [directUrl, setDirectUrl] = useState(vehicle.directUrl);
  const [videoUrl, setVideoUrl] = useState(vehicle.videoUrl);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDirectUrl(vehicle.directUrl);
    setVideoUrl(vehicle.videoUrl);
  }, [vehicle.id, vehicle.directUrl, vehicle.videoUrl]);

  const dirty = directUrl !== vehicle.directUrl || videoUrl !== vehicle.videoUrl;

  async function save() {
    setSaving(true);
    const res = await apiRequest<{ ok: true }>(`/api/control-center/vehicles/${vehicle.id}`, {
      method: "PATCH",
      body: JSON.stringify({ directUrl: directUrl.trim(), videoUrl: videoUrl.trim() }),
    });
    setSaving(false);
    if (res) {
      toast.success(t("saved"));
      // The next live poll brings the new URL; reconnect once it lands.
      setTimeout(reconnect, 1500);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-4">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Link2 className="h-4 w-4 text-primary" /> {t("linksTitle")}
          </h3>
          <p className="text-xs text-muted-foreground">{t("linksDescription")}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="direct-url">{t("directUrl")}</Label>
          <Input id="direct-url" placeholder="wss://drone.your-tailnet.ts.net" value={directUrl} onChange={(e) => setDirectUrl(e.target.value)} />
          <p className="text-xs text-muted-foreground">{t("directHint")}</p>
          <p className="text-xs">
            {t("directStatus")}:{" "}
            <span className="font-medium text-foreground">
              {link.status === "idle" ? t("statusIdle") : t(`status_${link.status}`)}
              {link.detail ? ` (${t.has(`detail_${link.detail}`) ? t(`detail_${link.detail}`) : link.detail})` : ""}
            </span>
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="video-url" className="flex items-center gap-1.5">
            <Video className="h-3.5 w-3.5" /> {t("videoUrl")}
          </Label>
          <Input id="video-url" placeholder="https://drone.your-tailnet.ts.net:8889/cam/whep" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
          <p className="text-xs text-muted-foreground">{t("videoHint")}</p>
        </div>
        <Button size="sm" className="gap-1.5" disabled={!dirty || saving || !mayManage} onClick={save}>
          <Save className="h-3.5 w-3.5" /> {t("save")}
        </Button>
        <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">{t("howTitle")}</p>
          <ol className="list-decimal space-y-1 pl-4">
            <li>{t("how1")}</li>
            <li>{t("how2")}</li>
            <li>{t("how3")}</li>
          </ol>
        </div>
      </section>
      {mayTokens && (
        <section>
          <VehicleTokenPanel vehicle={vehicle} />
        </section>
      )}
    </div>
  );
}
