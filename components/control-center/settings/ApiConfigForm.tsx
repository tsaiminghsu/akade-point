"use client";

import { KeyRound, ServerCog } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SettingsSection } from "./SettingsSection";
import { useMachinesStore } from "@/store/useMachinesStore";
import { useStoreSettingsStore } from "@/store/useStoreSettingsStore";

export function ApiConfigForm() {
  const activeStoreId = useMachinesStore((s) => s.activeStoreId);
  const settings = useStoreSettingsStore((s) => s.getSettings(activeStoreId));
  const updateSettings = useStoreSettingsStore((s) => s.updateSettings);

  return (
    <SettingsSection
      title="API Configuration"
      description="Backend endpoint and credentials (placeholder)"
      icon={ServerCog}
      actions={
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-status-online/40 bg-status-online/10 text-status-online">
            200 OK
          </Badge>
          <Button size="sm" variant="outline" onClick={() => toast.success("API configuration saved")}>
            Save
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Endpoint</Label>
          <Input
            className="h-9"
            value={settings.apiEndpoint}
            onChange={(e) => updateSettings(activeStoreId, { apiEndpoint: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1 text-xs text-muted-foreground">
            <KeyRound className="h-3 w-3" /> API Key
          </Label>
          <Input
            className="h-9"
            type="password"
            value={settings.apiKey}
            onChange={(e) => updateSettings(activeStoreId, { apiKey: e.target.value })}
          />
        </div>
      </div>
    </SettingsSection>
  );
}
