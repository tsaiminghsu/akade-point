"use client";

import { useTranslations } from "next-intl";
import { Store } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandTable } from "./BrandTable";
import { StoreTable } from "./StoreTable";

export default function StoreManagementPageContent() {
  const t = useTranslations("StoreManagement");
  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Store className="h-5 w-5 text-primary" /> {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Tabs defaultValue="brands">
        <TabsList>
          <TabsTrigger value="brands">{t("brandsTab")}</TabsTrigger>
          <TabsTrigger value="stores">{t("storesTab")}</TabsTrigger>
        </TabsList>
        <TabsContent value="brands">
          <BrandTable />
        </TabsContent>
        <TabsContent value="stores">
          <StoreTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}
