"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

interface GameBackgroundProps {
  isNight: boolean;
}

export function GameBackground({ isNight }: GameBackgroundProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className="fixed inset-0 -z-10 bg-gradient-to-br from-[var(--bg-day-from)] via-[var(--bg-day-via)] to-[var(--bg-day-to)]"
      />
    );
  }

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden transition-colors duration-1000">
      {/* Day Background */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-br from-[var(--bg-day-from)] via-[var(--bg-day-via)] to-[var(--bg-day-to)]"
        initial={false}
        animate={{ opacity: isNight ? 0 : 1 }}
        transition={{ duration: 1.5 }}
      />

      {/* Night Background */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-br from-[var(--bg-night-from)] via-[var(--bg-night-via)] to-[var(--bg-night-to)]"
        initial={false}
        animate={{ opacity: isNight ? 1 : 0 }}
        transition={{ duration: 1.5 }}
      />

      {/* Floating Particles (Simplified for performance) */}
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-white rounded-full mix-blend-overlay filter blur-3xl opacity-20 animate-pulse" />
        <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-amber-200/20 rounded-full mix-blend-overlay filter blur-3xl opacity-20 animate-pulse" style={{ animationDelay: "1s" }} />
      </div>
    </div>
  );
}
