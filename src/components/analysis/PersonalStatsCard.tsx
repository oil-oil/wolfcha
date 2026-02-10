"use client";

import { useEffect, useRef, useState } from "react";
import { Scroll, Quote, ThumbsUp, Brain, X, ChevronDown, ChevronUp } from "lucide-react";
import Image from "next/image";
import type { PersonalStats } from "@/types/analysis";
import { RADAR_LABELS_VILLAGE, RADAR_LABELS_WOLF } from "@/types/analysis";
import { TAG_ILLUSTRATIONS, TAG_CONDITIONS, ALL_TAGS } from "./constants";


interface PersonalStatsCardProps {
  stats: PersonalStats;
  overrideTag?: string | null;
  onOverrideTagChange?: (tag: string | null) => void;
}

interface TitleSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTag: string;
  onSelectTag: (tag: string) => void;
}

function TitleSelectorModal({ isOpen, onClose, currentTag, onSelectTag }: TitleSelectorModalProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-[var(--bg-card)] border border-[var(--color-gold)]/20 rounded-lg p-4 max-w-sm w-full mx-4 shadow-xl max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--color-gold)]/10">
          <h4 className="text-sm font-bold text-[var(--color-gold)]">选择称号</h4>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 space-y-2">
          {ALL_TAGS.map((group) => (
            <div key={group.category} className="bg-white/5 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedCategory(expandedCategory === group.category ? null : group.category)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-[var(--text-primary)] hover:bg-white/5 transition-colors"
              >
                <span>{group.category}</span>
                {expandedCategory === group.category ? (
                  <ChevronUp className="w-3 h-3 text-[var(--text-muted)]" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" />
                )}
              </button>
              {expandedCategory === group.category && (
                <div className="px-2 pb-2 grid grid-cols-2 gap-1.5">
                  {group.tags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => {
                        onSelectTag(tag);
                        onClose();
                      }}
                      className={`px-2 py-1.5 rounded text-[10px] transition-all ${
                        currentTag === tag
                          ? "bg-[var(--color-gold)] text-black font-bold"
                          : "bg-white/10 text-[var(--text-secondary)] hover:bg-[var(--color-gold)]/20 hover:text-[var(--color-gold)]"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-[var(--color-gold)]/10 text-[10px] text-[var(--text-muted)] text-center">
          当前称号: <span className="text-[var(--color-gold)]">{currentTag}</span>
        </div>
      </div>
    </div>
  );
}

export function PersonalStatsCard({ stats, overrideTag, onOverrideTagChange }: PersonalStatsCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showTitleSelector, setShowTitleSelector] = useState(false);

  const isWolf = stats.alignment === "wolf";
  const radarLabels = isWolf ? RADAR_LABELS_WOLF : RADAR_LABELS_VILLAGE;
  const primaryTag = overrideTag || stats.tags[0] || "待评估";
  const illustrationSrc = TAG_ILLUSTRATIONS[primaryTag] || TAG_ILLUSTRATIONS["default"];
  const tagCondition = TAG_CONDITIONS[primaryTag] || TAG_CONDITIONS["待评估"];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 40;

    const dataValues = [
      stats.radarStats.logic,
      stats.radarStats.speech,
      stats.radarStats.survival,
      stats.radarStats.skillOrHide,
      stats.radarStats.voteOrTicket,
    ];

    ctx.clearRect(0, 0, width, height);

    const goldColor = "#c5a059";
    const goldAlpha = "rgba(197, 160, 89, 0.1)";

    for (let level = 5; level >= 1; level--) {
      const levelRadius = (radius * level) / 5;
      ctx.beginPath();
      for (let i = 0; i <= 5; i++) {
        const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        const x = centerX + Math.cos(angle) * levelRadius;
        const y = centerY + Math.sin(angle) * levelRadius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = goldAlpha;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    for (let i = 0; i < 5; i++) {
      const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(x, y);
      ctx.strokeStyle = goldAlpha;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(197, 160, 89, 0.5)");
    gradient.addColorStop(1, "rgba(197, 160, 89, 0.1)");

    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      const value = dataValues[i] / 100;
      const x = centerX + Math.cos(angle) * radius * value;
      const y = centerY + Math.sin(angle) * radius * value;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = goldColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    for (let i = 0; i < 5; i++) {
      const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      const value = dataValues[i] / 100;
      const x = centerX + Math.cos(angle) * radius * value;
      const y = centerY + Math.sin(angle) * radius * value;

      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#1a1614";
      ctx.fill();
      ctx.strokeStyle = goldColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.font = "bold 11px 'Noto Serif SC', serif";
    ctx.fillStyle = goldColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let i = 0; i < 5; i++) {
      const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      const labelRadius = radius + 20;
      const x = centerX + Math.cos(angle) * labelRadius;
      const y = centerY + Math.sin(angle) * labelRadius;
      
      // Draw label with score
      const score = dataValues[i];
      ctx.fillText(`${radarLabels[i]} ${score}`, x, y);
    }
  }, [stats.radarStats, radarLabels]);

  return (
    <section className="analysis-card rounded-xl p-5 space-y-5">
      {/* Header: 标题 + 评分 */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold flex items-center gap-2 text-[var(--text-primary)]">
          <Scroll className="w-5 h-5 text-[var(--color-gold)]/80" />
          个人战绩
        </h3>
      </div>

      {/* 称号立绘 + 称号名称 */}
      {illustrationSrc && (
        <div className="flex flex-col items-center">
          <div 
            className="relative w-full max-w-[280px] aspect-[16/10] rounded-lg overflow-hidden border border-[var(--color-gold)]/25 shadow-[0_0_20px_rgba(197,160,89,0.15)]"
          >
            <Image
              src={illustrationSrc}
              alt={primaryTag}
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          </div>

          <div className="mt-3 text-center">
            <div className="relative inline-flex items-center justify-center min-w-[140px] py-1.5 px-5">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--color-gold)]/12 to-transparent" />
              <div className="absolute top-0 left-1/4 right-1/4 h-[1px] bg-gradient-to-r from-transparent via-[var(--color-gold)]/50 to-transparent" />
              <div className="absolute bottom-0 left-1/4 right-1/4 h-[1px] bg-gradient-to-r from-transparent via-[var(--color-gold)]/50 to-transparent" />
              <span 
                className="text-lg font-black text-[var(--color-gold)] tracking-[0.25em] relative z-10"
                style={{ 
                  textShadow: "0 2px 4px rgba(0,0,0,0.8), 0 0 16px rgba(197,160,89,0.3)",
                  fontFamily: "'Noto Serif SC', serif"
                }}
              >
                {primaryTag}
              </span>
            </div>
            <div className="text-[10px] text-[var(--text-muted)]/60 mt-1 leading-relaxed">
              {tagCondition}
            </div>
          </div>

        </div>
      )}

      {/* 综合评分 + 雷达图 */}
      <div className="bg-[#0f0e0c]/60 rounded-lg p-4 border border-[var(--color-gold)]/8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-[var(--text-muted)] tracking-widest uppercase">综合评分</span>
          <div className="text-2xl font-bold text-[var(--color-gold)] drop-shadow-lg">
            {stats.totalScore}
            <span className="text-xs text-[var(--color-gold)]/50 ml-0.5">pts</span>
          </div>
        </div>

        <div className="relative w-full aspect-square max-h-[240px] mx-auto">
          <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(197,160,89,0.03)_0%,transparent_70%)] pointer-events-none" />
          <canvas ref={canvasRef} className="w-full h-full" />
        </div>
      </div>

      <TitleSelectorModal
        isOpen={showTitleSelector}
        onClose={() => setShowTitleSelector(false)}
        currentTag={primaryTag}
        onSelectTag={(tag) => onOverrideTagChange?.(tag)}
      />

      {/* 高光语录 */}
      <div className="bg-[#141210] border border-[var(--color-gold)]/10 rounded-lg p-4 relative">
        <Quote className="absolute top-3 left-3 w-6 h-6 text-[var(--color-gold)]/20" />
        <p className="text-sm text-[var(--text-secondary)] italic text-center px-4 py-2 leading-relaxed">
          {stats.highlightQuote ? `"${stats.highlightQuote}"` : "未发言"}
        </p>
        <div className="flex justify-center mt-3 gap-4 text-[10px] text-[var(--color-gold)]/60 tracking-wider">
          <span className="flex items-center gap-1.5">
            <ThumbsUp className="w-3 h-3" /> HIGHLIGHT
          </span>
          <span className="flex items-center gap-1.5">
            <Brain className="w-3 h-3" /> BEST LOGIC
          </span>
        </div>
      </div>
    </section>
  );
}
