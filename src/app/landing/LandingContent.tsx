"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  GameController,
  BookOpen,
  Users,
  Robot,
  Microphone,
  MaskHappy,
  Sparkle,
  Lightning,
  GithubLogo,
  Globe,
  ArrowRight,
  X,
  SpeakerHigh,
  Gear,
  UserCircle,
  Shuffle,
  Moon,
  Sun,
  Eye,
  Flask,
  Crosshair,
  Shield,
  Skull,
} from "@phosphor-icons/react";
import { useAppLocale } from "@/i18n/useAppLocale";
import { getMessages } from "@/i18n/messages";
import { buildSimpleAvatarUrl, AvatarConfig } from "@/lib/avatar-config";

const aiModels = [
  { name: "DeepSeek V3.2", logo: "/models/deepseek.svg" },
  { name: "Qwen3", logo: "/models/qwen.svg" },
  { name: "Kimi K2", logo: "/models/kimi.svg" },
  { name: "Gemini 3", logo: "/models/gemini.svg" },
  { name: "Seed 1.8", logo: "/models/bytedance.svg" },
  { name: "Claude", logo: "/models/claude.svg" },
];

const roleKeys = ["werewolf", "seer", "witch", "hunter", "guard"] as const;
type RoleKey = (typeof roleKeys)[number];

interface RoleInfo {
  image: string;
  color: string;
  bgColor: string;
  icon: typeof Skull;
  alignment: "wolf" | "villager";
  ability: { zh: string; en: string };
  strategy: { zh: string; en: string };
  winCondition: { zh: string; en: string };
}

const roleData: Record<RoleKey, RoleInfo> = {
  werewolf: {
    image: "/roles/werewolf.png",
    color: "var(--color-blood)",
    bgColor: "var(--color-wolf-bg)",
    icon: Skull,
    alignment: "wolf",
    ability: {
      zh: "每晚与同伴共同选择一名玩家进行猎杀",
      en: "Each night, choose a player to eliminate with your pack",
    },
    strategy: {
      zh: "白天隐藏身份，引导投票，制造混乱，保护同伴",
      en: "Hide your identity during the day, mislead votes, create chaos, protect your pack",
    },
    winCondition: {
      zh: "当狼人数量等于或超过村民阵营时获胜",
      en: "Win when werewolves equal or outnumber the villager faction",
    },
  },
  seer: {
    image: "/roles/seer.png",
    color: "var(--color-seer)",
    bgColor: "var(--color-seer-bg)",
    icon: Eye,
    alignment: "villager",
    ability: {
      zh: "每晚可以查验一名玩家的真实身份",
      en: "Each night, verify one player's true identity",
    },
    strategy: {
      zh: "谨慎公开信息，避免过早暴露，引导村民投票",
      en: "Share information carefully, avoid early exposure, guide villager votes",
    },
    winCondition: {
      zh: "帮助村民阵营找出并消灭所有狼人",
      en: "Help the villager faction find and eliminate all werewolves",
    },
  },
  witch: {
    image: "/roles/witch.png",
    color: "var(--color-witch)",
    bgColor: "var(--color-witch-bg)",
    icon: Flask,
    alignment: "villager",
    ability: {
      zh: "拥有一瓶解药（救人）和一瓶毒药（杀人），各限用一次",
      en: "Has one antidote (save) and one poison (kill), each usable once",
    },
    strategy: {
      zh: "合理使用药水，关键时刻逆转局势",
      en: "Use potions wisely, turn the tide at critical moments",
    },
    winCondition: {
      zh: "帮助村民阵营找出并消灭所有狼人",
      en: "Help the villager faction find and eliminate all werewolves",
    },
  },
  hunter: {
    image: "/roles/hunter.png",
    color: "var(--color-hunter)",
    bgColor: "var(--color-hunter-bg)",
    icon: Crosshair,
    alignment: "villager",
    ability: {
      zh: "被投票出局或被狼人杀死时，可以开枪带走一名玩家",
      en: "When voted out or killed by werewolves, can shoot and eliminate one player",
    },
    strategy: {
      zh: "死亡时带走确认的狼人，或在关键时刻自爆换取信息",
      en: "Take out confirmed werewolves when dying, or sacrifice for information",
    },
    winCondition: {
      zh: "帮助村民阵营找出并消灭所有狼人",
      en: "Help the villager faction find and eliminate all werewolves",
    },
  },
  guard: {
    image: "/roles/guard.png",
    color: "var(--color-guard)",
    bgColor: "var(--color-guard-bg)",
    icon: Shield,
    alignment: "villager",
    ability: {
      zh: "每晚可以守护一名玩家，使其免受狼人袭击（不能连续守护同一人）",
      en: "Each night, protect one player from werewolf attacks (cannot protect the same player consecutively)",
    },
    strategy: {
      zh: "预判狼人目标，保护关键角色如预言家",
      en: "Predict werewolf targets, protect key roles like the Seer",
    },
    winCondition: {
      zh: "帮助村民阵营找出并消灭所有狼人",
      en: "Help the villager faction find and eliminate all werewolves",
    },
  },
};

