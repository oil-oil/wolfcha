"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Play, User, Sparkle, Wrench } from "@phosphor-icons/react";
import { WerewolfIcon, SeerIcon, WitchIcon, HunterIcon } from "@/components/icons/FlatIcons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMemo, useState } from "react";
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
  const [isFocused, setIsFocused] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
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

  const handleStart = async () => {
    if (isLoading) return;
    const roles = isDevModeEnabled && roleConfigValid ? (fixedRoles as Role[]) : undefined;
    const preset = isDevModeEnabled ? (devPreset || undefined) : undefined;
    await onStart(roles, preset);
  };

  // Background floating icons configuration
  const floatingIcons = [
    { Icon: WerewolfIcon, delay: 0, x: -100, y: -50, scale: 1.2 },
    { Icon: SeerIcon, delay: 1.5, x: 120, y: -80, scale: 0.8 },
    { Icon: WitchIcon, delay: 0.8, x: -90, y: 100, scale: 0.9 },
    { Icon: HunterIcon, delay: 2.2, x: 100, y: 80, scale: 1.1 },
  ];

  return (
    <>
      <div className="h-screen w-full flex flex-col items-center justify-center bg-transparent overflow-hidden relative selection:bg-[var(--color-accent)] selection:text-white">
        {/* Decorative Background Pattern */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.03]">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,var(--color-accent)_0%,transparent_50%)]" />
        </div>

        {/* Floating Icons Animation */}
        {floatingIcons.map(({ Icon, delay, x, y, scale }, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: 0, y: 0 }}
            animate={{ 
              opacity: [0, 0.15, 0],
              x: [0, x],
              y: [0, y],
              rotate: [0, 10, -10, 0]
            }}
            transition={{
              duration: 8,
              delay: delay,
              repeat: Infinity,
              repeatType: "reverse",
              ease: "easeInOut"
            }}
            className="absolute text-[var(--color-accent)]"
            style={{ 
              left: '50%', 
              top: '50%',
              scale
            }}
          >
            <Icon size={120} />
          </motion.div>
        ))}

        <TutorialModal open={isTutorialOpen} onOpenChange={setIsTutorialOpen} />

        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.8, type: "spring", bounce: 0.3 }}
          className="z-10 w-full max-w-md px-8 flex flex-col items-center"
        >
        {/* Logo / Icon Section */}
        <motion.div
          className="relative mb-10"
          whileHover={{ scale: 1.05 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <div className="relative w-32 h-32 flex items-center justify-center">
            {/* Pulsing Glow */}
            <motion.div
              animate={{ 
                boxShadow: ["0 0 0 0px rgba(184, 134, 11, 0.1)", "0 0 0 20px rgba(184, 134, 11, 0)"]
              }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-[var(--color-accent)] to-[#8a6a1c] opacity-20 blur-xl"
            />
            {/* Main Icon Container */}
            <div className="relative w-28 h-28 bg-[var(--bg-card)] rounded-[2rem] shadow-2xl border-4 border-[var(--bg-secondary)] flex items-center justify-center overflow-hidden group">
              <motion.div
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              >
                <WerewolfIcon size={64} className="text-[var(--color-wolf)] drop-shadow-md" />
              </motion.div>
              
              {/* Shine effect on hover */}
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent translate-x-[-150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out" />
            </div>
            
            <motion.div 
              className="absolute -bottom-2 -right-2 bg-[var(--bg-main)] rounded-full p-2 shadow-lg border border-[var(--border-color)]"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5, type: "spring" }}
            >
              <Sparkle size={20} weight="fill" className="text-[var(--color-accent)]" />
            </motion.div>
          </div>
        </motion.div>

        {/* Title */}
        <div className="text-center mb-8 space-y-2">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-4xl font-black tracking-tight text-[var(--text-primary)] font-serif"
          >
            Wolfcha
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-[var(--text-secondary)] font-medium"
          >
            准备好了就开始吧。
          </motion.p>
        </div>

        {/* Interaction Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="w-full glass-panel glass-panel--strong p-1 rounded-2xl"
        >
          <div className="glass-panel glass-panel--weak shadow-none rounded-xl p-6 flex flex-col gap-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsTutorialOpen(true)}
              className="w-full h-10 text-sm font-semibold"
            >
              玩法教学 / 新手指南
            </Button>

            <div className="space-y-3">
              <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider ml-1 flex items-center gap-2">
                <User weight="bold" />
                你的称呼
              </label>
              <div className="relative group">
                <Input
                  type="text"
                  placeholder="你叫什么名字？"
                  value={humanName}
                  onChange={(e) => setHumanName(e.target.value)}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  className="h-14 bg-[var(--bg-card)] border-2 text-center text-lg transition-all duration-300 focus:scale-[1.02] placeholder:text-gray-400"
                  style={{
                    borderColor: isFocused ? 'var(--color-accent)' : 'var(--border-color)',
                    boxShadow: isFocused ? '0 4px 20px -5px rgba(184, 134, 11, 0.15)' : 'none'
                  }}
                />
                <AnimatePresence>
                  {humanName && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--color-success)] pointer-events-none"
                    >
                      <Sparkle weight="fill" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <Button
              onClick={handleStart}
              disabled={!humanName.trim() || isLoading}
              size="lg"
              className="w-full h-12 text-base font-bold shadow-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] relative overflow-hidden group cursor-pointer"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {isLoading ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    >
                      <Sparkle weight="bold" />
                    </motion.div>
                    正在邀请其他玩家…
                  </>
                ) : (
                  <>
                    <Play weight="fill" />
                    进入牌局
                  </>
                )}
              </span>
              
              {/* Button shine sweep animation */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out z-0" />
            </Button>
          </div>
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-8 flex items-center gap-4 text-xs text-[var(--text-muted)] opacity-60"
        >
          <span>10人局</span>
          <span className="w-1 h-1 rounded-full bg-current" />
          <span>预女猎守</span>
          <span className="w-1 h-1 rounded-full bg-current" />
          <span>3狼6民</span>
        </motion.div>
      </motion.div>
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
