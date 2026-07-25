"use client";

import { Store } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandTable } from "./BrandTable";
import { StoreTable } from "./StoreTable";

export default function StoreManagementPageContent() {
  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Store className="h-5 w-5 text-primary" /> Store Management
        </h1>
        <p className="text-sm text-muted-foreground">Manage brands and the stores that belong under them</p>
      </div>

      <Tabs defaultValue="brands">
        <TabsList>
          <TabsTrigger value="brands">Brands</TabsTrigger>
          <TabsTrigger value="stores">Stores</TabsTrigger>
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
