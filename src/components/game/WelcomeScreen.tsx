"use client";

import { motion, AnimatePresence } from "framer-motion";
import { FingerprintSimple, PawPrint, Sparkle } from "@phosphor-icons/react";
import { WerewolfIcon } from "@/components/icons/FlatIcons";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useRef, useState } from "react";
import { TutorialModal } from "@/components/game/TutorialModal";

interface WelcomeScreenProps {
  humanName: string;
  setHumanName: (name: string) => void;
  onStart: () => void;
  isLoading: boolean;
}

export function WelcomeScreen({
  humanName,
  setHumanName,
  onStart,
  isLoading,
}: WelcomeScreenProps) {
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const paperRef = useRef<HTMLDivElement | null>(null);
  const sealButtonRef = useRef<HTMLButtonElement | null>(null);

  const canConfirm = useMemo(() => {
    return !!humanName.trim() && !isLoading && !isTransitioning;
  }, [humanName, isLoading, isTransitioning]);

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

  const handleConfirm = async () => {
    if (!canConfirm) return;

    const seal = sealButtonRef.current;
    if (seal) createParticles(seal);

    setIsTransitioning(true);

    window.setTimeout(() => {
      void onStart();
    }, 1300);
  };

  return (
    <div className="wc-contract-screen selection:bg-[var(--color-accent)] selection:text-white">
      <div className="wc-contract-fog" aria-hidden="true" />
      <div className="wc-contract-vignette" aria-hidden="true" />

      <TutorialModal open={isTutorialOpen} onOpenChange={setIsTutorialOpen} />

      <div className="absolute top-6 right-6 z-20">
        <Button type="button" variant="outline" onClick={() => setIsTutorialOpen(true)} className="h-9 text-sm">
          玩法教学
        </Button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.99, filter: "blur(10px)" }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.65, ease: "easeOut" }}
        className="relative z-10 w-full max-w-[460px] px-6"
      >
        <div ref={paperRef} className="wc-contract-paper">
          <div className="wc-contract-borders" aria-hidden="true" />

          <div className="mt-2 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center text-[var(--color-wolf)] opacity-90">
              <PawPrint weight="fill" size={42} />
            </div>
            <div className="wc-contract-title">WOLFCHA</div>
            <div className="wc-contract-subtitle">The Shadow Game</div>
          </div>

          <div className="mt-7 text-center wc-contract-body">
            <div className="wc-contract-oath">
              我自愿加入这场关于谎言与真相的游戏。
              <br />
              当夜幕降临，我将隐藏我的身份；
              <br />
              当黎明升起，我将审判罪恶。
            </div>

            <div className="mt-8">
              <div className="wc-contract-label">签署你的名字</div>
              <div className="relative mt-2">
                <input
                  type="text"
                  value={humanName}
                  onChange={(e) => setHumanName(e.target.value)}
                  placeholder="Signature Here..."
                  className="wc-signature-input"
                  autoComplete="off"
                  disabled={isLoading || isTransitioning}
                />
                <AnimatePresence>
                  {!!humanName.trim() && (
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
              {isLoading ? "正在邀请其他玩家入场…" : canConfirm ? "按下印章以生效" : "签署名字后才可生效"}
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
              <div className="wc-transition-title">游戏开始</div>
              <div className="wc-transition-subtitle">The Game Begins</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
