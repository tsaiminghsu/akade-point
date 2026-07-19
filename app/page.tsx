"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Providers } from "./providers";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  Gamepad2,
  ChevronLeft,
  ChevronRight,
  Volume2,
  Sparkles,
  ArrowRight,
  Award,
} from "lucide-react";

// Carousel banners data
const BANNERS = [
  {
    id: 1,
    title: "第一彈：創世核心",
    subtitle: "機器人宇宙紀元開啟",
    description: "經典五大星際機器人卡牌限時登場！探索者一號、星際分析器等核心戰力現已集結",
    image: "/genesis_core_banner.png",
    accentColor: "from-blue-500/20 to-purple-600/20",
    glowColor: "rgba(59,130,246,0.3)",
    tag: "活動進行中",
    link: "/collection?series=1"
  },
  {
    id: 3,
    title: "消除浮石對抗賽",
    subtitle: "五屬性符石消除，引爆最高連擊",
    description: "立即點擊進入對戰！消除火、水、木、光、暗及心靈符石，測試你的戰隊傷害增幅極限，立即挑戰排行榜！",
    image: "/battle_arena_banner.png",
    accentColor: "from-amber-500/20 to-red-600/20",
    glowColor: "rgba(245,158,11,0.3)",
    tag: "特色玩法",
    link: "/games/test-game"
  }
];

// Spotlight featured cards
const FEATURED_CARDS = [
  {
    id: "001",
    name: "探索者一號",
    series: "Series 1",
    rarity: "N",
    element: "FIRE",
    elementIcon: "🔥",
    passive: "火屬性傷害增幅 +5%",
    desc: "配備基本推進器的初級探測器，負責蒐集行星礦物樣本與大氣數據。",
    color: "from-zinc-800/50 to-zinc-950",
    borderColor: "border-zinc-500/40 hover:border-zinc-400"
  },
  {
    id: "003",
    name: "守護者三號",
    series: "Series 1",
    rarity: "R",
    element: "WOOD",
    elementIcon: "🌿",
    passive: "木屬性傷害增幅 +10%",
    desc: "森林防護型自動機兵，配備能量防護罩與有機體修復單元。",
    color: "from-emerald-950/50 to-zinc-950",
    borderColor: "border-emerald-500/40 hover:border-emerald-400"
  },
  {
    id: "005",
    name: "星際機器人",
    series: "Series 1",
    rarity: "SR",
    element: "DARK",
    elementIcon: "🌑",
    passive: "暗屬性傷害增幅 +20%",
    desc: "配備超空間引力護盾，操控暗能量的重型突擊機甲。",
    color: "from-purple-900/50 to-zinc-950",
    borderColor: "border-purple-500/40 hover:border-purple-400"
  },
  {
    id: "006",
    name: "機器人之王",
    series: "Series 1",
    rarity: "SSR",
    element: "DARK",
    elementIcon: "👑",
    passive: "暗屬性增幅 +30%",
    desc: "掌控機械核心的宇宙主宰，融合了創世核心最強大能量源的傳奇機型。",
    color: "from-amber-950/50 to-zinc-950",
    borderColor: "border-amber-500/60 hover:border-amber-400"
  }
];

// News Bulletin Data
const NEWS_ITEMS = [
  { category: "公告", date: "2026-06-21", title: "機器人宇宙圖鑑系統更新，新增第二、三、四彈卡牌預覽及被動技能" },
  { category: "活動", date: "2026-06-20", title: "第一彈【創世核心】實體閃卡套組正式發售！掃碼登陸即可收藏" },
  { category: "公告", date: "2026-06-19", title: "戰隊模擬戰追加「量子主宰」與「時間擾動」卡牌測試增益" },
  { category: "系統", date: "2026-06-17", title: "修復 LINE 快速登入在部分 iOS 版本瀏覽器重定向迴圈問題" },
  { category: "活動", date: "2026-06-15", title: "第二彈【星海啟航】將於 2026 年第 3 季度開啟，敬請期待" },
  { category: "公告", date: "2026-06-12", title: "點數加成與實體 QR-code 集卡規則詳細說明，快來兌換大禮" }
];

