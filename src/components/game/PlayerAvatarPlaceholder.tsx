"use client";

import { motion } from "framer-motion";
import { Sparkle } from "@phosphor-icons/react";

export function PlayerAvatarPlaceholder() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full h-full flex items-center justify-center bg-black/10">
      <div className="relative flex items-center justify-center">
        <motion.div className="absolute inset-0 rounded-full border border-[var(--color-gold)]/25" style={{ width: 46, height: 46 }} animate={{ rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: "linear" }} />
        <motion.div className="absolute inset-2 rounded-full border border-dashed border-[var(--color-blood)]/30" animate={{ rotate: -360, opacity: [0.4, 0.9, 0.4] }} transition={{ duration: 4.8, repeat: Infinity, ease: "linear" }} />
        <div className="absolute inset-0 bg-[var(--color-gold)]/20 blur-xl rounded-full animate-pulse" />
        <Sparkle size={22} weight="fill" className="text-[var(--text-secondary)]/45 animate-[spin_5s_linear_infinite]" />
      </div>
    </motion.div>
  );
}
