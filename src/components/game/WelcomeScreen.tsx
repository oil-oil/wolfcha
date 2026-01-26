"use client";

import { motion, AnimatePresence } from "framer-motion";
import { FingerprintSimple, PawPrint, Sparkle, Wrench, GearSix, UserCircle, GithubLogo, Star, EnvelopeSimple, Handshake, DotsThreeOutlineVertical, Users } from "@phosphor-icons/react";
import { WerewolfIcon } from "@/components/icons/FlatIcons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { DevPreset, DifficultyLevel, Role, StartGameOptions } from "@/types/game";
import { DevModeButton } from "@/components/DevTools";
import { GameSetupModal } from "@/components/game/GameSetupModal";
import { AuthModal } from "@/components/game/AuthModal";
import { SharePanel } from "@/components/game/SharePanel";
import { AccountModal } from "@/components/game/AccountModal";
import { ResetPasswordModal } from "@/components/game/ResetPasswordModal";
import { UserProfileModal } from "@/components/game/UserProfileModal";
import { LocaleSwitcher } from "@/components/game/LocaleSwitcher";
import { useCredits } from "@/hooks/useCredits";
import { hasDashscopeKey, hasZenmuxKey, isCustomKeyEnabled } from "@/lib/api-keys";

type SponsorCardProps = {
  sponsorId: string;
  href: string;
  className: string;
  rotate: string;
  delay: number;
  logoSrc?: string;
  logoAlt?: string;
  label?: string;
  name?: string;
  note?: string;
  children?: React.ReactNode;
};

// Track sponsor click
async function trackSponsorClick(sponsorId: string) {
  try {
    await fetch("/api/sponsor/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sponsorId, ref: "homepage" }),
    });
  } catch {
    // Silently fail - don't block navigation
  }
}

function SponsorCard({
  sponsorId,
  href,
  className,
  rotate,
  delay,
  logoSrc,
  logoAlt,
  label,
  name,
  note,
  children,
}: SponsorCardProps) {
  const ariaLabel = [label, name, note].filter(Boolean).join(" · ");
  
  const handleClick = () => {
    void trackSponsorClick(sponsorId);
  };

  // Add ref parameter to href for tracking on sponsor's side
  // Special handling for OpenCreator: use promo parameter instead of ref
  const hrefWithRef = sponsorId === "opencreator"
    ? (href.includes("?") ? `${href}&promo=wolfcha` : `${href}?promo=wolfcha`)
    : (href.includes("?") ? `${href}&ref=wolfcha` : `${href}?ref=wolfcha`);

  return (
    <motion.a
      href={hrefWithRef}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay, duration: 0.5 }}
      className={className}
      style={{ "--card-rotate": rotate } as React.CSSProperties}
      aria-label={ariaLabel || undefined}
      title={ariaLabel || undefined}
      onClick={handleClick}
    >
      <span className="wc-sponsor-card__border" aria-hidden="true" />
      <div className="wc-sponsor-card__content">
        {logoSrc && (
          <img src={logoSrc} alt={logoAlt ?? ""} className="wc-sponsor-card__logo" />
        )}
        {label && <div className="wc-sponsor-card__label">{label}</div>}
        {name && <div className="wc-sponsor-card__name">{name}</div>}
        {note && <div className="wc-sponsor-card__note">{note}</div>}
        {children}
      </div>
    </motion.a>
  );
}

function buildDefaultRoles(playerCount: number): Role[] {
  switch (playerCount) {
    case 8:
      return ["Werewolf", "Werewolf", "Werewolf", "Seer", "Witch", "Hunter", "Villager", "Villager"];
    case 9:
      return [
        "Werewolf",
        "Werewolf",
        "Werewolf",
        "Seer",
        "Witch",
        "Hunter",
        "Villager",
        "Villager",
        "Villager",
      ];
    case 11:
      return [
        "Werewolf",
        "Werewolf",
        "Werewolf",
        "Werewolf",
        "Seer",
        "Witch",
        "Hunter",
        "Guard",
        "Villager",
        "Villager",
        "Villager",
      ];
    case 12:
      return [
        "Werewolf",
        "Werewolf",
        "Werewolf",
        "Werewolf",
        "Seer",
        "Witch",
        "Hunter",
        "Guard",
        "Villager",
        "Villager",
        "Villager",
        "Villager",
      ];
    case 10:
    default:
      return [
        "Werewolf",
        "Werewolf",
        "Werewolf",
        "Seer",
        "Witch",
        "Hunter",
        "Guard",
        "Villager",
        "Villager",
        "Villager",
      ];
  }
}