const featureIcons = [Users, Robot, Microphone, MaskHappy];

function useScrollAnimation() {
  const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set());
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisibleSections((prev) => new Set([...prev, entry.target.id]));
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );

    const sections = document.querySelectorAll("[data-animate]");
    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

  return visibleSections;
}

function RoleModal({
  roleKey,
  isOpen,
  onClose,
  t,
  isZh,
}: {
  roleKey: RoleKey | null;
  isOpen: boolean;
  onClose: () => void;
  t: (key: string) => string;
  isZh: boolean;
}) {
  if (!isOpen || !roleKey) return null;

  const role = roleData[roleKey];
  const roleName = t(`roles.${roleKey}`);
  const Icon = role.icon;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />

      {/* Modal */}
      <div
        className="relative z-10 w-full max-w-lg animate-role-card-enter"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Card */}
        <div
          className="relative overflow-hidden rounded-3xl border-2 shadow-2xl"
          style={{
            borderColor: role.color,
            background: `linear-gradient(135deg, var(--bg-card) 0%, ${role.bgColor} 100%)`,
          }}
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-20 rounded-full bg-black/30 p-2 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/50 hover:text-white"
          >
            <X size={20} weight="bold" />
          </button>

          {/* Decorative Corner Glows */}
          <div
            className="absolute -left-20 -top-20 h-40 w-40 rounded-full blur-[60px]"
            style={{ backgroundColor: role.color, opacity: 0.3 }}
          />
          <div
            className="absolute -bottom-20 -right-20 h-40 w-40 rounded-full blur-[60px]"
            style={{ backgroundColor: role.color, opacity: 0.2 }}
          />

          {/* Role Image */}
          <div className="relative h-64 w-full overflow-hidden">
            <Image
              src={role.image}
              alt={roleName}
              fill
              className="object-cover object-top"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-card)] via-transparent to-transparent" />

            {/* Role Badge */}
            <div
              className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full px-4 py-2 backdrop-blur-md"
              style={{
                backgroundColor: `${role.color}20`,
                border: `1px solid ${role.color}`,
              }}
            >
              <Icon size={20} weight="fill" style={{ color: role.color }} />
              <span
                className="text-sm font-bold uppercase tracking-wider"
                style={{ color: role.color }}
              >
                {role.alignment === "wolf"
                  ? isZh
                    ? "狼人阵营"
                    : "Werewolf"
                  : isZh
                    ? "村民阵营"
                    : "Villager"}
              </span>
            </div>
          </div>

          {/* Content */}
          <div className="relative space-y-4 p-6">
            {/* Title */}
            <h3
              className="font-serif text-3xl font-bold"
              style={{ color: role.color }}
            >
              {roleName}
            </h3>

            {/* Ability */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <Sparkle size={14} weight="fill" />
                {isZh ? "技能" : "Ability"}
              </div>
              <p className="text-sm leading-relaxed text-[var(--text-primary)]">
                {isZh ? role.ability.zh : role.ability.en}
              </p>
            </div>

            {/* Strategy */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <Lightning size={14} weight="fill" />
                {isZh ? "策略" : "Strategy"}
              </div>
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                {isZh ? role.strategy.zh : role.strategy.en}
              </p>
            </div>

            {/* Win Condition */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <GameController size={14} weight="fill" />
                {isZh ? "胜利条件" : "Win Condition"}
              </div>
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                {isZh ? role.winCondition.zh : role.winCondition.en}
              </p>
            </div>

            {/* Night/Day Indicator */}
            <div className="flex items-center gap-4 pt-2">
              <div className="flex items-center gap-2 rounded-full bg-[var(--bg-secondary)] px-3 py-1.5">
                <Moon size={14} className="text-indigo-400" />
                <span className="text-xs text-[var(--text-secondary)]">
                  {isZh ? "夜晚行动" : "Night Action"}
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-[var(--bg-secondary)] px-3 py-1.5">
                <Sun size={14} className="text-amber-400" />
                <span className="text-xs text-[var(--text-secondary)]">
                  {isZh ? "白天讨论" : "Day Discussion"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AvatarShowcase({ isZh }: { isZh: boolean }) {
  const [avatars, setAvatars] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const generateAvatars = () => {
    const seeds = Array.from({ length: 6 }, () =>
      Math.random().toString(36).substring(2, 10)
    );
    return seeds.map((seed) => buildSimpleAvatarUrl(seed));
  };

  useEffect(() => {
    setAvatars(generateAvatars());
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setAvatars(generateAvatars());
      setIsRefreshing(false);
    }, 300);
  };

  return (
    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-serif text-xl font-bold">
          {isZh ? "AI 角色头像生成" : "AI Character Avatars"}
        </h3>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 rounded-full bg-[var(--bg-hover)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-all hover:bg-[var(--color-gold)]/20 hover:text-[var(--color-gold-dark)] disabled:opacity-50"
        >
          <Shuffle
            size={16}
            className={isRefreshing ? "animate-spin" : ""}
          />
          {isZh ? "刷新" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-6 gap-3">
        {avatars.map((url, idx) => (
          <div
            key={idx}
            className={`aspect-square overflow-hidden rounded-xl border-2 border-[var(--border-color)] bg-[var(--bg-secondary)] transition-all duration-300 ${isRefreshing ? "scale-90 opacity-50" : "scale-100 opacity-100"}`}
          >
            {url && (
              <img
                src={url}
                alt={`Avatar ${idx + 1}`}
                className="h-full w-full object-cover"
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-2 text-sm text-[var(--text-secondary)]">
        <p>
          {isZh
            ? "每位 AI 玩家都有独特的随机生成头像，基于 DiceBear Notionists 风格。"
            : "Each AI player has a unique randomly generated avatar based on DiceBear Notionists style."}
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-[var(--bg-secondary)] px-2 py-1">
            {AvatarConfig.ALL_HAIR_VARIANTS.length} {isZh ? "种发型" : "hairstyles"}
          </span>
          <span className="rounded-full bg-[var(--bg-secondary)] px-2 py-1">
            {AvatarConfig.IDLE_LIPS.length} {isZh ? "种表情" : "expressions"}
          </span>
          <span className="rounded-full bg-[var(--bg-secondary)] px-2 py-1">
            {AvatarConfig.AVATAR_BG_COLORS.length} {isZh ? "种背景色" : "bg colors"}
          </span>
        </div>
      </div>
    </div>
  );
}

export function LandingContent() {
  const { locale, setLocale } = useAppLocale();
  const isZh = locale === "zh";
  const messages = getMessages(locale);
  const visibleSections = useScrollAnimation();

  const [selectedRole, setSelectedRole] = useState<RoleKey | null>(null);

  const t = (key: string): string => {
    const keys = key.split(".");
    let result: unknown = messages;
    for (const k of keys) {
      if (result && typeof result === "object" && k in result) {
        result = (result as Record<string, unknown>)[k];
      } else {
        return key;
      }
    }
    return typeof result === "string" ? result : key;
  };

  const toggleLocale = () => {
    setLocale(isZh ? "en" : "zh");
  };

  const features = [
    {
      icon: Users,
      title: t("seo.features.solo.title"),
      desc: t("seo.features.solo.description"),
    },
    {
      icon: Robot,
      title: t("seo.features.models.title"),
      desc: t("seo.features.models.description"),
    },
    {
      icon: Microphone,
      title: t("seo.features.voice.title"),
      desc: t("seo.features.voice.description"),
    },
    {
      icon: MaskHappy,
      title: t("seo.features.roles.title"),
      desc: t("seo.features.roles.description"),
    },
  ];

  const steps = [
    {
      num: 1,
      title: t("seo.howTo.step1.title"),
      desc: t("seo.howTo.step1.description"),
    },
    {
      num: 2,
      title: t("seo.howTo.step2.title"),
      desc: t("seo.howTo.step2.description"),
    },
    {
      num: 3,
      title: t("seo.howTo.step3.title"),
      desc: t("seo.howTo.step3.description"),
    },
  ];

  const faq = [
    { q: t("seo.faq.q1"), a: t("seo.faq.a1") },
    { q: t("seo.faq.q2"), a: t("seo.faq.a2") },
    { q: t("seo.faq.q3"), a: t("seo.faq.a3") },
    { q: t("seo.faq.q4"), a: t("seo.faq.a4") },
    {
      q: isZh ? "如何调整游戏设置？" : "How do I adjust game settings?",
      a: isZh
        ? "点击游戏界面右上角的设置图标，可以调整背景音乐音量、开关音效、AI 语音朗读、自动推进对话等选项。"
        : "Click the settings icon in the top right corner of the game interface to adjust BGM volume, sound effects, AI voice reading, auto-advance dialogue, and more.",
    },
    {
      q: isZh ? "如何查看我的游戏数据？" : "How do I view my game data?",
      a: isZh
        ? "点击头像进入个人中心，可以查看积分、邀请码、已邀请人数等信息。还可以配置自定义 API Key 使用更多模型。"
        : "Click your avatar to access the profile center, where you can view credits, referral code, and referral count. You can also configure custom API keys to use more models.",
    },
    {
      q: isZh ? "支持哪些语言？" : "What languages are supported?",
      a: isZh
        ? "目前支持中文和英文两种语言，可以通过导航栏的语言切换按钮随时切换。"
        : "Currently supports Chinese and English. You can switch languages anytime using the language toggle in the navigation bar.",
    },
  ];

  const getAnimationClass = (sectionId: string) => {
    return visibleSections.has(sectionId)
      ? "opacity-100 translate-y-0"
      : "opacity-0 translate-y-8";
  };

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden overflow-y-auto bg-[var(--bg-main)] text-[var(--text-primary)]">
      {/* Role Modal */}
      <RoleModal
        roleKey={selectedRole}
        isOpen={!!selectedRole}
        onClose={() => setSelectedRole(null)}
        t={t}
        isZh={isZh}
      />

      {/* Background Texture */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: `
            radial-gradient(circle at 50% 50%, rgba(197, 160, 89, 0.05), transparent 70%),
            url("data:image/svg+xml,%3Csvg width='200' height='200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.08'/%3E%3C/svg%3E")
          `,
        }}
      />

      {/* Navigation */}
      <nav className="fixed top-0 z-50 w-full border-b border-transparent bg-[var(--glass-bg)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/brand/wolfcha-favicon.svg"
              alt="Wolfcha"
              width={32}
              height={32}
            />
            <span className="font-serif text-xl font-bold tracking-[0.2em] text-[var(--text-primary)]">
              WOLFCHA
            </span>
          </Link>
          <div className="hidden items-center gap-8 text-sm font-medium text-[var(--text-secondary)] md:flex">
            <a
              href="#features"
              className="transition-colors hover:text-[var(--color-gold-dark)]"
            >
              {t("seo.nav.features")}
            </a>
            <a
              href="#roles"
              className="transition-colors hover:text-[var(--color-gold-dark)]"
            >
              {isZh ? "角色" : "Roles"}
            </a>
            <a
              href="#models"
              className="transition-colors hover:text-[var(--color-gold-dark)]"
            >
              {t("seo.nav.models")}
            </a>
            <a
              href="#faq"
              className="transition-colors hover:text-[var(--color-gold-dark)]"
            >
              FAQ
            </a>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={toggleLocale}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
              title={t("locale.label")}
            >
              <Globe size={18} />
              <span className="hidden sm:inline">{isZh ? "EN" : "中文"}</span>
            </button>
            <Link
              href="/"
              className="group relative overflow-hidden rounded-full bg-gradient-to-r from-[var(--color-gold)] to-[var(--color-gold-dim)] px-6 py-2 font-bold text-[#1a1614] shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl"
            >
              <span className="relative z-10">{t("seo.nav.home")}</span>
              <span className="absolute left-[-100%] top-0 h-full w-1/2 skew-x-[-25deg] bg-gradient-to-r from-transparent via-white/40 to-transparent transition-all duration-500 group-hover:left-[150%]" />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 pt-20">
        {/* Decorative Glows */}
        <div className="animate-pulse-glow absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-[var(--color-gold)] opacity-20 blur-[100px]" />
        <div className="animate-pulse-glow-delayed absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-[var(--color-blood)] opacity-10 blur-[100px]" />

        <div className="relative z-10 mx-auto max-w-4xl text-center">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--color-gold)] bg-[var(--color-gold)]/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-gold-dark)]">
            <Sparkle size={14} weight="fill" />
            {isZh ? "单人沉浸式狼人杀" : "Single Player Social Deduction"}
          </div>

          {/* Title */}
          <h1 className="font-serif text-6xl font-black leading-tight md:text-8xl">
            <span className="bg-gradient-to-r from-[var(--color-gold-dark)] via-[var(--color-gold)] to-[var(--color-blood)] bg-clip-text text-transparent drop-shadow-sm">
              {isZh ? "AI 狼人杀" : "AI WEREWOLF"}
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mx-auto mt-6 max-w-2xl text-xl leading-relaxed text-[var(--text-secondary)] md:text-2xl">
            {t("seo.hero.description")}
          </p>

          {/* CTA Buttons */}
          <div className="mt-10 flex flex-col items-center justify-center gap-5 sm:flex-row">
            <Link
              href="/"
              className="group relative flex items-center gap-3 overflow-hidden rounded-full bg-gradient-to-r from-[var(--color-gold)] to-[var(--color-gold-dim)] px-10 py-4 text-lg font-bold text-[#1a1614] shadow-2xl transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_20px_rgba(197,160,89,0.3)]"
            >
              <GameController size={24} weight="fill" />
              <span>{t("seo.hero.playNow")}</span>
              <ArrowRight
                size={20}
                weight="bold"
                className="transition-transform group-hover:translate-x-1"
              />
              <span className="absolute left-[-100%] top-0 h-full w-1/2 skew-x-[-25deg] bg-gradient-to-r from-transparent via-white/40 to-transparent transition-all duration-500 group-hover:left-[150%]" />
            </Link>
            <Link
              href="#how-to-play"
              className="flex items-center gap-3 rounded-full border-2 border-[var(--border-color)] px-10 py-4 text-lg font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
            >
              <BookOpen size={22} weight="bold" />
              <span>{t("seo.hero.howToPlay")}</span>
            </Link>
          </div>
        </div>

        {/* Bottom Gradient Fade */}
        <div className="pointer-events-none absolute bottom-0 h-32 w-full bg-gradient-to-t from-[var(--bg-main)] to-transparent" />
      </section>

      {/* Features Section */}
      <section
        id="features"
        data-animate
        className={`relative px-6 py-24 transition-all duration-700 ${getAnimationClass("features")}`}
      >
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="font-serif text-4xl font-bold text-[var(--text-primary)]">
              {t("seo.features.title")}
            </h2>
            <div className="mx-auto mt-4 h-1 w-20 bg-[var(--color-gold)]" />
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, idx) => {
              const Icon = featureIcons[idx];
              return (
                <div
                  key={feature.title}
                  className="group relative overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-8 shadow-sm transition-all duration-300 hover:-translate-y-2 hover:border-[var(--color-gold)] hover:shadow-xl"
                  style={{ transitionDelay: `${idx * 100}ms` }}
                >
                  {/* Corner Decorations */}
                  <div className="pointer-events-none absolute left-0 top-0 h-5 w-5 border-l-2 border-t-2 border-[var(--color-gold)] opacity-50 transition-all duration-300 group-hover:h-full group-hover:w-full group-hover:opacity-20" />
                  <div className="pointer-events-none absolute bottom-0 right-0 h-5 w-5 border-b-2 border-r-2 border-[var(--color-gold)] opacity-50 transition-all duration-300 group-hover:h-full group-hover:w-full group-hover:opacity-20" />

                  {/* Background Icon */}
                  <div className="absolute right-4 top-4 opacity-10 transition-opacity group-hover:opacity-20">
                    <Icon
                      size={80}
                      weight="duotone"
                      className="text-[var(--color-gold)]"
                    />
                  </div>

                  {/* Icon */}
                  <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--bg-hover)] text-[var(--color-gold-dark)]">
                    <Icon size={28} weight="duotone" />
                  </div>

                  {/* Content */}
                  <h3 className="mb-3 text-xl font-bold">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                    {feature.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Roles Section */}
      <section
        id="roles"
        data-animate
        className={`relative px-6 py-24 transition-all duration-700 ${getAnimationClass("roles")}`}
      >
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="font-serif text-4xl font-bold text-[var(--text-primary)]">
              {isZh ? "经典角色体系" : "Classic Roles"}
            </h2>
            <p className="mt-4 text-[var(--text-secondary)]">
              {isZh
                ? "点击卡片查看详细玩法"
                : "Click cards to view detailed gameplay"}
            </p>
            <div className="mx-auto mt-4 h-1 w-20 bg-[var(--color-gold)]" />
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {roleKeys.map((roleKey, idx) => {
              const role = roleData[roleKey];
              const roleName = t(`roles.${roleKey}`);
              const Icon = role.icon;
              return (
                <button
                  key={roleKey}
                  onClick={() => setSelectedRole(roleKey)}
                  className="group relative overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] text-left transition-all duration-300 hover:-translate-y-2 hover:border-[var(--color-gold)] hover:shadow-xl"
                  style={{ transitionDelay: `${idx * 80}ms` }}
                >
                  {/* Role Image */}
                  <div
                    className="relative h-48 w-full overflow-hidden"
                    style={{ backgroundColor: role.bgColor }}
                  >
                    <Image
                      src={role.image}
                      alt={roleName}
                      fill
                      className="object-cover object-top transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-card)] via-transparent to-transparent" />

                    {/* Click Hint */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
                      <span className="rounded-full bg-white/90 px-4 py-2 text-sm font-bold text-[#1a1614]">
                        {isZh ? "查看详情" : "View Details"}
                      </span>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-5">
                    <div className="flex items-center gap-2">
                      <Icon
                        size={20}
                        weight="fill"
                        style={{ color: role.color }}
                      />
                      <span
                        className="text-xl font-bold"
                        style={{ color: role.color }}
                      >
                        {roleName}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* AI Models Section */}
      <section
        id="models"
        data-animate
        className={`border-y border-[var(--border-color)] bg-[var(--bg-secondary)]/60 px-6 py-20 transition-all duration-700 ${getAnimationClass("models")}`}
      >
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-4 text-center font-serif text-3xl font-bold">
            {t("seo.models.title")}
          </h2>
          <p className="mb-12 text-center text-[var(--text-secondary)]">
            {t("seo.models.description")}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
            {aiModels.map((model, idx) => (
              <div
                key={model.name}
                className="group flex flex-col items-center gap-3"
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-[var(--border-color)] bg-white/70 p-3 shadow-sm transition-all group-hover:border-[var(--color-gold)] group-hover:shadow-md group-hover:-translate-y-1">
                  <Image
                    src={model.logo}
                    alt={model.name}
                    width={48}
                    height={48}
                    className="h-12 w-12"
                  />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  {model.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Avatar Generation Section */}
      <section
        id="avatars"
        data-animate
        className={`px-6 py-24 transition-all duration-700 ${getAnimationClass("avatars")}`}
      >
        <div className="mx-auto max-w-4xl">
          <div className="mb-12 text-center">
            <h2 className="font-serif text-3xl font-bold">
              {isZh ? "独特身份生成" : "Unique Identity Generation"}
            </h2>
            <p className="mt-4 text-[var(--text-secondary)]">
              {isZh
                ? "每位 AI 玩家都拥有独特的外观和性格"
                : "Each AI player has a unique appearance and personality"}
            </p>
          </div>

          <AvatarShowcase isZh={isZh} />
        </div>
      </section>

      {/* How to Play Section */}
      <section
        id="how-to-play"
        data-animate
        className={`px-6 py-24 transition-all duration-700 ${getAnimationClass("how-to-play")}`}
      >
        <div className="mx-auto max-w-5xl">
          <div className="mb-16 text-center">
            <h2 className="font-serif text-3xl font-bold">
              {t("seo.howTo.title")}
            </h2>
          </div>

          <div className="relative grid gap-8 md:grid-cols-3">
            {/* Connecting Line */}
            <div className="absolute left-[16%] right-[16%] top-12 z-0 hidden h-0.5 bg-[var(--border-color)] md:block" />

            {steps.map((step, idx) => (
              <div
                key={step.num}
                className="relative z-10 text-center"
                style={{ transitionDelay: `${idx * 150}ms` }}
              >
                <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border-4 border-[var(--color-gold)] bg-[var(--bg-main)] shadow-lg transition-transform hover:scale-110">
                  <span className="font-serif text-4xl font-bold text-[var(--color-gold-dark)]">
                    {step.num}
                  </span>
                </div>
                <h3 className="mt-6 text-xl font-bold">{step.title}</h3>
                <p className="mt-2 px-4 text-[var(--text-secondary)]">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section
        id="faq"
        data-animate
        className={`border-t border-[var(--border-color)] bg-[var(--bg-card)] px-6 py-20 transition-all duration-700 ${getAnimationClass("faq")}`}
      >
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-12 text-center font-serif text-3xl font-bold">
            {t("seo.faq.title")}
          </h2>

          <div className="space-y-4">
            {faq.map((item, idx) => (
              <div
                key={item.q}
                className="cursor-default rounded-lg border border-[var(--border-color)] p-6 transition-all hover:border-[var(--color-gold)] hover:shadow-md"
                style={{ transitionDelay: `${idx * 50}ms` }}
              >
                <h3 className="mb-2 flex items-center gap-3 text-lg font-bold">
                  <span className="font-serif text-xl italic text-[var(--color-gold)]">
                    Q.
                  </span>
                  {item.q}
                </h3>
                <p className="border-l-2 border-[var(--bg-secondary)] pl-8 text-[var(--text-secondary)]">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-b from-[var(--bg-main)] to-[#e6dac0] px-6 py-32 text-center">
        <h2 className="font-serif text-4xl font-bold text-[var(--color-blood)] md:text-5xl">
          {t("seo.cta.title")}
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-xl text-[var(--text-secondary)]">
          {t("seo.cta.description")}
        </p>
        <Link
          href="/"
          className="group relative mt-12 inline-flex items-center gap-3 overflow-hidden rounded-full bg-gradient-to-r from-[var(--color-gold)] to-[var(--color-gold-dim)] px-12 py-5 text-xl font-bold text-[#1a1614] shadow-2xl transition-all hover:scale-105"
        >
          <Lightning size={24} weight="fill" />
          <span>{t("seo.cta.button")}</span>
          <span className="absolute left-[-100%] top-0 h-full w-1/2 skew-x-[-25deg] bg-gradient-to-r from-transparent via-white/40 to-transparent transition-all duration-500 group-hover:left-[150%]" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#8c7335]/30 bg-[#1a1614] px-6 py-12 text-[#f0e6d2]">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-8 md:flex-row">
          <div className="flex items-center gap-3 opacity-80">
            <Image
              src="/brand/wolfcha-favicon.svg"
              alt="Wolfcha"
              width={32}
              height={32}
              className="brightness-200 grayscale"
            />
            <span className="font-serif font-bold tracking-[0.3em]">
              WOLFCHA
            </span>
          </div>
          <div className="text-center text-sm opacity-50">
            <p>{t("seo.footer.slogan")}</p>
            <p className="mt-1 font-mono">© 2024 Wolfcha Project. Open Source.</p>
          </div>
          <div className="flex gap-6 opacity-60">
            <a
              href="https://github.com/oil-oil/wolfcha"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-[var(--color-gold)]"
            >
              <GithubLogo size={24} weight="fill" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
