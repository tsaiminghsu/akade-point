import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

import { currentActor } from "@/lib/access-server";
import { requireSession } from "@/lib/session";
import { ControlCenterShell } from "@/components/control-center/shell/ControlCenterShell";

export const metadata: Metadata = {
  title: { template: "%s | IoT Control Center", default: "IoT Control Center" },
  description: "Enterprise IoT Control Center — real-time device monitoring & floor-plan editor",
};

async function renderShell(children: React.ReactNode) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ControlCenterShell>{children}</ControlCenterShell>
    </NextIntlClientProvider>
  );
}

export default async function ControlCenterLayout({ children }: { children: React.ReactNode }) {
  // Local dev only: skip the login/admin check so the Control Center prototype
  // doesn't require a LINE login + manual isAdmin grant on every dev machine.
  // Production (Amplify) always enforces the check below.
  if (process.env.NODE_ENV !== "production") {
    return renderShell(children);
  }

  if (!(await requireSession())) redirect("/login");
  // Any Control Center role gets in (akade-users.isAdmin counts as system-admin);
  // what each role may do is enforced per API route.
  if (!(await currentActor())) redirect("/");

  return renderShell(children);
}
