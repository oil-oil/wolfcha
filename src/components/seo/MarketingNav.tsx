"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { GameController, BookOpen, Robot, Star } from "@phosphor-icons/react";
import { LocaleSwitcher } from "@/components/game/LocaleSwitcher";
import { Button } from "@/components/ui/button";

export function MarketingNav() {
  const t = useTranslations("seo.nav");
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: t("home"), icon: GameController },
    { href: "/ai-werewolf", label: "AI Werewolf", icon: null }, // Brand keyword, keep English or specialized
    { href: "/features", label: t("features"), icon: Star },
    { href: "/ai-models", label: t("models"), icon: Robot },
    { href: "/how-to-play", label: t("howTo"), icon: BookOpen },
  ];

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-[var(--border-color)] bg-[var(--topbar-bg)] backdrop-blur-[var(--glass-blur)]">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
            <img src="/brand/wolfcha-favicon.svg" alt="Wolfcha" className="h-8 w-8" />
            <span className="font-serif text-xl font-bold text-[var(--color-wolf)] tracking-tight">Wolfcha</span>
          </Link>
        </div>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-6">
          {navItems.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "text-[var(--color-gold-dark)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {item.icon && <item.icon size={16} />}
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          <Button asChild className="hidden sm:flex bg-[var(--color-gold)] hover:bg-[var(--color-gold-dark)] text-black border-none shadow-md">
            <Link href="/">
              {t("home")}
            </Link>
          </Button>
        </div>
      </div>
    </nav>
  );
}
