"use client";

import { useState } from "react";
import { Palette } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsSection, SettingsRow } from "./SettingsSection";

export function AppearanceSettingsForm() {
  const [language, setLanguage] = useState("zh-TW");
  const [theme, setTheme] = useState("dark");

  return (
    <SettingsSection
      title="Appearance"
      description="Language and theme preferences"
      icon={Palette}
      actions={
        <Button size="sm" variant="outline" onClick={() => toast.success("Appearance preferences saved")}>
          Save
        </Button>
      }
    >
      <SettingsRow label="Language">
        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="zh-TW">繁體中文</SelectItem>
            <SelectItem value="en-US">English</SelectItem>
            <SelectItem value="ja-JP">日本語</SelectItem>
          </SelectContent>
        </Select>
      </SettingsRow>
      <SettingsRow label="Theme" description="Monitoring centers run dark-only in this prototype">
        <Select value={theme} onValueChange={setTheme}>
          <SelectTrigger className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dark">Dark</SelectItem>
            <SelectItem value="light">Light (coming soon)</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>
      </SettingsRow>
    </SettingsSection>
  );
}