function getRoleCountConfig(playerCount: number) {
  const wolfCount = playerCount >= 11 ? 4 : 3;
  const guardCount = playerCount >= 10 ? 1 : 0;
  const seerCount = 1;
  const witchCount = 1;
  const hunterCount = 1;
  const godCount = seerCount + witchCount + hunterCount + guardCount;
  const villagerCount = Math.max(0, playerCount - wolfCount - godCount);
  return {
    wolfCount,
    guardCount,
    seerCount,
    witchCount,
    hunterCount,
    villagerCount,
  };
}

interface WelcomeScreenProps {
  humanName: string;
  setHumanName: (name: string) => void;
  onStart: (options?: StartGameOptions) => void | Promise<void>;
  onAbort?: () => void;
  isLoading: boolean;
  isGenshinMode: boolean;
  onGenshinModeChange: (value: boolean) => void;
  bgmVolume: number;
  isSoundEnabled: boolean;
  isAiVoiceEnabled: boolean;
  onBgmVolumeChange: (value: number) => void;
  onSoundEnabledChange: (value: boolean) => void;
  onAiVoiceEnabledChange: (value: boolean) => void;
}

export function WelcomeScreen({
  humanName,
  setHumanName,
  onStart,
  onAbort,
  isLoading,
  isGenshinMode,
  onGenshinModeChange,
  bgmVolume,
  isSoundEnabled,
  isAiVoiceEnabled,
  onBgmVolumeChange,
  onSoundEnabledChange,
  onAiVoiceEnabledChange,
}: WelcomeScreenProps) {
  const t = useTranslations();
  const sponsorEmail = "zhihuang.oiloil@gmail.com";
  const sponsorMailto = useMemo(() => {
    const subject = t("welcome.sponsor.mailSubject");
    const body = t("welcome.sponsor.mailBody");
    return `mailto:${sponsorEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [sponsorEmail, t]);

  const {
    user,
    credits,
    referralCode,
    totalReferrals,
    loading: creditsLoading,
    consumeCredit,
    signOut,
    isPasswordRecovery,
    clearPasswordRecovery,
  } = useCredits();
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const paperRef = useRef<HTMLDivElement | null>(null);
  const sealButtonRef = useRef<HTMLButtonElement | null>(null);
  const isStartingRef = useRef(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isUserProfileOpen, setIsUserProfileOpen] = useState(false);
  const [isSponsorOpen, setIsSponsorOpen] = useState(false);
  const [isGroupOpen, setIsGroupOpen] = useState(false);
  const [groupImgOk, setGroupImgOk] = useState<boolean | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [difficulty, setDifficulty] = useState<DifficultyLevel>("normal");
  const [playerCount, setPlayerCount] = useState(10);
  const [githubStars, setGithubStars] = useState<number | null>(null);

  const [customKeyEnabled, setCustomKeyEnabled] = useState(() => isCustomKeyEnabled());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "wolfcha_custom_key_enabled") return;
      setCustomKeyEnabled(isCustomKeyEnabled());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // 调试面板状态
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [isDevModeEnabled, setIsDevModeEnabled] = useState(false);
  const [isDevConsoleOpen, setIsDevConsoleOpen] = useState(false);
  const [devTab, setDevTab] = useState<"preset" | "roles">("preset");
  const [devPreset, setDevPreset] = useState<DevPreset | "">("");
  const showDevTools =
    process.env.NODE_ENV !== "production" && (process.env.NEXT_PUBLIC_SHOW_DEVTOOLS ?? "true") === "true";

  const roleOptions: Role[] = ["Villager", "Werewolf", "Seer", "Witch", "Hunter", "Guard"];
  const roleLabels = useMemo<Record<Role, string>>(
    () => ({
      Villager: t("roles.villager"),
      Werewolf: t("roles.werewolf"),
      Seer: t("roles.seer"),
      Witch: t("roles.witch"),
      Hunter: t("roles.hunter"),
      Guard: t("roles.guard"),
    }),
    [t]
  );

  const [fixedRoles, setFixedRoles] = useState<(Role | "")[]>(() => buildDefaultRoles(10));

  useEffect(() => {
    setFixedRoles(buildDefaultRoles(playerCount));
  }, [playerCount]);

  // Fetch GitHub stars
  useEffect(() => {
    fetch('https://api.github.com/repos/oil-oil/wolfcha')
      .then(res => res.json())
      .then(data => {
        if (data.stargazers_count !== undefined) {
          setGithubStars(data.stargazers_count);
        }
      })
      .catch(() => {
        // Silently fail, stars will remain null
      });
  }, []);

  const roleConfigValid = useMemo(() => {
    if (fixedRoles.length !== playerCount) return false;
    if (fixedRoles.some((r) => !r)) return false;

    const counts: Record<Role, number> = {
      Villager: 0,
      Werewolf: 0,
      Seer: 0,
      Witch: 0,
      Hunter: 0,
      Guard: 0,
    };
    for (const r of fixedRoles) {
      counts[r as Role] += 1;
    }

    const expected = getRoleCountConfig(playerCount);
    return (
      counts.Werewolf === expected.wolfCount &&
      counts.Seer === expected.seerCount &&
      counts.Witch === expected.witchCount &&
      counts.Hunter === expected.hunterCount &&
      counts.Guard === expected.guardCount &&
      counts.Villager === expected.villagerCount
    );
  }, [fixedRoles, playerCount]);

  const roleConfigHint = useMemo(() => {
    const expected = getRoleCountConfig(playerCount);
    const godLabel =
      expected.guardCount > 0 ? t("welcome.roleConfig.godLabelFull") : t("welcome.roleConfig.godLabelNoGuard");
    return t("welcome.roleConfig.hint", {
      wolfCount: expected.wolfCount,
      godLabel,
      villagerCount: expected.villagerCount,
    });
  }, [playerCount, t]);

  const canConfirm = useMemo(() => {
    return !!humanName.trim() && !isLoading && !isTransitioning && !creditsLoading;
  }, [humanName, isLoading, isTransitioning, creditsLoading]);

  const difficultyLabel = useMemo(() => {
    const labels: Record<DifficultyLevel, string> = {
      easy: t("difficulty.easy"),
      normal: t("difficulty.normal"),
      hard: t("difficulty.hard"),
    };
    return labels[difficulty];
  }, [difficulty, t]);

  useEffect(() => {
    const paper = paperRef.current;
    if (!paper) return;

    if (typeof window === "undefined") return;
    if ("ontouchstart" in window) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let rafId: number | null = null;
    let lastX = 0;
    let lastY = 0;

    const update = () => {
      rafId = null;
      const xAxis = (window.innerWidth / 2 - lastX) / 60;
      const yAxis = (window.innerHeight / 2 - lastY) / 60;
      paper.style.setProperty("--wc-tilt-x", `${xAxis}`);
      paper.style.setProperty("--wc-tilt-y", `${yAxis}`);
    };

    const onMove = (e: MouseEvent) => {
      lastX = e.clientX;
      lastY = e.clientY;
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(update);
    };

    const onLeave = () => {
      paper.style.setProperty("--wc-tilt-x", "0");
      paper.style.setProperty("--wc-tilt-y", "0");
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, []);

  const createParticles = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    for (let i = 0; i < 18; i += 1) {
      const particle = document.createElement("div");
      particle.className = "wc-particle";
      document.body.appendChild(particle);

      const size = Math.random() * 7 + 2;
      particle.style.width = `${size}px`;
      particle.style.height = `${size}px`;
      particle.style.left = `${centerX}px`;
      particle.style.top = `${centerY}px`;

      const angle = Math.random() * Math.PI * 2;
      const velocity = Math.random() * 90 + 40;
      const tx = Math.cos(angle) * velocity;
      const ty = Math.sin(angle) * velocity - 90;

      particle.animate(
        [
          { transform: "translate(0, 0) scale(1)", opacity: 1 },
          { transform: `translate(${tx}px, ${ty}px) scale(0)`, opacity: 0 },
        ],
        {
          duration: 900 + Math.random() * 450,
          easing: "cubic-bezier(0, .9, .57, 1)",
          fill: "forwards",
        }
      );

      window.setTimeout(() => particle.remove(), 1600);
    }
  };

  const handleCopySponsorEmail = async () => {
    try {
      await navigator.clipboard.writeText(sponsorEmail);
      toast.success(t("welcome.sponsor.copySuccess"), { description: sponsorEmail });
    } catch {
      toast(t("welcome.sponsor.copyFallback"), { description: sponsorEmail });
    }
  };

  const handleConfirm = async () => {
    if (!canConfirm) return;
    if (isStartingRef.current) return;

    if (!user) {
      setIsAuthOpen(true);
      toast(t("welcome.toast.signInFirst"));
      return;
    }

    const hasUserKey = customKeyEnabled && (hasZenmuxKey() || hasDashscopeKey());
    if (!hasUserKey && credits !== null && credits <= 0) {
      setIsShareOpen(true);
      toast(t("welcome.toast.noCredits.title"), { description: t("welcome.toast.noCredits.description") });
      return;
    }

    isStartingRef.current = true;

    const seal = sealButtonRef.current;
    if (seal) createParticles(seal);

    setIsTransitioning(true);

    window.setTimeout(() => {
      // 传递开发模式配置
      const roles = devTab === "roles" && roleConfigValid ? (fixedRoles as Role[]) : undefined;
      const preset = devTab === "preset" && devPreset ? (devPreset as DevPreset) : undefined;
      void onStart({ fixedRoles: roles, devPreset: preset, difficulty, playerCount });
    }, 800);

    if (hasUserKey) {
      isStartingRef.current = false;
      return;
    }

    void consumeCredit()
      .then((consumed) => {
        if (consumed) return;
        // Credit deduction failed, abort the game and show share panel
        setIsTransitioning(false);
        onAbort?.();
        setIsShareOpen(true);
        toast.error(t("welcome.toast.creditFail.title"), { description: t("welcome.toast.creditFail.description") });
      })
      .catch(() => {
        // Credit deduction failed, abort the game and show share panel
        setIsTransitioning(false);
        onAbort?.();
        setIsShareOpen(true);
        toast.error(t("welcome.toast.creditFail.title"), { description: t("welcome.toast.creditFail.description") });
      })
      .finally(() => {
        isStartingRef.current = false;
      });
  };

  return (
    <>
    <div className="wc-contract-screen selection:bg-[var(--color-accent)] selection:text-white">
      <div className="wc-contract-fog" aria-hidden="true" />
      <div className="wc-contract-vignette" aria-hidden="true" />

      <GameSetupModal
        open={isSetupOpen}
        onOpenChange={setIsSetupOpen}
        difficulty={difficulty}
        onDifficultyChange={setDifficulty}
        playerCount={playerCount}
        onPlayerCountChange={setPlayerCount}
        isGenshinMode={isGenshinMode}
        onGenshinModeChange={onGenshinModeChange}
        bgmVolume={bgmVolume}
        isSoundEnabled={isSoundEnabled}
        isAiVoiceEnabled={isAiVoiceEnabled}
        onBgmVolumeChange={onBgmVolumeChange}
        onSoundEnabledChange={onSoundEnabledChange}
        onAiVoiceEnabledChange={onAiVoiceEnabledChange}
      />
      <AuthModal open={isAuthOpen} onOpenChange={setIsAuthOpen} />
      <AccountModal open={isAccountOpen} onOpenChange={setIsAccountOpen} />
      <UserProfileModal
        open={isUserProfileOpen}
        onOpenChange={setIsUserProfileOpen}
        email={user?.email}
        credits={credits ?? undefined}
        referralCode={referralCode}
        totalReferrals={totalReferrals}
        onChangePassword={() => setIsAccountOpen(true)}
        onShareInvite={() => setIsShareOpen(true)}
        onSignOut={signOut}
        onCustomKeyEnabledChange={setCustomKeyEnabled}
      />
      <ResetPasswordModal 
        open={isPasswordRecovery} 
        onOpenChange={(open) => !open && clearPasswordRecovery()}
        onSuccess={clearPasswordRecovery}
      />
      <SharePanel
        open={isShareOpen}
        onOpenChange={setIsShareOpen}
        referralCode={referralCode}
        totalReferrals={totalReferrals}
      />

      <Dialog open={isGroupOpen} onOpenChange={setIsGroupOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users size={18} weight="duotone" />
              {t("welcome.group.title")}
            </DialogTitle>
            <DialogDescription>{t("welcome.group.description")}</DialogDescription>
          </DialogHeader>

          <div className="mt-2 flex items-center justify-center">
            {groupImgOk !== false && (
              <img
                src="/group.png"
                alt={t("settings.about.group.alt")}
                className="w-full max-w-[280px] max-h-[50vh] rounded-md border-2 border-[var(--border-color)] bg-white object-contain"
                onLoad={() => setGroupImgOk(true)}
                onError={() => setGroupImgOk(false)}
              />
            )}
            {groupImgOk === false && (
              <div className="text-xs text-[var(--text-muted)]">{t("settings.about.group.missing")}</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isSponsorOpen} onOpenChange={setIsSponsorOpen}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Handshake size={18} weight="duotone" />
              {t("welcome.sponsor.title")}
            </DialogTitle>
            <DialogDescription>
              {t("welcome.sponsor.subtitle")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm leading-relaxed text-[var(--text-primary)]">
            <p>
              {t("welcome.sponsor.description")}
            </p>
            <ul className="list-disc pl-5 space-y-1 text-[var(--text-secondary)]">
              <li>{t("welcome.sponsor.items.credits")}</li>
              <li>{t("welcome.sponsor.items.media")}</li>
              <li>{t("welcome.sponsor.items.collaboration")}</li>
              <li>{t("welcome.sponsor.items.community")}</li>
            </ul>
            <p className="text-[var(--text-secondary)]">
              {t("welcome.sponsor.note")}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={handleCopySponsorEmail} className="gap-2">
              <EnvelopeSimple size={16} />
              {t("welcome.sponsor.copyEmail")}
            </Button>
            <Button asChild className="gap-2">
              <a href={sponsorMailto} target="_blank" rel="noopener noreferrer">
                <EnvelopeSimple size={16} />
                {t("welcome.sponsor.sendEmail")}
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{t("welcome.mobileMenu.title")}</DialogTitle>
            <DialogDescription>{t("welcome.mobileMenu.description")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Button
              type="button"
              variant="outline"
              className="justify-start"
              onClick={() => {
                setIsMobileMenuOpen(false);
                setIsSponsorOpen(true);
              }}
            >
              <Handshake size={16} />
              {t("welcome.sponsor.action")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="justify-start"
              onClick={() => {
                setIsMobileMenuOpen(false);
                setIsSetupOpen(true);
              }}
            >
              <GearSix size={16} />
              {t("welcome.settings")}
            </Button>
            {user ? (
              <Button
                type="button"
                variant="outline"
                className="justify-start"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsUserProfileOpen(true);
                }}
              >
                <UserCircle size={16} />
                {t("welcome.account.info")}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="justify-start"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsAuthOpen(true);
                }}
              >
                <UserCircle size={16} />
                {t("welcome.auth.signIn")}
              </Button>
            )}
            <Button asChild variant="outline" className="justify-start">
              <a
                href="https://github.com/oil-oil/wolfcha"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <GithubLogo size={16} />
                {t("welcome.github.title")}
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Scattered sponsor cards */}
      <div className="wc-sponsor-cards" aria-label={t("welcome.sponsor.showcaseLabel")}>
        {/* Sponsor card - OpenCreator (左侧) */}
        <SponsorCard
          sponsorId="opencreator"
          href="https://opencreator.io/"
          className="wc-sponsor-card wc-sponsor-card--with-logo wc-sponsor-card--left-center wc-sponsor-card--featured"
          rotate="-6deg"
          delay={0.3}
          logoSrc="/sponsor/opencreator.png"
          logoAlt="OpenCreator"
          name="OpenCreator"
          note={t("welcome.sponsor.cards.openCreator")}
        />

        {/* Sponsor card - Bailian (左上) */}
        <SponsorCard
          sponsorId="bailian"
          href="https://bailian.console.aliyun.com/"
          className="wc-sponsor-card wc-sponsor-card--with-logo wc-sponsor-card--top-left"
          rotate="4deg"
          delay={0.15}
          logoSrc="/sponsor/bailian.png"
          logoAlt="Bailian"
          name="Bailian"
          note={t("welcome.sponsor.cards.bailian")}
        />

        {/* Sponsor card - Minimax (右上) */}
        <SponsorCard
          sponsorId="minimax"
          href="https://minimaxi.com/"
          className="wc-sponsor-card wc-sponsor-card--with-logo wc-sponsor-card--right-top"
          rotate="5deg"
          delay={0.45}
          logoSrc="/sponsor/minimax.png"
          logoAlt="Minimax"
          name="Minimax"
          note={t("welcome.sponsor.cards.minimax")}
        />

        {/* Sponsor card - ZenMux (右下) */}
        <SponsorCard
          sponsorId="zenmux"
          href="https://zenmux.ai/aboutus"
          className="wc-sponsor-card wc-sponsor-card--with-logo wc-sponsor-card--right-bottom"
          rotate="-4deg"
          delay={0.6}
          logoSrc="/sponsor/zenmux.png"
          logoAlt="ZenMux"
          name="ZenMux"
          note={t("welcome.sponsor.cards.zenmux")}
        />
      </div>

      <div className="wc-welcome-actions absolute top-5 right-5 z-20 flex items-center gap-2">
        <div className="hidden sm:flex items-center gap-2">
          <LocaleSwitcher className="shrink-0" />
          <a
            href="https://github.com/oil-oil/wolfcha"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1 text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all group"
            title="View on GitHub"
          >
            <GithubLogo size={15} className="group-hover:scale-110 transition-transform" />
            <span className="hidden lg:inline">GitHub</span>
            <span className="flex items-center gap-1 text-[var(--color-gold)]">
              <Star size={12} weight="fill" className="group-hover:scale-110 transition-transform" />
              <span className="font-serif text-xs font-bold tabular-nums tracking-tight" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                {githubStars !== null ? githubStars.toLocaleString() : '···'}
              </span>
            </span>
          </a>
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsSponsorOpen(true)}
            className="h-8 text-xs gap-2"
          >
            <Handshake size={16} />
            {t("welcome.sponsor.action")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsGroupOpen(true)}
            className="h-8 text-xs gap-2"
          >
            <Users size={16} />
            {t("welcome.group.title")}
          </Button>

          {user ? (
            <button
              type="button"
              onClick={() => setIsUserProfileOpen(true)}
              className="hidden md:flex items-center gap-2 rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
              title={t("welcome.account.viewInfo")}
            >
              <UserCircle size={16} />
              <span className="truncate max-w-[160px]">{user.email ?? t("userProfile.loggedIn")}</span>
              {!customKeyEnabled && (
                <span className="opacity-70">{t("welcome.account.remaining", { count: creditsLoading ? "..." : (credits ?? 0) })}</span>
              )}
            </button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAuthOpen(true)}
              className="h-8 text-xs gap-2"
            >
              <UserCircle size={16} />
              {t("welcome.auth.signIn")}
            </Button>
          )}

          {user && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsUserProfileOpen(true)}
              className="h-8 text-xs gap-2 md:hidden"
            >
              <UserCircle size={16} />
              {t("welcome.account.info")}
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={() => setIsSetupOpen(true)}
            className="h-8 text-xs gap-2"
          >
            <GearSix size={16} />
            {t("welcome.settings")}
          </Button>
        </div>

        <div className="flex sm:hidden items-center gap-2">
          <LocaleSwitcher className="shrink-0" />
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsSponsorOpen(true)}
            className="h-8 text-xs gap-2"
          >
            <Handshake size={16} />
            {t("welcome.sponsor.short")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsGroupOpen(true)}
            className="h-8 text-xs gap-2"
          >
            <Users size={16} />
            {t("welcome.group.short")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsMobileMenuOpen(true)}
            className="h-8 w-8 px-0"
            aria-label={t("welcome.mobileMenu.more")}
          >
            <DotsThreeOutlineVertical size={18} />
          </Button>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.99, filter: "blur(10px)" }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.65, ease: "easeOut" }}
        className="relative z-10 w-full max-w-[460px] px-6"
      >
        <div ref={paperRef} className="wc-contract-paper">
          <div className="wc-contract-borders" aria-hidden="true" />

          {/* Mobile: inline sponsor stamps at top of paper */}
          <div className="wc-paper-sponsors sm:hidden">
            <a
              href="https://opencreator.io?promo=wolfcha"
              target="_blank"
              rel="noopener noreferrer"
              className="wc-paper-stamp"
              style={{ "--stamp-rotate": "-8deg" } as React.CSSProperties}
              onClick={() => void trackSponsorClick("opencreator")}
            >
              <img src="/sponsor/opencreator.png" alt="OpenCreator" className="wc-paper-stamp__logo" />
              <span className="wc-paper-stamp__name">OpenCreator</span>
            </a>
            <a
              href="https://bailian.console.aliyun.com/?ref=wolfcha"
              target="_blank"
              rel="noopener noreferrer"
              className="wc-paper-stamp"
              style={{ "--stamp-rotate": "4deg" } as React.CSSProperties}
              onClick={() => void trackSponsorClick("bailian")}
            >
              <img src="/sponsor/bailian.png" alt="百炼" className="wc-paper-stamp__logo" />
              <span className="wc-paper-stamp__name">百炼</span>
            </a>
            <a
              href="https://minimaxi.com/?ref=wolfcha"
              target="_blank"
              rel="noopener noreferrer"
              className="wc-paper-stamp"
              style={{ "--stamp-rotate": "6deg" } as React.CSSProperties}
              onClick={() => void trackSponsorClick("minimax")}
            >
              <img src="/sponsor/minimax.png" alt="Minimax" className="wc-paper-stamp__logo" />
              <span className="wc-paper-stamp__name">Minimax</span>
            </a>
            <a
              href="https://zenmux.ai/aboutus?ref=wolfcha"
              target="_blank"
              rel="noopener noreferrer"
              className="wc-paper-stamp"
              style={{ "--stamp-rotate": "-3deg" } as React.CSSProperties}
              onClick={() => void trackSponsorClick("zenmux")}
            >
              <img src="/sponsor/zenmux.png" alt="ZenMux" className="wc-paper-stamp__logo" />
              <span className="wc-paper-stamp__name">ZenMux</span>
            </a>
          </div>

          <div className="mt-2 text-center">
            <div className="mx-auto mb-4 h-12 w-12 items-center justify-center text-[var(--color-wolf)] opacity-90 hidden sm:flex">
              <PawPrint weight="fill" size={42} />
            </div>
            <div className="wc-contract-title">WOLFCHA</div>
            <div className="wc-contract-subtitle">{t("welcome.subtitle")}</div>
          </div>

          <div className="mt-7 text-center wc-contract-body">
            <div className="wc-contract-oath">
              {t("welcome.oath.line1")}
              <br />
              {t("welcome.oath.line2")}
              <br />
              {t("welcome.oath.line3")}
            </div>

            <div className="mt-8">
              <div className="wc-contract-label">{t("welcome.signature.label")}</div>
              <div className="relative mt-2">
                <input
                  type="text"
                  value={mounted ? humanName : ""}
                  onChange={(e) => setHumanName(e.target.value)}
                  placeholder={t("welcome.signature.placeholder")}
                  className="wc-signature-input"
                  autoComplete="off"
                  autoFocus
                  disabled={isLoading || isTransitioning}
                />
                <AnimatePresence>
                  {mounted && !!humanName.trim() && (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      className="wc-signature-ok"
                    >
                      <Sparkle weight="fill" size={18} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center gap-3">
            <div className="wc-seal-hint">
              {canConfirm ? t("welcome.sealHint.ready") : t("welcome.sealHint.waiting")}
            </div>
            <button
              ref={sealButtonRef}
              type="button"
              className="wc-wax-seal"
              onClick={handleConfirm}
              disabled={!canConfirm}
            >
              <FingerprintSimple weight="fill" size={44} className="wc-wax-seal-icon" />
            </button>
          </div>

          <div className="wc-corner-mark" aria-hidden="true">
            <WerewolfIcon size={30} className="text-[var(--color-wolf)] opacity-30" />
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {isTransitioning && (
          <motion.div
            className="wc-transition-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <motion.div
              className="wc-transition-text"
              initial={{ opacity: 0, y: 10, scale: 1.05, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              transition={{ delay: 0.18, duration: 0.55, ease: "easeOut" }}
            >
              <div className="wc-transition-title">{t("welcome.transition.title")}</div>
              <div className="wc-transition-subtitle">{t("welcome.transition.subtitle")}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>

    {showDevTools && (
      <>
        <DevModeButton
          onClick={() => {
            setIsDevModeEnabled(true);
            setIsDevConsoleOpen(true);
          }}
        />

        <AnimatePresence>
          {isDevConsoleOpen && (
            <motion.div
              initial={{ opacity: 0, x: 300 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 300 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="wc-dev-console fixed right-0 top-0 bottom-0 w-[400px] z-[120] bg-gray-900/95 backdrop-blur-md border-l border-gray-700 shadow-2xl flex flex-col"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800/50">
                <div className="flex items-center gap-2">
                  <Wrench size={20} className="text-yellow-400" />
                  <span className="font-bold text-white">{t("welcome.dev.title")}</span>
                </div>
                <button
                  onClick={() => setIsDevConsoleOpen(false)}
                  className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                  type="button"
                >
                  <span className="text-xl leading-none">×</span>
                </button>
              </div>

          <div className="flex border-b border-gray-700">
            <button
              type="button"
              onClick={() => setDevTab("preset")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${
                devTab === "preset"
                  ? "text-yellow-400 border-b-2 border-yellow-400 bg-gray-800/50"
                  : "text-gray-400 hover:text-white hover:bg-gray-800/30"
              }`}
            >
              {t("welcome.dev.tabs.preset")}
            </button>
            <button
              type="button"
              onClick={() => setDevTab("roles")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${
                devTab === "roles"
                  ? "text-yellow-400 border-b-2 border-yellow-400 bg-gray-800/50"
                  : "text-gray-400 hover:text-white hover:bg-gray-800/30"
              }`}
            >
              {t("welcome.dev.tabs.roles")}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {devTab === "preset" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-gray-300">{t("welcome.dev.preset.title")}</div>
                  <button
                    type="button"
                    onClick={() => setDevPreset("")}
                    className="text-xs text-gray-400 hover:text-white"
                  >
                    {t("welcome.dev.preset.clear")}
                  </button>
                </div>
                <select
                  value={devPreset}
                  onChange={(e) => setDevPreset(e.target.value as DevPreset | "")}
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                >
                  <option value="">{t("welcome.dev.preset.none")}</option>
                  <option value="MILK_POISON_TEST">{t("welcome.dev.preset.milkPoison")}</option>
                  <option value="LAST_WORDS_TEST">{t("welcome.dev.preset.lastWords")}</option>
                </select>
              </div>
            )}

            {devTab === "roles" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-gray-300">
                    {t("welcome.dev.roles.title", { count: playerCount })}
                  </div>
                  <div className={`text-xs ${roleConfigValid ? "text-green-400" : "text-gray-400"}`}>
                    {roleConfigValid ? t("welcome.dev.roles.ready") : roleConfigHint}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {fixedRoles.map((role, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="w-10 text-xs text-gray-400">
                        {t("welcome.dev.roles.seat", { seat: idx + 1 })}
                      </span>
                      <select
                        value={role}
                        onChange={(e) => {
                          const next = [...fixedRoles];
                          next[idx] = e.target.value as Role;
                          setFixedRoles(next);
                        }}
                        className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-yellow-400"
                      >
                        {roleOptions.map((r) => (
                          <option key={r} value={r}>
                            {roleLabels[r]}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
    )}
    </>
  );
}
