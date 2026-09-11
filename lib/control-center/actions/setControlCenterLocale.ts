"use server";

import { cookies } from "next/headers";

import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, SUPPORTED_LOCALES } from "@/lib/control-center/constants";
import type { ControlCenterLocale } from "@/lib/control-center/types";

export async function setControlCenterLocale(locale: ControlCenterLocale) {
  const safeLocale = (SUPPORTED_LOCALES as string[]).includes(locale) ? locale : DEFAULT_LOCALE;
  cookies().set(LOCALE_COOKIE_NAME, safeLocale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
