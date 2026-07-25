import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";

interface ControlCenterComingSoonProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
}

export function ControlCenterComingSoon({ title, description, icon: Icon = Construction }: ControlCenterComingSoonProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-10 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-8 w-8" />
      </span>
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {description ?? "此模組正在規劃中，將於未來版本推出。"}
        </p>
      </div>
    </div>
  );
}
