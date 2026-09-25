"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  MonitorSmartphone,
  HardDrive,
  Plane,
  ShieldAlert,
  History,
  BarChart3,
  Store,
  Users,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUIStore } from "@/store/useUIStore";
import { useAlertStore } from "@/store/useAlertStore";

interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  badgeCount?: () => number;
}

const ROOT = "/iot-control-center";

const NAV_ITEMS: NavItem[] = [
  { href: ROOT, labelKey: "dashboard", icon: LayoutDashboard },
  { href: `${ROOT}/editor`, labelKey: "controlCenter", icon: MonitorSmartphone },
  { href: `${ROOT}/machines`, labelKey: "machines", icon: HardDrive },
  { href: `${ROOT}/vehicles`, labelKey: "vehicles", icon: Plane },
  { href: `${ROOT}/alerts`, labelKey: "alerts", icon: ShieldAlert },
  { href: `${ROOT}/history`, labelKey: "history", icon: History },
  { href: `${ROOT}/analytics`, labelKey: "analytics", icon: BarChart3 },
  { href: `${ROOT}/stores`, labelKey: "storeManagement", icon: Store },
  { href: `${ROOT}/users`, labelKey: "users", icon: Users },
  { href: `${ROOT}/settings`, labelKey: "settings", icon: Settings },
];

export function ControlCenterSidebar() {
  const t = useTranslations("Sidebar");
  const pathname = usePathname() ?? "";
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const mobileOpen = useUIStore((s) => s.mobileSidebarOpen);
  const setMobileSidebarOpen = useUIStore((s) => s.setMobileSidebarOpen);
  const activeAlerts = useAlertStore((s) => s.alerts.filter((a) => a.status === "active").length);

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-60 -translate-x-full flex-col border-r border-border bg-card backdrop-blur-sm transition-transform duration-200",
          "md:relative md:z-auto md:translate-x-0 md:bg-card/60 md:transition-[width]",
          mobileOpen && "translate-x-0",
          collapsed ? "md:w-[68px]" : "md:w-60"
        )}
      >
        <div className="flex h-14 items-center justify-end border-b border-border px-3 md:hidden">
          <Button variant="ghost" size="icon-sm" onClick={() => setMobileSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2 pt-3 custom-scrollbar">
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = item.href === ROOT ? pathname === item.href : pathname.startsWith(item.href);
              const link = (
                <Link
                  href={item.href}
                  onClick={() => setMobileSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    collapsed && "md:justify-center md:px-0",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className={cn("truncate", collapsed && "md:hidden")}>{t(item.labelKey)}</span>
                  {item.href === `${ROOT}/alerts` && activeAlerts > 0 && (
                    <span
                      className={cn(
                        "ml-auto rounded-full bg-status-alarm px-1.5 py-0.5 text-[10px] font-semibold text-white",
                        collapsed && "md:hidden"
                      )}
                    >
                      {activeAlerts}
                    </span>
                  )}
                </Link>
              );
              return (
                <li key={item.href}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right" className="hidden md:block">
                        {t(item.labelKey)}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="hidden border-t border-border p-2 md:block">
          <Button
            variant="ghost"
            size="sm"
            className={cn("w-full justify-center text-muted-foreground", !collapsed && "justify-start")}
            onClick={toggleSidebar}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            {!collapsed && <span>{t("collapse")}</span>}
          </Button>
        </div>
      </aside>
    </>
  );
}
