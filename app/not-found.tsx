import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="min-h-dvh bg-slate-950 text-white flex items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <h1 className="text-2xl font-bold mb-3">找不到頁面</h1>
        <p className="text-sm text-white/60 mb-5">這個網址沒有對應的頁面。</p>
        <Link href="/da-nu-shen" className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black">
          回到大怒神
        </Link>
      </div>
    </main>
  )
}
