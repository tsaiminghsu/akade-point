"use client";

import Link from "next/link";
import { ArrowRight, Store } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SettingsSection, SettingsRow } from "./SettingsSection";
import { useMachinesStore } from "@/store/useMachinesStore";

export function StoreConfigForm() {
  const stores = useMachinesStore((s) => s.stores);
  const brands = useMachinesStore((s) => s.brands);
  const activeStoreId = useMachinesStore((s) => s.activeStoreId);
  const activeStore = stores.find((s) => s.id === activeStoreId);
  const brand = brands.find((b) => b.id === activeStore?.brandId);

  return (
    <SettingsSection
      title="Store Configuration"
      description="Settings on this page apply to the active store, switched from the top navigation bar"
      icon={Store}
      actions={
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <Link href="/iot-control-center/stores">
            Manage Stores <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      }
    >
      <SettingsRow label="Active store" description={activeStore?.address}>
        <span className="text-sm font-medium text-foreground">{activeStore?.name ?? "—"}</span>
      </SettingsRow>
      <SettingsRow label="Brand">
        <span className="flex items-center gap-1.5 text-sm text-foreground">
          {brand && <span className="h-2.5 w-2.5 rounded-full" style={{ background: brand.color }} />}
          {brand?.name ?? "—"}
        </span>
      </SettingsRow>
    </SettingsSection>
  );
}
