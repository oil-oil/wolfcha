"use client";

import type { ComponentType } from "react";
import { motion } from "framer-motion";
import { UserCircle } from "@phosphor-icons/react";
import type { ModelRef, Player, Role } from "@/types/game";
import { buildSimpleAvatarUrl, getModelLogoUrl } from "@/lib/avatar-config";
import { useTranslations } from "next-intl";
import {
  WerewolfIcon,
  SeerIcon,
  WitchIcon,
  HunterIcon,
  GuardIcon,
  VillagerIcon,
} from "@/components/icons/FlatIcons";

export type RoleRevealEntry = {
  playerId?: string;
  seat: number;
  name?: string;
  role?: Role;
  isHuman?: boolean;
  modelRef?: ModelRef;
};

interface RoleRevealHistoryCardProps {
  title: string;
  entries: RoleRevealEntry[];
  players: Player[];
  isNight?: boolean;
  isGenshinMode?: boolean;
}

const getPlayerAvatarUrl = (player: Player, isGenshinMode: boolean) =>
  isGenshinMode && !player.isHuman
    ? getModelLogoUrl(player.agentProfile?.modelRef)
    : buildSimpleAvatarUrl(player.avatarSeed ?? player.playerId, { gender: player.agentProfile?.persona?.gender });

const ROLE_META: Record<Role, { Icon: ComponentType<{ size?: number; className?: string }>; color: string; bg: string }> = {
  Werewolf: { Icon: WerewolfIcon, color: "var(--color-wolf)", bg: "var(--color-wolf-bg)" },
  Seer: { Icon: SeerIcon, color: "var(--color-seer)", bg: "var(--color-seer-bg)" },
  Witch: { Icon: WitchIcon, color: "var(--color-witch)", bg: "var(--color-witch-bg)" },
  Hunter: { Icon: HunterIcon, color: "var(--color-hunter)", bg: "var(--color-hunter-bg)" },
  Guard: { Icon: GuardIcon, color: "var(--color-guard)", bg: "var(--color-guard-bg)" },
  Villager: { Icon: VillagerIcon, color: "var(--color-villager)", bg: "var(--color-villager-bg)" },
};

export function RoleRevealHistoryCard({
  title,
  entries,
  players,
  isNight = false,
  isGenshinMode = false,
}: RoleRevealHistoryCardProps) {
  const t = useTranslations();
  const roleLabels: Record<Role, string> = {
    Werewolf: t("roles.werewolf"),
    Seer: t("roles.seer"),
    Witch: t("roles.witch"),
    Hunter: t("roles.hunter"),
    Guard: t("roles.guard"),
    Villager: t("roles.villager"),
  };

  return (
    <div className={`rounded-lg border ${isNight ? "border-white/10 bg-black/20" : "border-[var(--border-color)] bg-[var(--bg-secondary)]"} p-4 my-3`}>
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[var(--border-color)]">
        <UserCircle size={18} weight="fill" className="text-[var(--color-accent)]" />
        <span className="text-sm font-semibold text-[var(--text-primary)]">{title}</span>
      </div>

      <div className="flex flex-col gap-2.5">
        {entries.map((entry, index) => {
          const matchedPlayer = entry.playerId
            ? players.find((p) => p.playerId === entry.playerId)
            : players.find((p) => p.seat === entry.seat);
          const seat = matchedPlayer?.seat ?? entry.seat;
          const displayName = matchedPlayer?.displayName ?? entry.name ?? t("common.unknown");
          const role = matchedPlayer?.role ?? entry.role ?? "Villager";
          const modelRef = matchedPlayer?.agentProfile?.modelRef ?? entry.modelRef;
          const { Icon, color, bg } = ROLE_META[role];

          return (
            <motion.div
              key={`${seat}-${displayName}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              className={`flex items-center gap-2 p-3.5 rounded-lg border ${
                isNight ? "bg-white/5 border-white/10" : "bg-white border-[var(--border-color)]"
              }`}
            >
              {matchedPlayer ? (
                <img
                  src={getPlayerAvatarUrl(matchedPlayer, isGenshinMode)}
                  alt={displayName}
                  className="w-11 h-11 rounded-full object-cover"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-black/10" aria-hidden="true" />
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="wc-seat-badge">{seat + 1}</span>
                      <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{displayName}</span>
                    </div>

                    <div className="mt-1.5 flex items-center gap-3">
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold w-fit"
                        style={{ color, background: bg }}
                      >
                        <Icon size={14} />
                        {roleLabels[role]}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] shrink-0">
                    {modelRef ? (
                      <>
                        <img
                          src={getModelLogoUrl(modelRef)}
                          alt={modelRef.model}
                          className="w-4 h-4 object-contain"
                        />
                        <span className="truncate max-w-[220px]" title={modelRef.model}>
                          {modelRef.model}
                        </span>
                      </>
                    ) : (
                      <>
                        <UserCircle size={12} />
                        <span>{t("specialEvents.roleRevealHuman")}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
