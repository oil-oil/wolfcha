"use client";

import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { WerewolfIcon } from "@/components/icons/FlatIcons";
import type { Player } from "@/types/game";

interface StageDisplayProps {
  player?: Player;
  text: string;
  isTyping: boolean;
  phase: string;
}

const dicebearUrl = (seed: string) =>
  `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=e8d5c4`;

export function StageDisplay({ player, text, isTyping, phase }: StageDisplayProps) {
  // 简单的淡入动画
  const variants = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    visible: { opacity: 1, y: 0, scale: 1 },
  };

  return (
    <div className="w-full flex flex-col items-center justify-center py-6 min-h-[300px] relative z-10">
      {/* 聚光灯效果背景 */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-gradient-to-b from-white/10 to-transparent blur-3xl -z-10 pointer-events-none rounded-full" />

      {/* 角色立绘/大头像 */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={variants}
        transition={{ duration: 0.5, type: "spring" }}
        className="relative mb-6 group"
      >
        <div className="relative w-32 h-32 md:w-40 md:h-40">
          {/* 光晕 */}
          <div className="absolute inset-0 bg-amber-400/20 rounded-full blur-xl animate-pulse" />
          
          <div className="relative w-full h-full rounded-full overflow-hidden border-4 border-white/30 shadow-2xl bg-white/10 backdrop-blur-sm">
            {player ? (
              <img
                src={dicebearUrl(player.playerId)}
                alt={player.displayName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-black/10">
                <WerewolfIcon size={48} className="opacity-50" />
              </div>
            )}
          </div>

          {/* 身份/座位标记 */}
          {player && (
            <div className="absolute -bottom-2 -right-2 flex flex-col items-center">
              <span className="bg-slate-800 text-white text-xs font-bold px-2 py-0.5 rounded shadow-lg border border-white/20">
                {player.seat + 1}号
              </span>
            </div>
          )}
        </div>
      </motion.div>

      {/* 名字 & 状态 */}
      <div className="text-center mb-6">
        <h3 className="text-xl md:text-2xl font-black font-serif tracking-tight text-[var(--text-primary)] drop-shadow-sm flex items-center justify-center gap-2">
          {player ? player.displayName : "系统"}
          {isTyping && (
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-[var(--color-accent)] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 bg-[var(--color-accent)] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 bg-[var(--color-accent)] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
          )}
        </h3>
        {phase && <p className="text-xs font-medium opacity-60 mt-1 uppercase tracking-widest">{phase}</p>}
      </div>

      {/* 对话气泡 (Glassmorphism) */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        key={text} // Re-animate on text change
        className="w-full max-w-2xl px-6"
      >
        <div className="glass-panel rounded-2xl p-6 md:p-8 relative overflow-hidden shadow-xl">
           {/* 装饰引号 */}
           <div className="absolute top-2 left-4 text-4xl font-serif opacity-10 pointer-events-none">“</div>
           
           <div className="relative z-10 text-lg md:text-xl font-serif leading-relaxed text-[var(--text-primary)] text-center min-h-[80px] flex items-center justify-center">
             <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
               p: ({node, ...props}) => <p {...props} className="inline" /> // inline paragraph
             }}>
               {text || "..."}
             </ReactMarkdown>
             {isTyping && <span className="inline-block w-0.5 h-[1.2em] bg-[var(--color-accent)] animate-[blink_1s_step-end_infinite] align-text-bottom ml-1" />}
           </div>

           <div className="absolute bottom-2 right-4 text-4xl font-serif opacity-10 pointer-events-none transform rotate-180">“</div>
        </div>
      </motion.div>
    </div>
  );
}
