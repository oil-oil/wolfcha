"use client";

import { motion } from "framer-motion";

interface GameBackgroundProps {
  isNight: boolean;
}

function CornerDeco({ className }: { className: string }) {
  return (
    <svg className={`wc-corner-deco ${className}`} width="80" height="80" viewBox="0 0 80 80">
      {/* 严格对齐 style-unification-preview.html 的角纹样式 */}
      <path d="M10,10 L70,10" stroke="#8a1c1c" strokeWidth="2" fill="none" />
      <path d="M10,10 L10,70" stroke="#8a1c1c" strokeWidth="2" fill="none" />
      <circle cx="10" cy="10" r="4" fill="#c5a059" />
      <circle cx="70" cy="10" r="2" fill="#c5a059" opacity="0.5" />
      <circle cx="10" cy="70" r="2" fill="#c5a059" opacity="0.5" />
    </svg>
  );
}

export function GameBackground({ isNight }: GameBackgroundProps) {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden transition-colors duration-1000">
      {/* Day Background */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-br from-[var(--bg-day-from)] via-[var(--bg-day-via)] to-[var(--bg-day-to)]"
        initial={false}
        animate={{ opacity: isNight ? 0 : 1 }}
        transition={{ duration: 1.5 }}
      />

      {/* Night Background - 参考 style-unification-preview.html */}
      <motion.div
        className="absolute inset-0"
        style={{
          backgroundColor: "var(--bg-dark)",
          backgroundImage: `
            radial-gradient(circle at 50% 50%, rgba(138, 28, 28, 0.05), transparent 60%),
            url("data:image/svg+xml,%3Csvg width='200' height='200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.05'/%3E%3C/svg%3E")
          `,
        }}
        initial={false}
        animate={{ opacity: isNight ? 1 : 0 }}
        transition={{ duration: 1.5 }}
      />

      {/* 夜晚雾气效果 - 参考 waiting-preview.html */}
      <motion.div
        className="absolute inset-[-50%] pointer-events-none"
        style={{
          background: `
            radial-gradient(circle at 50% 50%, rgba(138, 28, 28, 0.05), transparent 60%),
            radial-gradient(circle at 20% 30%, rgba(0, 0, 0, 0.4), transparent 50%)
          `,
        }}
        initial={false}
        animate={{ 
          opacity: isNight ? 0.8 : 0,
          scale: isNight ? [1, 1.05, 1] : 1,
        }}
        transition={{ 
          opacity: { duration: 1.5 },
          scale: { duration: 10, repeat: Infinity, ease: "easeInOut" }
        }}
      />

      {/* 白天柔和光晕 */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={false}
        animate={{ opacity: isNight ? 0 : 0.3 }}
        transition={{ duration: 1.5 }}
      >
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-white rounded-full mix-blend-overlay filter blur-3xl opacity-20 animate-pulse" />
        <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-amber-200/20 rounded-full mix-blend-overlay filter blur-3xl opacity-20 animate-pulse" style={{ animationDelay: "1s" }} />
      </motion.div>

      {/* 夜晚血红光晕 */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={false}
        animate={{ opacity: isNight ? 0.4 : 0 }}
        transition={{ duration: 1.5 }}
      >
        <div 
          className="absolute top-1/3 left-1/3 w-96 h-96 rounded-full filter blur-[100px] animate-pulse"
          style={{ background: "rgba(138, 28, 28, 0.15)" }}
        />
        <div 
          className="absolute bottom-1/4 right-1/3 w-64 h-64 rounded-full filter blur-[80px] animate-pulse"
          style={{ background: "rgba(197, 160, 89, 0.08)", animationDelay: "2s" }}
        />
      </motion.div>

      {/* 装饰角纹 - 参考 style-unification-preview.html */}
      <motion.div
        initial={false}
        animate={{ opacity: isNight ? 0.3 : 0.15 }}
        transition={{ duration: 1.5 }}
      >
        <CornerDeco className="wc-corner-deco--tl" />
        <CornerDeco className="wc-corner-deco--tr" />
        <CornerDeco className="wc-corner-deco--bl" />
        <CornerDeco className="wc-corner-deco--br" />
      </motion.div>
    </div>
  );
}
