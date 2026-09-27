"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

// Sign-in is LINE-only because the Control Center authorises against the
// shared akade-users table, where isAdmin is granted per LINE user id
// (see scripts/set-admin.mjs).
export default function LoginPage() {
  const [loading, setLoading] = useState(false);

  const handleLineSignIn = async () => {
    setLoading(true);
    await signIn("line", { callbackUrl: "/iot-control-center", redirect: true });
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[hsl(224,50%,5%)] px-4">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 80% 60% at 15% 0%, hsl(199 89% 48% / 0.10) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 100% 30%, hsl(189 94% 43% / 0.08) 0%, transparent 60%)",
        }}
      />

      <div className="cc-glass cc-card w-full max-w-sm space-y-8 p-8 text-center">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400">
            Enterprise
          </p>
          <h1 className="text-2xl font-bold text-zinc-100">IoT Control Center</h1>
          <p className="text-sm text-zinc-400">
            Sign in to monitor machines, edit floor plans and review alerts.
          </p>
        </div>

        <button
          onClick={handleLineSignIn}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00B900] px-6 py-3 font-bold text-white transition-all hover:bg-[#00a000] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <>
              <span className="spinner spinner-sm" />
              <span>Signing in…</span>
            </>
          ) : (
            <span>Sign in with LINE</span>
          )}
        </button>

        <p className="text-xs leading-relaxed text-zinc-500">
          Access requires an administrator account. If you sign in and land back
          here, ask an existing admin to grant your account access.
        </p>
      </div>
    </main>
  );
}
