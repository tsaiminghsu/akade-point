import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

import { authOptions } from "@/lib/auth";
import { getUser } from "@/lib/dynamo/users";
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

  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const userId = (session.user as { id: string }).id;
  const user = await getUser(userId);
  if (!user?.isAdmin) redirect("/");

  return renderShell(children);
}
