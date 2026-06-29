"use client";

import { ArrowDown, ArrowRight, Crosshair, Layers, MoveRight, ScanLine, Wind } from "lucide-react";

const stations = [
  {
    title: "1. 剝離",
    subtitle: "刮刮膜卷料",
    detail: "背紙繞過剝離板急轉，刮刮膜前緣翹起，停在取膜位置。",
  },
  {
    title: "2. 吸取",
    subtitle: "真空吸膜頭",
    detail: "矽膠吸嘴下降接觸膜面，開真空後抬起，避免手碰膠面。",
  },
  {
    title: "3. 定位",
    subtitle: "卡片治具",
    detail: "刮刮卡靠 L 型定位角，吸膜頭移到刮刮區中心。",
  },
  {
    title: "4. 貼附",
    subtitle: "下壓貼合",
    detail: "吸頭下壓、破真空放膜，再用軟壓輪或刮板壓實邊緣。",
  },
];

export function ScratchFilmApplicatorGuide() {
  return (
    <section className="mt-8 overflow-hidden rounded-2xl bg-slate-950 text-white shadow-xl">
      <div className="grid gap-6 p-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-amber-300">
            Scratch Film Applicator
          </p>
          <h2 className="mt-1 text-2xl font-black leading-tight text-white">
            刮刮膜剝離、吸取、定位、貼附示意
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            套用貼標機的剝離板與真空取放概念：先把刮刮膜從背紙分離，再由吸膜頭搬運到刮刮卡的定位治具上，最後下壓貼合。
          </p>
        </div>

        <div className="grid gap-2 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm">
          <div className="flex items-center gap-2 font-bold text-amber-200">
            <Crosshair size={18} />
            對位基準
          </div>
          <p className="leading-6 text-slate-200">
            建議把卡片刮刮區中心、吸嘴中心、剝離膜中心設成同一條 X 軸；Y 軸用卡片治具前擋塊決定。
          </p>
        </div>
      </div>

      <div className="border-y border-white/10 bg-white/[0.03] p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
          {stations.map((station, index) => (
            <div key={station.title} className="contents">
              <div className="rounded-xl border border-white/10 bg-white/[0.06] p-4">
                <p className="text-sm font-black text-white">{station.title}</p>
                <p className="mt-1 text-xs font-bold text-amber-300">{station.subtitle}</p>
                <p className="mt-2 text-xs leading-5 text-slate-300">{station.detail}</p>
              </div>
              {index < stations.length - 1 && (
                <div className="hidden items-center justify-center text-amber-300 lg:flex">
                  <ArrowRight size={28} strokeWidth={2.6} />
                </div>
              )}
              {index < stations.length - 1 && (
                <div className="flex items-center justify-center text-amber-300 lg:hidden">
                  <ArrowDown size={24} strokeWidth={2.6} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 p-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-2xl border border-white/10 bg-slate-900 p-4">
          <div className="relative mx-auto h-[360px] max-w-4xl overflow-hidden rounded-xl bg-slate-100 text-slate-950">
            <div className="absolute left-6 top-7 h-28 w-28 rounded-full border-[14px] border-slate-500 bg-white shadow-inner" />
            <div className="absolute left-[126px] top-[94px] h-8 w-52 rounded bg-slate-300" />
            <div className="absolute left-[292px] top-[72px] h-28 w-3 rotate-[18deg] rounded bg-slate-700" />
            <div className="absolute left-[318px] top-[86px] h-10 w-28 rounded border-2 border-dashed border-slate-500 bg-slate-200" />
            <div className="absolute left-[330px] top-[97px] h-5 w-20 rounded bg-neutral-400" />

            <div className="absolute left-[432px] top-[35px] flex w-28 flex-col items-center">
              <div className="h-16 w-8 rounded-t-lg bg-blue-600" />
              <div className="h-7 w-16 rounded-full border-2 border-blue-900 bg-sky-200 shadow" />
              <div className="mt-1 h-7 w-20 rounded border border-dashed border-slate-400 bg-neutral-300" />
            </div>

            <div className="absolute left-[585px] top-[208px] h-[128px] w-56 rounded-xl border-4 border-slate-700 bg-white shadow-md">
              <div className="absolute left-5 top-5 h-6 w-28 rounded bg-slate-900" />
              <div className="absolute left-5 top-20 h-28 w-44 rounded-lg border-2 border-dashed border-red-500 bg-red-100" />
              <div className="absolute bottom-5 left-5 h-5 w-36 rounded bg-slate-200" />
            </div>

            <div className="absolute left-[578px] top-[194px] h-3 w-20 rounded bg-slate-700" />
            <div className="absolute left-[568px] top-[204px] h-20 w-3 rounded bg-slate-700" />
            <div className="absolute left-[807px] top-[194px] h-3 w-20 rounded bg-slate-700" />
            <div className="absolute left-[879px] top-[204px] h-20 w-3 rounded bg-slate-700" />

            <div className="absolute left-[190px] top-[155px] flex items-center gap-2 rounded-full bg-slate-950 px-3 py-1 text-xs font-bold text-white">
              <Layers size={14} />
              背紙回收
            </div>
            <div className="absolute left-[410px] top-[128px] flex items-center gap-2 rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
              <Wind size={14} />
              開真空吸膜
            </div>
            <div className="absolute left-[650px] top-[166px] flex items-center gap-2 rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white">
              <Crosshair size={14} />
              對準刮刮區
            </div>
            <div className="absolute left-[650px] top-[300px] flex items-center gap-2 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white">
              <ScanLine size={14} />
              下壓貼合
            </div>

            <div className="absolute left-[525px] top-[96px] text-blue-700">
              <MoveRight size={62} strokeWidth={2.5} />
            </div>
            <div className="absolute left-[501px] top-[145px] h-24 w-1 rounded bg-blue-600" />
            <div className="absolute left-[493px] top-[222px] h-0 w-0 border-l-[9px] border-r-[9px] border-t-[14px] border-l-transparent border-r-transparent border-t-blue-600" />
          </div>
        </div>

        <div className="grid content-start gap-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.06] p-4">
            <p className="font-black text-white">機構配置</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              左側放刮刮膜卷料與背紙回收輪，中段放剝離板與真空吸膜頭，右側放卡片定位治具。吸膜頭只需要 X/Z 兩軸即可完成半自動貼膜。
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.06] p-4">
            <p className="font-black text-white">貼附順序</p>
            <ol className="mt-2 space-y-2 text-sm leading-6 text-slate-300">
              <li>1. 感測刮刮膜前緣到達剝離板出口。</li>
              <li>2. 吸嘴下降，真空壓力到位後抬起。</li>
              <li>3. 移到卡片治具定位點，Z 軸慢速下降。</li>
              <li>4. 破真空放膜，壓輪由中心往外壓平。</li>
            </ol>
          </div>
          <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-4">
            <p className="font-black text-red-200">製作注意</p>
            <p className="mt-2 text-sm leading-6 text-slate-200">
              吸嘴不要碰到刮刮膜膠邊；剝離板出口到吸嘴中心要固定距離；卡片治具需留 0.3-0.5 mm 微調間隙，方便修正印刷誤差。
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
