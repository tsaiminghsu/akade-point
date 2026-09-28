"use client";

import { useEffect, useState } from "react";
import { Bell, Check, ChevronDown, Menu, Moon, Radio, Search, Store as StoreIcon, Sun, User } from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusDot } from "@/components/control-center/shared/StatusDot";
import { SearchCommand } from "@/components/control-center/shared/SearchCommand";
import { useMachinesStore } from "@/store/useMachinesStore";
import { useAccessStore } from "@/store/useAccessStore";
import { useAlertStore } from "@/store/useAlertStore";
import { ROLES } from "@/lib/control-center/access";
import { useUIStore } from "@/store/useUIStore";
import { cn } from "@/lib/utils";

export function ControlCenterTopNav() {
  const t = useTranslations("TopNav");
  const locale = useLocale();
  const [darkMode, setDarkMode] = useState(true);
  const stores = useMachinesStore((s) => s.stores);
  const activeStoreId = useMachinesStore((s) => s.activeStoreId);
  const setActiveStore = useMachinesStore((s) => s.setActiveStore);
  const alerts = useAlertStore((s) => s.alerts);
  const acknowledge = useAlertStore((s) => s.acknowledge);
  const commandOpen = useUIStore((s) => s.commandOpen);
  const setCommandOpen = useUIStore((s) => s.setCommandOpen);
  const openMachineDrawer = useUIStore((s) => s.openMachineDrawer);
  const toggleMobileSidebar = useUIStore((s) => s.toggleMobileSidebar);
  const me = useAccessStore();
  const tRole = useTranslations("Roles");

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(!commandOpen);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commandOpen, setCommandOpen]);

  const activeStore = stores.find((s) => s.id === activeStoreId);
  const activeAlerts = alerts.filter((a) => a.status === "active").slice(0, 8);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-card/70 px-3 backdrop-blur-sm sm:gap-4 sm:px-4">
      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
        <Button variant="ghost" size="icon-sm" className="shrink-0 md:hidden" onClick={toggleMobileSidebar}>
          <Menu className="h-4 w-4" />
        </Button>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Radio className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold tracking-wide text-foreground">{t("title")}</p>
          <p className="hidden truncate text-[10px] text-muted-foreground sm:block">{t("subtitle")}</p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-end gap-1.5 sm:gap-2">
        <Button
          variant="outline"
          size="sm"
          className="w-9 shrink-0 justify-center gap-2 px-0 text-muted-foreground sm:w-48 sm:justify-start sm:px-3 lg:w-64"
          onClick={() => setCommandOpen(true)}
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden flex-1 text-left sm:inline">{t("searchPlaceholder")}</span>
          <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] lg:inline">Ctrl K</kbd>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 px-2 sm:gap-2 sm:px-3">
              <StoreIcon className="h-3.5 w-3.5 shrink-0 sm:hidden" />
              <span className="hidden max-w-[140px] truncate sm:inline">{activeStore?.name ?? t("selectStore")}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>{t("switchStore")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {stores.map((store) => (
              <DropdownMenuItem key={store.id} onClick={() => setActiveStore(store.id)} className="justify-between">
                <span className="truncate">{store.name}</span>
                {store.id === activeStoreId && <Check className="h-3.5 w-3.5 text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="relative">
              <Bell className="h-4 w-4" />
              {activeAlerts.length > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-alarm px-1 text-[10px] font-semibold text-white">
                  {activeAlerts.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <p className="text-sm font-medium">{t("notifications")}</p>
              <span className="text-xs text-muted-foreground">{t("activeCount", { count: activeAlerts.length })}</span>
            </div>
            <ScrollArea className="h-72">
              <div className="flex flex-col divide-y divide-border">
                {activeAlerts.length === 0 && (
                  <p className="p-4 text-center text-sm text-muted-foreground">{t("noActiveAlerts")}</p>
                )}
                {activeAlerts.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      acknowledge(a.id);
                      openMachineDrawer(a.machineId);
                    }}
                    className="flex w-full flex-col gap-1 px-3 py-2.5 text-left text-xs hover:bg-muted/50"
                  >
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      <StatusDot status={a.severity === "critical" ? "alarm" : "warning"} />
                      {a.message}
                    </span>
                    <span className="text-muted-foreground">{new Date(a.createdAt).toLocaleString(locale)}</span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>

        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            setDarkMode((v) => !v);
            toast.info(t("themeToggleToast"));
          }}
        >
          {darkMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className={cn("rounded-full bg-muted/60")}>
              <User className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="space-y-0.5">
              <span className="block truncate">{me.name ?? t("userMenu.opsAdmin")}</span>
              {me.role && <span className="block text-xs font-normal text-muted-foreground">{tRole(me.role)}</span>}
              {Object.entries(me.stores).map(([id, r]) => (
                <span key={id} className="block truncate text-xs font-normal text-muted-foreground">
                  {tRole("atStore", { role: tRole(r), store: stores.find((s) => s.id === id)?.name ?? id })}
                </span>
              ))}
            </DropdownMenuLabel>
            {me.devRoleSwitch && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">{tRole("devSwitch")}</DropdownMenuLabel>
                {ROLES.map((r) => (
                  <DropdownMenuItem key={r} onSelect={() => me.setDevRole(r)} className="text-xs">
                    {!me.devAs && me.role === r ? <Check className="h-3.5 w-3.5" /> : <span className="w-3.5" />}
                    {tRole(r)}
                  </DropdownMenuItem>
                ))}
                <DevViewAs current={me.devAs} onPick={me.setDevAs} />
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem>{t("userMenu.profile")}</DropdownMenuItem>
            <DropdownMenuItem>{t("userMenu.team")}</DropdownMenuItem>
            <DropdownMenuItem>{t("userMenu.apiKeys")}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-status-alarm">{t("userMenu.signOut")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <SearchCommand open={commandOpen} onOpenChange={setCommandOpen} />
    </header>
  );
}

/** Local dev: act as a user from the roles table, with their per-store grants. */
function DevViewAs({ current, onPick }: { current: string | null; onPick: (userId: string | null) => void }) {
  const tRole = useTranslations("Roles");
  const [users, setUsers] = useState<{ userId: string; role: string | null; stores: Record<string, string> }[] | null>(null);
  useEffect(() => {
    fetch("/api/control-center/dev/grants")
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d: { users: typeof users }) => setUsers(d.users ?? []))
      .catch(() => setUsers([]));
  }, []);
  if (!users?.length && !current) return null;
  return (
    <>
      <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">{tRole("devViewAs")}</DropdownMenuLabel>
      {(users ?? []).map((u) => (
        <DropdownMenuItem key={u.userId} onSelect={() => onPick(u.userId)} className="text-xs">
          {current === u.userId ? <Check className="h-3.5 w-3.5" /> : <span className="w-3.5" />}
          <span className="truncate">{u.userId}</span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {[u.role ? tRole(u.role) : null, Object.keys(u.stores).length ? tRole("storeGrantsCount", { count: Object.keys(u.stores).length }) : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </DropdownMenuItem>
      ))}
      {current && (
        <DropdownMenuItem onSelect={() => onPick(null)} className="text-xs">
          <span className="w-3.5" />
          {tRole("devBackToAdmin")}
        </DropdownMenuItem>
      )}
    </>
  );
}
