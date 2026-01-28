"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "@phosphor-icons/react";
import type { Player } from "@/types/game";
import { 
  WerewolfIcon,
  SeerIcon,
  VillagerIcon,
  WitchIcon,
  HunterIcon,
  GuardIcon
} from "@/components/icons/FlatIcons";
import { buildSimpleAvatarUrl, getModelLogoUrl } from "@/lib/avatar-config";
import { useTranslations } from "next-intl";

interface PlayerDetailModalProps {
  player: Player | null;
  isOpen: boolean;
  onClose: () => void;
  humanPlayer?: Player | null;
  isGenshinMode?: boolean;
  isSpectatorMode?: boolean;
}

const getPlayerAvatarUrl = (player: Player, isGenshinMode: boolean) =>
  isGenshinMode && !player.isHuman
    ? getModelLogoUrl(player.agentProfile?.modelRef)
    : buildSimpleAvatarUrl(player.avatarSeed ?? player.playerId, { gender: player.agentProfile?.persona?.gender });

const getRoleIcon = (role: string, size: number = 20) => {
  switch (role) {
    case "Werewolf": return <WerewolfIcon size={size} />;
    case "Seer": return <SeerIcon size={size} />;
    case "Witch": return <WitchIcon size={size} />;
    case "Hunter": return <HunterIcon size={size} />;
    case "Guard": return <GuardIcon size={size} />;
    default: return <VillagerIcon size={size} />;
  }
};

// getRoleName is defined inside the component to use i18n translations

