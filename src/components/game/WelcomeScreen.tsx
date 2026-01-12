"use client";

import { motion, AnimatePresence } from "framer-motion";
import { FingerprintSimple, PawPrint, Sparkle, Wrench } from "@phosphor-icons/react";
import { WerewolfIcon } from "@/components/icons/FlatIcons";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useRef, useState } from "react";
import { TutorialModal } from "@/components/game/TutorialModal";
import type { DevPreset, Role } from "@/types/game";
import { DevModeButton } from "@/components/DevTools";

interface WelcomeScreenProps {
  humanName: string;
  setHumanName: (name: string) => void;
  onStart: (fixedRoles?: Role[], devPreset?: DevPreset) => void | Promise<void>;
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

  // 调试面板状态
  const [isDevModeEnabled, setIsDevModeEnabled] = useState(false);
  const [isDevConsoleOpen, setIsDevConsoleOpen] = useState(false);
  const [devTab, setDevTab] = useState<"preset" | "roles">("preset");
  const [devPreset, setDevPreset] = useState<DevPreset | "">("");

  const roleOptions: Role[] = ["Villager", "Werewolf", "Seer", "Witch", "Hunter", "Guard"];
  const roleLabels: Record<Role, string> = {
    Villager: "村民",
    Werewolf: "狼人",
    Seer: "预言家",
    Witch: "女巫",
    Hunter: "猎人",
    Guard: "守卫",
  };

  const [fixedRoles, setFixedRoles] = useState<(Role | "")[]>(() => [
    "Villager",
    "Villager",
    "Villager",
    "Werewolf",
    "Werewolf",
    "Werewolf",
    "Seer",
    "Witch",
    "Hunter",
    "Guard",
  ]);

  const roleConfigValid = useMemo(() => {
    if (fixedRoles.length !== 10) return false;
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

    return (
      counts.Werewolf === 3 &&
      counts.Seer === 1 &&
      counts.Witch === 1 &&
      counts.Hunter === 1 &&
      counts.Guard === 1 &&
      counts.Villager === 3
    );
  }, [fixedRoles]);

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
    }, 800);
  };

  return (
    <>
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
              {canConfirm ? "按下印章以生效" : "签署名字后才可生效"}
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
          className="fixed right-0 top-0 bottom-0 w-[400px] z-[120] bg-gray-900/95 backdrop-blur-md border-l border-gray-700 shadow-2xl flex flex-col"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800/50">
            <div className="flex items-center gap-2">
              <Wrench size={20} className="text-yellow-400" />
              <span className="font-bold text-white">开发者模式</span>
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
              预设
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
              配置
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {devTab === "preset" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-gray-300">预设场景测试</div>
                  <button
                    type="button"
                    onClick={() => setDevPreset("")}
                    className="text-xs text-gray-400 hover:text-white"
                  >
                    清除
                  </button>
                </div>
                <select
                  value={devPreset}
                  onChange={(e) => setDevPreset(e.target.value as DevPreset | "")}
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                >
                  <option value="">无</option>
                  <option value="MILK_POISON_TEST">毒奶测试</option>
                  <option value="LAST_WORDS_TEST">遗言测试</option>
                </select>
              </div>
            )}

            {devTab === "roles" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-gray-300">身份配置（10人局）</div>
                  <div className={`text-xs ${roleConfigValid ? "text-green-400" : "text-gray-400"}`}>
                    {roleConfigValid ? "配置完成" : "需满足：3狼 预女猎守 3民"}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {fixedRoles.map((role, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="w-10 text-xs text-gray-400">{idx + 1}号</span>
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
  );
}
