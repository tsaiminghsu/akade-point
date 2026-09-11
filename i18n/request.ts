import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, SUPPORTED_LOCALES } from "@/lib/control-center/constants";
import type { ControlCenterLocale } from "@/lib/control-center/types";

function resolveLocale(): ControlCenterLocale {
  const value = cookies().get(LOCALE_COOKIE_NAME)?.value;
  return (SUPPORTED_LOCALES as string[]).includes(value ?? "")
    ? (value as ControlCenterLocale)
    : DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const locale = resolveLocale();
  return {
    locale,
    messages: (await import(`../messages/control-center/${locale}.json`)).default,
  };
});
