"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Play, User, Sparkle } from "@phosphor-icons/react";
import { WerewolfIcon, SeerIcon, WitchIcon, HunterIcon } from "@/components/icons/FlatIcons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";

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
  const [isFocused, setIsFocused] = useState(false);

  // Background floating icons configuration
  const floatingIcons = [
    { Icon: WerewolfIcon, delay: 0, x: -100, y: -50, scale: 1.2 },
    { Icon: SeerIcon, delay: 1.5, x: 120, y: -80, scale: 0.8 },
    { Icon: WitchIcon, delay: 0.8, x: -90, y: 100, scale: 0.9 },
    { Icon: HunterIcon, delay: 2.2, x: 100, y: 80, scale: 1.1 },
  ];

  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-[var(--bg-main)] overflow-hidden relative selection:bg-[var(--color-accent)] selection:text-white">
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
            AI 驱动的狼人杀世界
          </motion.p>
        </div>

        {/* Interaction Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="w-full bg-[var(--bg-card)]/80 backdrop-blur-sm p-1 rounded-2xl border border-[var(--border-color)] shadow-xl"
        >
          <div className="bg-[var(--bg-main)]/50 rounded-xl p-6 flex flex-col gap-6">
            <div className="space-y-3">
              <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider ml-1 flex items-center gap-2">
                <User weight="bold" />
                Your Identity
              </label>
              <div className="relative group">
                <Input
                  type="text"
                  placeholder="输入你的名字..."
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
              onClick={onStart}
              disabled={!humanName.trim() || isLoading}
              size="lg"
              className="w-full h-12 text-base font-bold shadow-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] relative overflow-hidden group"
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
                    正在生成角色...
                  </>
                ) : (
                  <>
                    <Play weight="fill" />
                    开始游戏
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
          <span>AI 对战</span>
        </motion.div>
      </motion.div>
    </div>
  );
}
