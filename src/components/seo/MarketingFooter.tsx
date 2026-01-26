"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { GithubLogo } from "@phosphor-icons/react";

export function MarketingFooter() {
  const t = useTranslations("seo.footer");
  const tNav = useTranslations("seo.nav");

  return (
    <footer className="border-t border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <img src="/brand/wolfcha-favicon.svg" alt="Wolfcha" className="h-8 w-8 grayscale opacity-80" />
              <span className="font-serif text-xl font-bold text-[var(--text-primary)] tracking-tight">Wolfcha</span>
            </div>
            <p className="max-w-xs text-sm text-[var(--text-secondary)] mb-6">
              {t("slogan")}
            </p>
            <div className="flex gap-4">
              <a
                href="https://github.com/oil-oil/wolfcha"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                <GithubLogo size={24} />
                <span className="sr-only">GitHub</span>
              </a>
            </div>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--text-primary)]">
              Product
            </h3>
            <ul className="space-y-3 text-sm text-[var(--text-secondary)]">
              <li>
                <Link href="/" className="hover:text-[var(--color-gold-dark)] transition-colors">
                  {tNav("home")}
                </Link>
              </li>
              <li>
                <Link href="/ai-models" className="hover:text-[var(--color-gold-dark)] transition-colors">
                  {tNav("models")}
                </Link>
              </li>
              <li>
                <Link href="/features" className="hover:text-[var(--color-gold-dark)] transition-colors">
                  {tNav("features")}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--text-primary)]">
              Support
            </h3>
            <ul className="space-y-3 text-sm text-[var(--text-secondary)]">
              <li>
                <Link href="/how-to-play" className="hover:text-[var(--color-gold-dark)] transition-colors">
                  {tNav("howTo")}
                </Link>
              </li>
              <li>
                <a 
                  href="https://github.com/oil-oil/wolfcha/issues" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[var(--color-gold-dark)] transition-colors"
                >
                  Report Issue
                </a>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="mt-12 border-t border-[var(--border-color)] pt-8 text-center text-sm text-[var(--text-muted)]">
          <p>© {new Date().getFullYear()} Wolfcha. Open Source under MIT License.</p>
        </div>
      </div>
    </footer>
  );
}
