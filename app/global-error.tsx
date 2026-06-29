'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="zh-TW">
      <body>
        <main className="min-h-dvh bg-slate-950 text-white flex items-center justify-center px-6">
          <div className="max-w-sm text-center">
            <h1 className="text-2xl font-bold mb-3">系統載入失敗</h1>
            <p className="text-sm text-white/60 mb-5">{error.message || '請重新整理後再試一次。'}</p>
            <button
              type="button"
              onClick={reset}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black"
            >
              重新載入
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