function HomePageContent() {
  const { data: session, status } = useSession();
  const [activeSlide, setActiveSlide] = useState(0);
  const [activeNewsTab, setActiveNewsTab] = useState("全部");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [clickedOrbIndex, setClickedOrbIndex] = useState<number | null>(null);
  const [demoCombos, setDemoCombos] = useState(0);
  const [demoDamage, setDemoDamage] = useState(0);

  const [profile, setProfile] = useState<any>(null);
  const [collectionStatus, setCollectionStatus] = useState<any>(null);
  const [isLoadingUserData, setIsLoadingUserData] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      setIsLoadingUserData(true);
      Promise.all([
        fetch("/api/user/profile").then(r => r.json()),
        fetch("/api/collection").then(r => r.json())
      ]).then(([pData, cData]) => {
        if (pData?.profile) setProfile(pData.profile);
        if (cData) setCollectionStatus(cData);
      }).catch(err => {
        console.error("Failed to load dashboard data:", err);
      }).finally(() => {
        setIsLoadingUserData(false);
      });
    }
  }, [status]);

  // Auto rotate banners every 6 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % BANNERS.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const nextBanner = () => {
    setActiveSlide((prev) => (prev + 1) % BANNERS.length);
  };

  const prevBanner = () => {
    setActiveSlide((prev) => (prev - 1 + BANNERS.length) % BANNERS.length);
  };

  // Filtered News items
  const filteredNews = activeNewsTab === "全部"
    ? NEWS_ITEMS
    : NEWS_ITEMS.filter(item => item.category === activeNewsTab);

  // Interactive demo orbs
  const DEMO_ORBS = [
    { type: "FIRE", icon: "🔥", color: "from-red-500 to-red-600 shadow-[0_0_12px_rgba(239,68,68,0.7)]" },
    { type: "WATER", icon: "💧", color: "from-blue-500 to-blue-600 shadow-[0_0_12px_rgba(59,130,246,0.7)]" },
    { type: "WOOD", icon: "🌿", color: "from-emerald-500 to-emerald-600 shadow-[0_0_12px_rgba(16,185,129,0.7)]" },
    { type: "LIGHT", icon: "✨", color: "from-yellow-400 to-yellow-500 shadow-[0_0_12px_rgba(250,204,21,0.7)]" },
    { type: "DARK", icon: "🌑", color: "from-purple-500 to-purple-600 shadow-[0_0_12px_rgba(147,51,234,0.7)]" },
    { type: "RECOVERY", icon: "💗", color: "from-pink-400 to-pink-500 shadow-[0_0_12px_rgba(244,114,182,0.7)]" },
    { type: "FIRE", icon: "🔥", color: "from-red-500 to-red-600 shadow-[0_0_12px_rgba(239,68,68,0.7)]" },
    { type: "LIGHT", icon: "✨", color: "from-yellow-400 to-yellow-500 shadow-[0_0_12px_rgba(250,204,21,0.7)]" },
    { type: "WATER", icon: "💧", color: "from-blue-500 to-blue-600 shadow-[0_0_12px_rgba(59,130,246,0.7)]" },
  ];

  const handleOrbClick = (idx: number) => {
    setClickedOrbIndex(idx);
    const bonusCombo = Math.floor(Math.random() * 2) + 1;
    setDemoCombos(prev => prev + bonusCombo);
    setDemoDamage(prev => prev + bonusCombo * (Math.floor(Math.random() * 2000) + 1500));

    setTimeout(() => {
      setClickedOrbIndex(null);
    }, 400);
  };

  const resetDemo = () => {
    setDemoCombos(0);
    setDemoDamage(0);
  };

  return (
    <div className="min-h-screen bg-[#070b13] text-zinc-100 flex flex-col font-sans overflow-x-hidden selection:bg-amber-500/30 selection:text-amber-400">

      {/* BACKGROUND SCI-FI DECORATION */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-950/15 via-[#070b13] to-[#070b13] pointer-events-none -z-20" />
      <div className="absolute top-0 inset-x-0 h-[600px] bg-[linear-gradient(to_bottom,_rgba(99,102,241,0.02)_0%,_transparent_100%)] pointer-events-none -z-20" />

      {/* 1. STICKY GLASSMORPHIC HEADER */}
      <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-[#070b13]/80 backdrop-blur-md transition-all duration-300">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">

          {/* Logo Brand */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="relative w-10 h-10 drop-shadow-[0_0_10px_rgba(245,158,11,0.4)] transition-transform duration-300 group-hover:scale-105">
              <Image
                src="/logo.png"
                alt="Logo"
                fill
                className="object-contain"
                priority
              />
            </div>
            <div className="flex flex-col">
              <span className="font-black text-lg tracking-wider bg-gradient-to-r from-amber-400 to-yellow-200 bg-clip-text text-transparent uppercase font-mono">
                Akade Point
              </span>
              <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest leading-none">
                Robot Universe
              </span>
            </div>
          </Link>

          {/* Desktop Nav Items */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold">
            <Link href="/" className="text-zinc-400 hover:text-zinc-100 transition-colors">
              首頁
            </Link>
            <Link href="/collection" className="text-zinc-400 hover:text-zinc-100 transition-colors flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5" /> 宇宙圖鑑
            </Link>
            <Link href="/games" className="text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1">
              <Gamepad2 className="w-3.5 h-3.5" /> 遊戲大廳
            </Link>
            <Link href="/leaderboard" className="text-zinc-400 hover:text-zinc-100 transition-colors flex items-center gap-1">
              <Award className="w-3.5 h-3.5" /> 排行榜
            </Link>
          </nav>

          {/* User auth panel / CTA */}
          <div className="hidden md:flex items-center gap-4">
            {status === "loading" ? (
              <span className="w-4 h-4 rounded-full border border-amber-500/30 border-t-amber-400 animate-spin" />
            ) : session ? (
              <div className="flex items-center gap-3 bg-white/5 border border-white/5 pl-2.5 pr-3 py-1.5 rounded-full">
                {session.user?.image ? (
                  <div className="relative w-6 h-6 rounded-full overflow-hidden border border-amber-500/20">
                    <Image
                      src={session.user.image}
                      alt="avatar"
                      fill
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-[10px]">
                    👤
                  </div>
                )}
                <span className="text-xs text-zinc-300 font-bold max-w-[80px] truncate">
                  {session.user?.name}
                </span>
                <Link
                  href="/dashboard"
                  className="px-3 py-1 text-[11px] bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-extrabold rounded-full transition-transform hover:scale-[1.02] shadow-[0_2px_8px_rgba(245,158,11,0.2)]"
                >
                  進入控制台
                </Link>
              </div>
            ) : (
              <Link
                href="/login"
                className="px-5 py-2 text-xs bg-[#00B900] hover:bg-[#00a000] text-white font-extrabold rounded-xl transition-all shadow-[0_3px_12px_rgba(0,185,0,0.2)] hover:scale-[1.02] flex items-center gap-1.5"
              >
                <span>LINE 登入開始集卡</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>

          {/* Mobile menu trigger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 rounded-lg bg-white/5 border border-white/5 text-zinc-300 hover:text-white"
          >
            <span className="text-lg">☰</span>
          </button>

        </div>
      </header>

      {/* Mobile menu overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="md:hidden fixed top-16 inset-x-0 bg-[#070b13] border-b border-white/10 z-40 px-6 py-5 flex flex-col gap-4 text-sm font-bold shadow-2xl"
          >
            <Link
              href="/"
              onClick={() => setMobileMenuOpen(false)}
              className="text-zinc-300 hover:text-white py-1.5 border-b border-white/5 flex items-center gap-2"
            >
              🌌 活動首頁
            </Link>
            <Link
              href="/collection"
              onClick={() => setMobileMenuOpen(false)}
              className="text-zinc-300 hover:text-white py-1.5 border-b border-white/5 flex items-center gap-2"
            >
              <BookOpen className="w-4 h-4" /> 宇宙圖鑑
            </Link>
            <Link
              href="/games"
              onClick={() => setMobileMenuOpen(false)}
              className="text-amber-400 py-1.5 border-b border-white/5 flex items-center gap-2"
            >
              <Gamepad2 className="w-4 h-4" /> 遊戲大廳
            </Link>
            <Link
              href="/leaderboard"
              onClick={() => setMobileMenuOpen(false)}
              className="text-zinc-300 hover:text-white py-1.5 border-b border-white/5 flex items-center gap-2"
            >
              <Award className="w-4 h-4" /> 排行榜
            </Link>

            <div className="pt-2">
              {session ? (
                <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                  <div className="flex items-center gap-2">
                    {session.user?.image && (
                      <div className="relative w-8 h-8 rounded-full overflow-hidden">
                        <Image src={session.user.image} alt="avatar" fill className="object-cover" />
                      </div>
                    )}
                    <span className="text-zinc-200 text-sm font-black">{session.user?.name}</span>
                  </div>
                  <Link
                    href="/dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-extrabold text-xs rounded-lg"
                  >
                    控制台
                  </Link>
                </div>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block text-center py-3 bg-[#00B900] text-white font-extrabold rounded-xl"
                >
                  LINE 快速登入
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. DYNAMIC HERO CAROUSEL (活動輪播圖) */}
      <section className="relative w-full h-[320px] md:h-[480px] bg-black overflow-hidden group/slider border-b border-white/5">

        {/* Carousel Slides */}
        <div className="w-full h-full relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSlide}
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              className="absolute inset-0 w-full h-full"
            >
              {/* Slide image */}
              <div className="relative w-full h-full">
                <Image
                  src={BANNERS[activeSlide].image}
                  alt={BANNERS[activeSlide].title}
                  fill
                  className="object-cover object-center brightness-[0.65] saturate-[1.1] transition-transform duration-700 hover:scale-105"
                  priority
                />
              </div>

              {/* Shadow Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#070b13] via-[#070b13]/40 to-transparent" />
              <div className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-[#070b13]/80 to-transparent hidden md:block" />

              {/* Slide Info Content */}
              <div className="absolute inset-0 flex flex-col justify-end p-6 md:p-12 max-w-6xl mx-auto z-10 text-left">
                <div className="max-w-xl space-y-2 md:space-y-4">

                  {/* Tag badge */}
                  <span className="inline-block px-3 py-1 bg-amber-500 text-black text-[9px] font-black rounded-full uppercase tracking-wider shadow-[0_0_12px_rgba(245,158,11,0.4)] animate-pulse">
                    {BANNERS[activeSlide].tag}
                  </span>

                  {/* Title & Subtitle */}
                  <div className="space-y-1">
                    <h2 className="text-2xl md:text-5xl font-black tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] font-sans">
                      {BANNERS[activeSlide].title}
                    </h2>
                    <p className="text-xs md:text-lg font-bold text-amber-400 font-mono">
                      {BANNERS[activeSlide].subtitle}
                    </p>
                  </div>

                  {/* Description */}
                  <p className="text-zinc-300 text-xs md:text-sm leading-relaxed max-w-lg hidden sm:block drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
                    {BANNERS[activeSlide].description}
                  </p>

                  {/* Action CTA */}
                  <div className="pt-1 flex gap-3">
                    <Link
                      href={BANNERS[activeSlide].link}
                      className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-black font-black text-xs md:text-sm rounded-xl transition-all shadow-[0_4px_15px_rgba(245,158,11,0.3)] hover:scale-[1.03] flex items-center gap-1.5"
                    >
                      <span>前往體驗</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>

                    {BANNERS[activeSlide].id !== 3 && (
                      <Link
                        href="/games/test-game"
                        className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 font-bold text-xs md:text-sm rounded-xl transition-colors hidden sm:block"
                      >
                        小隊模擬戰
                      </Link>
                    )}
                  </div>

                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Carousel Left/Right navigation arrows */}
        <button
          onClick={prevBanner}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 border border-white/5 text-white flex items-center justify-center hover:bg-black/60 opacity-0 group-hover/slider:opacity-100 transition-opacity z-20"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={nextBanner}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 border border-white/5 text-white flex items-center justify-center hover:bg-black/60 opacity-0 group-hover/slider:opacity-100 transition-opacity z-20"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Carousel indicators dots */}
        <div className="absolute bottom-4 inset-x-0 flex justify-center gap-2 z-20">
          {BANNERS.map((banner, index) => (
            <button
              key={banner.id}
              onClick={() => setActiveSlide(index)}
              className={`h-1.5 rounded-full transition-all duration-300 ${activeSlide === index ? "w-6 bg-amber-400" : "w-1.5 bg-white/30"}`}
            />
          ))}
        </div>

      </section>

      {/* 2.3 PRODUCT HERO SECTION */}
      <section className="w-full max-w-6xl mx-auto px-4 md:px-6 pt-10 pb-2">
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-8 md:p-10 text-center space-y-6">
          <div className="space-y-3 max-w-xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight bg-gradient-to-r from-amber-400 to-yellow-200 bg-clip-text text-transparent">
              機器人收藏宇宙
            </h2>
            <p className="text-zinc-400 text-sm leading-relaxed">
              掃描實體卡牌 QR Code，獲得點數、解鎖收藏，並在符石消除對戰中挑戰排行榜
            </p>
          </div>

          {/* Flow steps */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-0 text-xs font-bold">
            {[
              { icon: "📸", label: "掃描卡牌" },
              { icon: "⭐", label: "獲得點數" },
              { icon: "🗂️", label: "解鎖收藏" },
              { icon: "🎮", label: "挑戰遊戲" },
            ].map((step, i) => (
              <div key={step.label} className="flex items-center gap-2 sm:gap-0">
                <div className="flex flex-col items-center gap-1 px-4 sm:px-6">
                  <span className="text-2xl">{step.icon}</span>
                  <span className="text-zinc-300">{step.label}</span>
                </div>
                {i < 3 && (
                  <span className="text-zinc-600 text-lg rotate-90 sm:rotate-0">→</span>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link
              href="/scan"
              className="px-6 py-3 bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-black text-sm rounded-xl shadow-[0_4px_15px_rgba(245,158,11,0.3)] hover:scale-[1.02] transition-transform"
            >
              📸 開始掃描卡牌
            </Link>
            <Link
              href="/games"
              className="px-6 py-3 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 font-bold text-sm rounded-xl transition-colors"
            >
              🎮 遊戲大廳
            </Link>
          </div>
        </div>
      </section>

      {/* 2.5 PERSONAL USER DASHBOARD WIDGET (ONLY SHOWN WHEN LOGGED IN) */}
      {status === "authenticated" && (
        <section className="w-full max-w-6xl mx-auto px-4 md:px-6 pt-8">
          <div className="bg-gradient-to-r from-amber-500/10 via-purple-500/5 to-blue-500/10 border border-white/10 rounded-3xl p-6 relative overflow-hidden backdrop-blur-md shadow-2xl">
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-amber-500/5 to-transparent blur-3xl pointer-events-none -z-10" />

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-2xl shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                  🤖
                </div>
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-1.5">
                    {profile?.displayName ?? session?.user?.name ?? "星際收藏家"}
                    <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/25 text-amber-400 text-[9px] font-black rounded-full uppercase tracking-wider">
                      宇宙探險員
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400 font-medium">個人收藏儀表板 · 實時數據更新</p>
                </div>
              </div>

              {/* Stats */}
              <div className="flex gap-4">
                <div className="bg-white/5 border border-white/5 px-4 py-2.5 rounded-2xl flex flex-col justify-center min-w-[100px] text-center">
                  <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-0.5">🌟 累積點數</span>
                  <span className="text-lg font-black text-amber-400 font-mono">
                    {isLoadingUserData ? "---" : (profile?.totalPoints ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="bg-white/5 border border-white/5 px-4 py-2.5 rounded-2xl flex flex-col justify-center min-w-[100px] text-center">
                  <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-0.5">🎟️ 抽獎券</span>
                  <span className="text-lg font-black text-purple-400 font-mono">
                    {isLoadingUserData ? "---" : (profile?.ticketCount ?? 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Middle Section: Collection Progress & Claimable Rewards */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-6">

              {/* Collection Tracker (Series 1) */}
              <div className="lg:col-span-7 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                    第一彈：創世核心 收集進度
                  </h4>
                  <span className="text-xs font-bold text-amber-400 font-mono">
                    {isLoadingUserData ? "載入中..." : `已收集 ${collectionStatus?.cards ? new Set(collectionStatus.cards.map((c: any) => c.cardNumber)).size : 0} / 5 種`}
                  </span>
                </div>

                <div className="flex gap-3 justify-start overflow-x-auto py-1">
                  {["001", "002", "003", "004", "005"].map((num) => {
                    const ownedNumbers = new Set(collectionStatus?.cards?.map((c: any) => c.cardNumber) ?? []);
                    const isOwned = ownedNumbers.has(num);
                    const cardEmojis: Record<string, string> = {
                      "001": "🤖",
                      "002": "📊",
                      "003": "🛡️",
                      "004": "⚡",
                      "005": "🌌"
                    };
                    return (
                      <div
                        key={num}
                        className={`w-12 h-16 rounded-xl border-2 flex flex-col items-center justify-center text-xl transition-all relative shrink-0 ${isOwned
                          ? "border-amber-500/50 bg-amber-500/10 shadow-[0_0_10px_rgba(245,158,11,0.15)]"
                          : "border-white/5 bg-white/5 opacity-40 grayscale"
                          }`}
                      >
                        <span>{isOwned ? cardEmojis[num] : "❓"}</span>
                        <span className="text-[8px] font-mono text-zinc-400 absolute bottom-1">{num}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Claimable Rewards */}
              <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
                  🎉 可領取收藏獎勵
                </h4>

                <div className="flex-1 flex flex-col justify-center gap-2">
                  {isLoadingUserData ? (
                    <div className="py-4 text-center text-xs text-zinc-500 animate-pulse">正在檢查獎勵資格...</div>
                  ) : collectionStatus?.eligibleTiers && collectionStatus.eligibleTiers.length > 0 ? (
                    collectionStatus.eligibleTiers.map((tier: string) => (
                      <Link
                        key={tier}
                        href={`/collection/claim/${tier}`}
                        className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/25 hover:bg-emerald-500/20 rounded-xl px-4 py-2.5 text-xs transition-all hover:scale-[1.01] shadow-[0_2px_8px_rgba(16,185,129,0.15)] group"
                      >
                        <span className="text-white font-extrabold flex items-center gap-1.5">
                          🎁 {tier === "SMALL" ? "探索小禮" : tier === "MEDIUM" ? "科學中禮" : tier === "LARGE" ? "領航大禮" : "SSR 傳說卡大獎"}
                        </span>
                        <span className="text-emerald-400 font-black group-hover:translate-x-1 transition-transform flex items-center gap-0.5">
                          點擊領取 <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </Link>
                    ))
                  ) : (
                    <div className="py-4 px-4 bg-white/[0.02] border border-white/5 rounded-xl text-center text-xs text-zinc-500 font-medium">
                      暫無可領取獎勵，繼續掃描 QR-code 登錄新卡牌吧！
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Inventory Section */}
            {profile?.inventory && profile.inventory.length > 0 && (
              <div className="mt-6 pt-5 border-t border-white/5 space-y-3">
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5 animate-pulse">
                  🎒 我的星際背包 (已獲得 {profile.inventory.length} 個盲盒戰利品)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-48 overflow-y-auto pr-1">
                  {profile.inventory.map((item: any) => {
                    const rarityColors: Record<string, string> = {
                      UR: "border-fuchsia-500/30 bg-fuchsia-500/5 text-fuchsia-400 shadow-[0_0_12px_rgba(217,70,239,0.1)]",
                      SSR: "border-amber-500/30 bg-amber-500/5 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.1)]",
                      SR: "border-purple-500/30 bg-purple-500/5 text-purple-400",
                      R: "border-blue-500/30 bg-blue-500/5 text-blue-400"
                    };
                    return (
                      <div 
                        key={item.itemId} 
                        className={`p-3 rounded-xl border flex flex-col justify-between text-xs space-y-1.5 transition-all hover:scale-[1.01] ${rarityColors[item.rarity] || "border-white/5 bg-white/5 text-zinc-300"}`}
                      >
                        <div className="flex justify-between items-center gap-2">
                          <span className="font-extrabold truncate">{item.name}</span>
                          <span className="text-[9px] font-black uppercase tracking-wider shrink-0">{item.rarity}</span>
                        </div>
                        <p className="text-[10px] text-zinc-400 line-clamp-2 leading-relaxed font-medium">{item.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Bottom Quick Actions bar */}
            <div className="mt-6 pt-5 border-t border-white/5 flex flex-wrap gap-3">
              <Link
                href="/scan"
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs rounded-xl transition-all shadow-[0_3px_10px_rgba(245,158,11,0.25)] hover:scale-[1.02] flex items-center gap-1.5"
              >
                <span>📸 掃描卡片 QR Code</span>
              </Link>
              <Link
                href="/collection"
                className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 font-bold text-xs rounded-xl transition-colors"
              >
                宇宙圖鑑
              </Link>
              <Link
                href="/games/test-game"
                className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 font-bold text-xs rounded-xl transition-colors"
              >
                小隊模擬戰
              </Link>
            </div>

          </div>
        </section>
      )}

      {/* 2.8 GAMES ENTRY CARD */}
      <section className="w-full max-w-6xl mx-auto px-4 md:px-6 pt-12">
        <Link
          href="/games"
          className="group flex flex-col sm:flex-row items-center justify-between gap-6 rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-[#070b13] to-purple-500/10 p-6 md:p-8 transition-all hover:border-amber-400/40 hover:bg-amber-500/5"
        >
          <div className="space-y-2 text-center sm:text-left">
            <span className="inline-block px-3 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full text-[10px] font-black tracking-widest uppercase">
              Interactive Arcade
            </span>
            <h3 className="text-2xl md:text-3xl font-black text-white tracking-wide">
              🎮 遊戲大廳
            </h3>
            <p className="text-zinc-400 text-sm">
              9 款獨家互動遊戲 · 3D 物理、符石消除、沙盒探索一次收錄
            </p>
          </div>
          <div className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-black text-sm rounded-xl shadow-[0_4px_15px_rgba(245,158,11,0.3)] group-hover:scale-[1.03] transition-transform shrink-0">
            查看所有遊戲
            <ArrowRight className="w-4 h-4" />
          </div>
        </Link>
      </section>

      {/* 3. MAIN BODY SECTION (TWO COLUMN - LATEST NEWS & CARD SPOTLIGHT) */}
      <main className="max-w-6xl mx-auto px-4 md:px-6 py-12 w-full grid grid-cols-1 lg:grid-cols-12 gap-8 relative">

        {/* Left Column: News Bulletin (最新消息) (Lg: 7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <h3 className="text-lg md:text-xl font-black text-zinc-100 flex items-center gap-2 tracking-wide">
              <span className="w-1.5 h-5 bg-amber-500 rounded-sm" />
              最新消息與情報
            </h3>
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest font-bold">News Bulletin</span>
          </div>

          {/* News tab selector */}
          <div className="flex gap-2 text-xs font-bold border-b border-white/5 pb-3">
            {["全部", "公告", "活動", "系統"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveNewsTab(tab)}
                className={`px-4 py-1.5 rounded-full border transition-all ${activeNewsTab === tab
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                  : "bg-white/5 border-transparent text-zinc-400 hover:text-zinc-200"
                  }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* News list */}
          <div className="space-y-3">
            {filteredNews.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 p-3 bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 rounded-xl transition-all cursor-pointer group"
              >
                {/* Category tag */}
                <span className={`px-2 py-0.5 rounded text-[9px] font-black w-12 text-center select-none shrink-0 ${item.category === "公告" ? "bg-blue-500/10 text-blue-400 border border-blue-500/25" :
                  item.category === "活動" ? "bg-amber-500/10 text-amber-400 border border-amber-500/25" :
                    "bg-purple-500/10 text-purple-400 border border-purple-500/25"
                  }`}>
                  {item.category}
                </span>

                {/* News title */}
                <p className="text-zinc-300 text-xs md:text-sm font-semibold truncate flex-1 group-hover:text-amber-400 transition-colors">
                  {item.title}
                </p>

                {/* Date */}
                <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                  {item.date}
                </span>
              </div>
            ))}
          </div>

          {/* Info Card banner */}
          <div className="rounded-xl p-4 bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-transparent border border-amber-500/10 flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="text-sm font-black text-amber-400 flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 animate-bounce" /> 龍族拼圖與神魔經典五屬相剋
              </h4>
              <p className="text-[11px] text-zinc-400 leading-tight">
                消除🔥剋🌿、🌿剋💧、💧剋🔥；✨與🌑互剋。心靈寶珠回復生命，Combo 倍率依連擊數分段提升，最高可達 3.0 倍！
              </p>
            </div>
            <Link
              href="/games/test-game"
              className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-[11px] rounded-lg transition-transform hover:scale-[1.02] shrink-0"
            >
              進入試玩
            </Link>
          </div>

        </div>

        {/* Right Column: Mini game simulator and quick stats (Lg: 5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <h3 className="text-lg md:text-xl font-black text-zinc-100 flex items-center gap-2 tracking-wide">
              <span className="w-1.5 h-5 bg-purple-500 rounded-sm" />
              符石消除試玩核心
            </h3>
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest font-bold">Interactive Demo</span>
          </div>

          {/* Mini simulation block */}
          <div className="bg-black/50 border border-white/5 rounded-2xl p-5 space-y-4 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-purple-500/[0.02] pointer-events-none" />

            <div className="space-y-1 text-left">
              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">COMBO SIMULATOR</p>
              <h4 className="text-sm font-extrabold text-zinc-300">點擊下方符石來模擬消除與傷害加成</h4>
            </div>

            {/* Simulated feedback */}
            <div className="grid grid-cols-2 gap-2 bg-zinc-950/60 p-3 rounded-xl border border-white/5 text-left text-[11px] font-mono">
              <div>
                <p className="text-zinc-500">累積 Combos:</p>
                <p className="text-lg font-black text-amber-400">{demoCombos} Combos</p>
              </div>
              <div>
                <p className="text-zinc-500">模擬小隊總傷害:</p>
                <p className="text-lg font-black text-red-400">{demoDamage.toLocaleString()} 點</p>
              </div>
            </div>

            {/* 3x3 small grid */}
            <div className="grid grid-cols-3 gap-3 w-48 mx-auto py-2">
              {DEMO_ORBS.map((orb, idx) => (
                <button
                  key={idx}
                  onClick={() => handleOrbClick(idx)}
                  className={`w-12 h-12 rounded-full bg-gradient-to-br ${orb.color} text-2xl flex items-center justify-center transition-all active:scale-95 select-none relative ${clickedOrbIndex === idx ? "animate-ping border-2 border-white" : "hover:brightness-110"
                    }`}
                >
                  {orb.icon}
                  {/* Micro splash effect */}
                  {clickedOrbIndex === idx && (
                    <span className="absolute -top-6 text-[10px] font-black text-white bg-black/60 px-1 rounded whitespace-nowrap animate-bounce">
                      HIT!
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex gap-2 pt-1 justify-center">
              <button
                onClick={resetDemo}
                className="px-3 py-1 bg-white/5 hover:bg-white/10 text-[10px] font-bold text-zinc-400 hover:text-zinc-200 rounded border border-white/5 transition-colors"
              >
                重置數據
              </button>
              <Link
                href="/games/test-game"
                className="px-3.5 py-1 bg-purple-500 hover:bg-purple-400 text-white font-extrabold text-[10px] rounded transition-transform hover:scale-[1.02] shadow-[0_2px_8px_rgba(147,51,234,0.3)] flex items-center gap-1"
              >
                <span>進入正式模擬戰</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

          </div>

          {/* Card Collection progress Quick Guide */}
          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 space-y-3 text-left">
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">🏆 宇宙圖鑑收集獎勵</h4>

            <div className="space-y-2 text-xs leading-relaxed text-zinc-400">
              <div className="flex justify-between border-b border-white/5 pb-1.5">
                <span className="text-zinc-300 font-bold">1. 探索小禮 (任意 2 張 N)</span>
                <span className="text-emerald-400 font-semibold">+5 點遊戲點數</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1.5">
                <span className="text-zinc-300 font-bold">2. 科學中禮 (2N + 1R)</span>
                <span className="text-emerald-400 font-semibold">+15 點遊戲點數</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1.5">
                <span className="text-zinc-300 font-bold">3. 領航大禮 (2N + 2R + 1SR)</span>
                <span className="text-emerald-400 font-semibold">+40 點遊戲點數</span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-400 font-bold">4. 機器王 (2N + 2R + 1SR)</span>
                <span className="text-amber-400 font-extrabold">機器人之王 + 100 點遊戲點數</span>
              </div>
            </div>
          </div>

        </div>

      </main>

      {/* 4. FEATURED CARDS SHOWCASE (精選召喚獸圖鑑展示) */}
      <section className="bg-black/30 border-y border-white/5 py-16 w-full">
        <div className="max-w-6xl mx-auto px-4 md:px-6 text-center space-y-8">

          <div className="space-y-2 max-w-lg mx-auto">
            <span className="inline-block px-3 py-1 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-full text-[10px] font-black tracking-widest uppercase">
              Robot Archive
            </span>
            <h3 className="text-2xl md:text-3xl font-black tracking-wide text-zinc-100">
              宇宙精選召喚獸展示
            </h3>
            <p className="text-zinc-400 text-xs md:text-sm">
              預覽第一彈到第四彈的強悍卡牌！每張卡牌皆能啟動專屬的被動傷害乘數，助你掃蕩關卡。
            </p>
          </div>

          {/* Cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-2">
            {FEATURED_CARDS.map((card) => (
              <motion.div
                key={card.id}
                whileHover={{ y: -6 }}
                className={`rounded-2xl p-5 border bg-gradient-to-b ${card.color} ${card.borderColor} text-left transition-all duration-300 shadow-[0_4px_20px_rgba(0,0,0,0.4)] flex flex-col justify-between relative overflow-hidden group`}
              >
                {/* Glow aura */}
                <div className="absolute inset-0 bg-white/[0.01] group-hover:bg-white/[0.03] transition-colors" />

                <div className="space-y-4 relative z-10">
                  {/* Rarity & Series info */}
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-zinc-500 uppercase font-mono">{card.series}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black select-none ${card.rarity === "SR" ? "bg-amber-500/15 text-amber-400 border border-amber-500/30" :
                      "bg-gradient-to-r from-pink-500/25 via-purple-500/25 to-blue-500/25 text-amber-300 border border-yellow-500/40"
                      }`}>
                      {card.rarity}
                    </span>
                  </div>

                  {/* Name and Element */}
                  <div className="space-y-1">
                    <h4 className="text-lg font-black text-zinc-100 group-hover:text-amber-400 transition-colors">
                      {card.name}
                    </h4>
                    <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                      <span>{card.elementIcon}</span>
                      <span className="font-bold tracking-wider">{card.element}屬性</span>
                    </div>
                  </div>

                  {/* Lore Description */}
                  <p className="text-zinc-400 text-[11px] leading-relaxed line-clamp-3">
                    {card.desc}
                  </p>
                </div>

                {/* Passive buff highlight */}
                <div className="mt-6 pt-4 border-t border-white/5 flex flex-col gap-1.5 relative z-10">
                  <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">戰隊被動加成</p>
                  <p className="text-xs font-black text-amber-400 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-spin" />
                    {card.passive}
                  </p>
                </div>

              </motion.div>
            ))}
          </div>

          <div className="pt-4">
            <Link
              href="/collection"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 text-zinc-200 hover:text-white border border-white/10 font-extrabold text-sm rounded-xl transition-all hover:scale-[1.02]"
            >
              <span>查看全部 24 張宇宙圖鑑</span>
              <BookOpen className="w-4 h-4" />
            </Link>
          </div>

        </div>
      </section>

      {/* 5. GAMEPLAY FEATURES INTRODUCTION */}
      <section className="max-w-6xl mx-auto px-4 md:px-6 py-20 w-full text-center space-y-12">
        <div className="space-y-2 max-w-lg mx-auto">
          <span className="text-xs font-bold text-amber-500 uppercase tracking-widest">How It Works</span>
          <h3 className="text-2xl md:text-3xl font-black text-zinc-100 tracking-wide">
            卡牌收集與模擬對抗三大特色
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

          {/* Feature 1 */}
          <div className="bg-white/[0.01] border border-white/5 rounded-2xl p-6 text-center space-y-4 hover:border-amber-500/20 transition-all group">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-xl mx-auto group-hover:scale-105 transition-transform">
              🔍
            </div>
            <h4 className="text-base font-extrabold text-zinc-200">實體卡牌 QR 掃描</h4>
            <p className="text-zinc-400 text-xs leading-relaxed">
              購買實體卡牌包，掃描卡面專屬 QR-code 即可秒速將該角色記錄到您的個人線上收藏，隨時隨地查看您的珍貴進度。
            </p>
          </div>

          {/* Feature 2 */}
          <div className="bg-white/[0.01] border border-white/5 rounded-2xl p-6 text-center space-y-4 hover:border-amber-500/20 transition-all group">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 text-xl mx-auto group-hover:scale-105 transition-transform">
              ⚔️
            </div>
            <h4 className="text-base font-extrabold text-zinc-200">屬性符石消除戰鬥</h4>
            <p className="text-zinc-400 text-xs leading-relaxed">
              融合神魔之塔與龍族拼圖符石消除！滑動符石串聯 3 顆以上即可發動相應屬性攻擊，挑戰最高 Combo 加成傷害。
            </p>
          </div>

          {/* Feature 3 */}
          <div className="bg-white/[0.01] border border-white/5 rounded-2xl p-6 text-center space-y-4 hover:border-amber-500/20 transition-all group">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-xl mx-auto group-hover:scale-105 transition-transform">
              ⚡
            </div>
            <h4 className="text-base font-extrabold text-zinc-200">被動卡牌疊加乘數</h4>
            <p className="text-zinc-400 text-xs leading-relaxed">
              個人收藏中的每張實體卡牌皆能為模擬戰中的特定屬性角色帶來 ATK 加成，集齊全彈大獎更可解鎖終極 SSR 傷害增益！
            </p>
          </div>

        </div>
      </section>

      {/* 6. IMMERSIVE BOTTOM ACTION CALL TO ACTION */}
      <section className="relative w-full border-t border-white/5 bg-gradient-to-b from-[#070b13] to-[#04060b] py-16">
        <div className="max-w-4xl mx-auto px-4 text-center space-y-6">
          <h3 className="text-xl md:text-3xl font-black text-white tracking-wide">
            立即登入，開啟星際機器人收集宇宙
          </h3>
          <p className="text-zinc-400 text-xs md:text-sm max-w-lg mx-auto">
            透過 LINE 快速帳號連動，自動紀錄您的收藏進度，實體卡片免手動登錄，掃碼即用！
          </p>

          <div className="pt-2 flex flex-col sm:flex-row gap-4 justify-center items-center">
            {session ? (
              <Link
                href="/dashboard"
                className="px-8 py-3.5 bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-extrabold rounded-xl transition-all shadow-[0_4px_15px_rgba(245,158,11,0.3)] hover:scale-[1.02]"
              >
                進入您的個人控制台
              </Link>
            ) : (
              <Link
                href="/login"
                className="px-8 py-3.5 bg-[#00B900] hover:bg-[#00a000] text-white font-extrabold rounded-xl transition-all shadow-[0_4px_15px_rgba(0,185,0,0.2)] hover:scale-[1.02] flex items-center gap-2"
              >
                <span>LINE 快速登入</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}

            <Link
              href="/games/test-game"
              className="px-6 py-3.5 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 font-bold rounded-xl transition-colors"
            >
              免登入試玩戰隊模擬戰
            </Link>
          </div>
        </div>
      </section>

      {/* 7. FOOTER */}
      <footer className="w-full border-t border-white/5 bg-[#04060b] py-8 text-center text-zinc-500 text-xs">
        <div className="max-w-6xl mx-auto px-4 md:px-6 space-y-4">
          <div className="flex flex-wrap justify-center gap-6 text-[11px] font-semibold text-zinc-400">
            <Link href="/collection" className="hover:text-white transition-colors">宇宙圖鑑</Link>
            <Link href="/games" className="hover:text-white transition-colors">遊戲大廳</Link>
            <Link href="/leaderboard" className="hover:text-white transition-colors">戰力排行榜</Link>
            <Link href="/login" className="hover:text-white transition-colors">快速登入</Link>
          </div>
          <p>© 2026 Akade Point Robot Universe. All rights reserved. 機器人宇宙收藏戰隊版權所有。</p>
          <div className="flex justify-center gap-2 items-center text-[10px]">
            <span className="px-1.5 py-0.5 bg-red-900/30 text-red-400 border border-red-500/20 rounded font-black">12+</span>
            <span>本遊戲為虛擬卡牌消除模擬，適合12歲以上玩家，請注意遊戲時間。</span>
          </div>
        </div>
      </footer>

    </div>
  );
}

export default function HomePage() {
  return (
    <Providers>
      <HomePageContent />
    </Providers>
  );
}