export function PlayerDetailModal({ player, isOpen, onClose, humanPlayer, isGenshinMode = false, isSpectatorMode = false }: PlayerDetailModalProps) {
  const t = useTranslations();
  const [renderPlayer, setRenderPlayer] = useState<Player | null>(player);

  useEffect(() => {
    if (player) {
      setRenderPlayer(player);
    }
  }, [player]);

  if (!renderPlayer) return null;

  const persona = renderPlayer.agentProfile?.persona;
  const modelLabel = renderPlayer.agentProfile?.modelRef?.model;
  const isMe = renderPlayer.isHuman;
  const showPersona = !!persona && !isGenshinMode;
  const isWolfTeammate = humanPlayer?.role === "Werewolf" && renderPlayer.role === "Werewolf" && !renderPlayer.isHuman;
  const canSeeRole = isMe || isWolfTeammate || !renderPlayer.alive || isSpectatorMode;
  const isIdentityReady = isMe ? !!renderPlayer.displayName?.trim() : !!persona;
  const avatarSrc = getPlayerAvatarUrl(renderPlayer, isGenshinMode);
  const roleLabels = useMemo<Record<string, string>>(() => ({
    Werewolf: t("roles.werewolf"),
    Seer: t("roles.seer"),
    Witch: t("roles.witch"),
    Hunter: t("roles.hunter"),
    Guard: t("roles.guard"),
    Villager: t("roles.villager"),
  }), [t]);
  const strategyLabels = useMemo<Record<string, string>>(() => ({
    aggressive: t("persona.strategy.aggressive"),
    safe: t("persona.strategy.safe"),
    balanced: t("persona.strategy.balanced"),
  }), [t]);
  const getRoleName = (role: string) => roleLabels[role] ?? t("roles.villager");
  const getStrategyLabel = (strategy?: string) => {
    if (!strategy) return strategyLabels.balanced;
    return strategyLabels[strategy] ?? strategyLabels.balanced;
  };
  const showModelTag = !!modelLabel && isGenshinMode && !renderPlayer.isHuman;

  return (
    <AnimatePresence
      onExitComplete={() => {
        if (!isOpen) {
          setRenderPlayer(null);
        }
      }}
    >
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          
          {/* 弹窗卡片 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="wc-player-detail-wrapper fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[360px] max-w-[90vw]"
          >
            <div className="wc-player-detail-modal wc-player-detail-content rounded-2xl overflow-hidden">
              {/* 头部 - 大头像区 */}
              <div className="wc-player-detail-header relative pt-8 pb-6 px-6 text-center bg-gradient-to-b from-[var(--color-accent-bg)] to-transparent">
                {/* 关闭按钮 */}
                <button
                  onClick={onClose}
                  className="wc-player-detail-close absolute top-3 right-3 w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 active:scale-[0.98] flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X size={16} weight="bold" />
                </button>

                {/* 头像 */}
                <div className="relative w-24 h-24 mx-auto mb-4">
                  <div className="absolute inset-0 bg-gradient-to-tr from-[var(--color-accent)]/30 to-transparent rounded-full blur-xl" />
                  {isIdentityReady ? (
                    <img
                      src={avatarSrc}
                      alt={renderPlayer.displayName}
                      className={`w-full h-full rounded-full border-4 border-white shadow-lg relative z-10 ${!renderPlayer.alive ? 'grayscale opacity-60' : ''}`}
                    />
                  ) : (
                    <div className="w-full h-full rounded-full border-4 border-white/50 bg-black/10 shadow-lg relative z-10" aria-hidden="true" />
                  )}
                  {!renderPlayer.alive && (
                    <div className="absolute inset-0 flex items-center justify-center z-20">
                      <span className="text-white font-bold text-sm bg-black/50 px-2 py-1 rounded">{t("playerDetail.out")}</span>
                    </div>
                  )}
                </div>

                {/* 座位号 + 名字 */}
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span className="text-xs font-bold bg-slate-800 text-white px-2 py-0.5 rounded">
                    {t("voteResult.seatLabel", { seat: renderPlayer.seat + 1 })}
                  </span>
                  {isMe && (
                    <span className="text-xs font-bold bg-[var(--color-accent)] text-white px-2 py-0.5 rounded">
                      {t("playerDetail.you")}
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-black text-[var(--text-primary)]">{renderPlayer.displayName}</h2>
                {showModelTag && (
                  <div className="mt-1 text-xs font-semibold text-[var(--text-muted)]">
                    {t("playerDetail.model", { model: modelLabel })}
                  </div>
                )}
                
                {/* 身份标签 - 仅可见时显示 */}
                {canSeeRole && (
                  <div className={`inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-sm font-bold ${
                    renderPlayer.role === "Werewolf" 
                      ? "bg-[var(--color-wolf-bg)] text-[var(--color-wolf)]" 
                      : "bg-[var(--color-accent-bg)] text-[var(--color-accent)]"
                  }`}>
                    {getRoleIcon(renderPlayer.role, 16)}
                    <span>{getRoleName(renderPlayer.role)}</span>
                  </div>
                )}
              </div>

              {/* 内容区 - 背景信息 */}
              <div className="px-6 pb-6 space-y-4">
                {showPersona && (
                  <>
                    {/* 性格标签 */}
                    <div className="flex flex-wrap gap-2">
                      <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-medium">
                        {persona.gender}
                      </span>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-medium">
                        {t("playerDetail.age", { age: persona.age })}
                      </span>
                      {modelLabel && (
                        <span
                          className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-medium max-w-full truncate"
                          title={modelLabel}
                        >
                          {t("playerDetail.model", { model: modelLabel })}
                        </span>
                      )}
                      <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                        {persona.mbti}
                      </span>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 font-medium">
                        {persona.styleLabel}
                      </span>
                      {persona.logicStyle && (
                        <span className="text-xs px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">
                          {persona.logicStyle}
                        </span>
                      )}
                    </div>

                    {/* 说话风格 */}
                    {persona.voiceRules && persona.voiceRules.length > 0 && (
                      <div>
                        <h4 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                          {t("playerDetail.voiceStyle")}
                        </h4>
                        <ul className="text-sm text-[var(--text-secondary)] space-y-1">
                          {persona.voiceRules.map((rule, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-[var(--color-accent)] mt-1">•</span>
                              <span>{rule}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                  </>
                )}

                {/* 人类玩家没有 persona */}
                {isMe && !persona && (
                  <div className="text-center py-4 text-[var(--text-muted)] text-sm">
                    {t("playerDetail.selfRole")}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
