"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
    >
      登出
    </button>
  );
}
