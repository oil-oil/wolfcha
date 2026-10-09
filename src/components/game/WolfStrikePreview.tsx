"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { RotateCcw, Volume2, VolumeX } from "lucide-react";
import type { Player } from "@/types/game";
import { ALL_MODELS } from "@/types/game";
import { wolfStrikeForSeat } from "@/lib/wolf-strike";
import { getSkillTargetCursor, roleSkillForSeat, type RoleSkillType } from "@/lib/role-skill-effects";
import { SKILL_TARGET_CURSORS } from "@/lib/skill-cursors";
import { useWolfStrike } from "@/hooks/useWolfStrike";
import { useRoleSkillEffects } from "@/hooks/useRoleSkillEffects";
import { WerewolfIcon } from "@/components/icons/FlatIcons";
import { GameBackground } from "./GameBackground";
import { GameTopBar } from "./GameTopBar";
import { PlayerCardCompact } from "./PlayerCardCompact";
import { WolfStrikeOverlay } from "./WolfStrikeOverlay";
import { NightActionOverlay } from "./NightActionOverlay";
import styles from "./wolf-strike-preview.module.css";

const NAMES = ["小猹", "阿麦", "林间晚风", "桃子", "北斗", "橘子汽水", "阿白", "月半", "松果", "小满"];
const PLAYERS: Player[] = NAMES.map((displayName, seat) => ({
  playerId: `wolf-strike-preview-${seat}`,
  seat,
  displayName,
  avatarSeed: `wolfcha-match-${seat + 1}`,
  alive: true,
  role: seat === 0 || seat === 4 ? "Werewolf" : seat === 7 ? "Idiot" : "Villager",
  alignment: seat === 0 || seat === 4 ? "wolf" : "village",
  isHuman: seat === 0,
  agentProfile: {
    modelRef: ALL_MODELS[seat % ALL_MODELS.length],
    persona: { gender: seat % 2 ? "female" : "male", age: 25, mbti: "INTP", voiceRules: [], basicInfo: "" },
  },
}));

export function WolfStrikePreview({ initialSkill = "wolf", initialNight = true }: { initialSkill?: "wolf" | RoleSkillType; initialNight?: boolean }) {
  const [selectedSeat, setSelectedSeat] = useState(7);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [genshin, setGenshin] = useState(false);
  const [activeRole, setActiveRole] = useState<"wolf" | RoleSkillType>(initialSkill);
  const [isNight, setIsNight] = useState(initialNight);
  const [idiotRevealed, setIdiotRevealed] = useState(false);
  const [hunterHits, setHunterHits] = useState<Set<number>>(() => new Set());
  const [whiteWolfHits, setWhiteWolfHits] = useState<Set<number>>(() => new Set());
  const [guardTarget, setGuardTarget] = useState<number | null>(null);
  const [choosingTarget, setChoosingTarget] = useState(true);
  const mobileTrack = useRef<HTMLDivElement>(null);
  const previewRoot = useRef<HTMLDivElement>(null);
  const { strike, play, cancel } = useWolfStrike(soundEnabled, 0.65);
  const { event, play: playRole, cancel: cancelRole } = useRoleSkillEffects(soundEnabled, 0.65);
  const human: Player = { ...PLAYERS[0], role: activeRole === "wolf" ? "Werewolf" : activeRole === "seer" ? "Seer" : activeRole.startsWith("hunter") ? "Hunter" : activeRole === "idiot" ? "Idiot" : activeRole === "guard" ? "Guard" : activeRole === "white-wolf-king" ? "WhiteWolfKing" : "Witch" };
  const reset = (choose = false) => { cancel(); cancelRole(); setIdiotRevealed(false); setHunterHits(new Set()); setWhiteWolfHits(new Set()); setGuardTarget(null); setChoosingTarget(choose); };
  const skillTargetCursor = getSkillTargetCursor({ phase: isNight && activeRole === "seer" ? "NIGHT_SEER_ACTION" : isNight && activeRole === "guard" ? "NIGHT_GUARD_ACTION" : "DAY_SPEECH", nightActions: {} }, human, choosingTarget);
  const confirm = () => {
    if (activeRole === "wolf") { cancelRole(); play(selectedSeat); }
    else {
      cancel();
      if (activeRole === "seer" || activeRole === "guard") setChoosingTarget(false);
      if (activeRole === "guard") setGuardTarget(selectedSeat);
      if (activeRole === "idiot") setIdiotRevealed(true);
      if (activeRole === "hunter-ready") {
        if (hunterHits.has(selectedSeat)) return;
        setHunterHits((previous) => new Set(previous).add(selectedSeat));
      }
      if (activeRole === "white-wolf-king") {
        if (whiteWolfHits.has(selectedSeat)) return;
        setWhiteWolfHits(previous => new Set(previous).add(selectedSeat));
      }
      playRole(activeRole === "hunter-ready" ? "hunter-shot" : activeRole, activeRole === "idiot" ? 7 : selectedSeat);
    }
  };

  useEffect(() => {
    const root = previewRoot.current;
    root?.setAttribute("data-preview-ready", "true");
    return () => root?.removeAttribute("data-preview-ready");
  }, []);

  useEffect(() => {
    if (activeRole === "hunter-ready") playRole("hunter-ready", 0);
  }, [activeRole, playRole]);

  useEffect(() => {
    if (mobileTrack.current?.getBoundingClientRect().width) {
      mobileTrack.current.querySelector('[data-seat="' + selectedSeat + '"]')?.scrollIntoView({ block: "nearest", inline: "center" });
    }
  }, [selectedSeat]);

  useEffect(() => {
    const previous = document.documentElement.getAttribute("data-theme");
    document.documentElement.setAttribute("data-theme", isNight ? "dark" : "light");
    return () => {
      if (previous) document.documentElement.setAttribute("data-theme", previous);
      else document.documentElement.removeAttribute("data-theme");
    };
  }, [isNight]);

  const renderPlayer = (player: Player, mobile = false) => (
    <PlayerCardCompact
      key={player.playerId}
      player={hunterHits.has(player.seat) || whiteWolfHits.has(player.seat) || (player.isHuman && whiteWolfHits.size > 0) ? { ...player, alive: false } : player}
      humanPlayer={human}
      isSpeaking={false}
      canClick={!player.isHuman && !hunterHits.has(player.seat) && !whiteWolfHits.has(player.seat)}
      isSelected={player.seat === selectedSeat}
      onClick={() => setSelectedSeat(player.seat)}
      isNight={isNight}
      isGenshinMode={genshin}
      showRoleBadge={false}
      isInSelectionPhase
      selectionTone={activeRole.startsWith("hunter") ? "hunter" : activeRole === "seer" ? "seer" : activeRole === "guard" ? "guard" : activeRole === "wolf" || activeRole === "white-wolf-king" ? "wolf" : "witch"}
      variant={mobile ? "mobile" : "default"}
      facing={player.seat < 5 ? "right" : "left"}
      skipEntranceAnimation
      wolfStrike={wolfStrikeForSeat(strike, player.seat)}
      roleSkill={roleSkillForSeat(event, player.seat)}
      hunterLocked={activeRole.startsWith("hunter") && player.seat === selectedSeat}
      hunterHit={hunterHits.has(player.seat)}
      whiteWolfHit={whiteWolfHits.has(player.seat)}
      guardProtected={isNight && activeRole === "guard" && guardTarget === player.seat}
      isRevealedIdiot={idiotRevealed && player.seat === 7}
    />
  );

  return (
    <div ref={previewRoot} className={`${styles.preview} ${activeRole.startsWith("hunter") ? "wc-hunter-aiming" : ""}`}>
      <GameBackground isNight={isNight} />
      <div data-skill-surface className={styles.surface}>
      <GameTopBar
        day={1} aliveCount={10 - hunterHits.size - whiteWolfHits.size - (whiteWolfHits.size > 0 ? 1 : 0)} totalCount={10}
        phaseIcon={<WerewolfIcon size={14} />} phaseLabel="角色技能" roleLabel={activeRole === "wolf" ? "狼人" : activeRole === "seer" ? "预言家" : activeRole.startsWith("hunter") ? "猎人" : activeRole === "idiot" ? "白痴" : activeRole === "guard" ? "守卫" : activeRole === "white-wolf-king" ? "白狼王" : "女巫"}
        brandHref="/zh"
        onSettingsOpen={() => setSoundEnabled((enabled) => !enabled)}
        actions={
          <div className={styles.tools}>
            <select aria-label="角色技能" data-preview-action="role" value={activeRole} onChange={(e) => { reset(true); setActiveRole(e.target.value as typeof activeRole); }}>
              <option value="wolf">狼人爪击</option><option value="seer">预言家查验</option><option value="witch-poison">女巫毒药</option><option value="witch-save">女巫解药</option><option value="hunter-ready">猎人开枪</option><option value="idiot">白痴翻牌</option>
              <option value="guard">守卫守护</option><option value="white-wolf-king">白狼王自爆</option>
            </select>
            <button type="button" onClick={() => { reset(true); setIsNight((night) => !night); }} data-preview-action="day-night">{isNight ? "白天" : "夜晚"}</button>
            <button type="button" onClick={() => { reset(true); setGenshin((value) => !value); }} aria-pressed={genshin} data-preview-action="avatar-mode">{genshin ? "人物头像" : "原神模式"}</button>
            {(activeRole === "seer" || activeRole === "guard") && <button type="button" onClick={() => reset(!choosingTarget)} aria-label={choosingTarget ? "结束选择" : "重新选择"} data-preview-action="selection" data-choosing-target={choosingTarget}>{choosingTarget ? "结束选择" : "重新选择"}</button>}
            <button type="button" onClick={() => setSoundEnabled((enabled) => !enabled)} aria-label={soundEnabled ? "关闭音效" : "开启音效"} aria-pressed={soundEnabled} data-preview-action="sound">
              {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <button type="button" onClick={() => reset()} aria-label="复原" data-preview-action="cancel"><RotateCcw size={15} /></button>
          </div>
        }
      />
      <main className={styles.table} data-skill-cursor={skillTargetCursor ?? undefined} style={skillTargetCursor ? { "--wc-skill-cursor": SKILL_TARGET_CURSORS[skillTargetCursor] } as CSSProperties : undefined}>
        <div className={styles.players}>{PLAYERS.slice(0, 5).map((player) => renderPlayer(player))}</div>
        <section className={styles.dialog}>
          <div className={styles.heading}><span>{isNight ? "夜晚" : "白天"} · 第 1 天</span><span>角色技能</span></div>
          <div className={styles.stage}>
            <img className={styles.portrait} src={activeRole === "wolf" ? "/roles/werewolf.png" : activeRole === "seer" ? "/roles/seer.png" : activeRole.startsWith("hunter") ? "/roles/hunter.png" : activeRole === "idiot" ? "/roles/idiot.png" : activeRole === "guard" ? "/roles/guard.png" : activeRole === "white-wolf-king" ? "/roles/white-wolf-king.png" : "/roles/witch.png"} alt="" />
            <h1>{activeRole === "idiot" ? "白痴翻牌，留在场上。" : "请选择技能目标。"}</h1>
            <p>{activeRole === "idiot" ? "公开身份后，派对帽保留在 8 号玩家处。" : "点击玩家头像，再确认发动技能。"}</p>
          </div>
          <div className={styles.action}>
            <p>当前目标 <strong>{selectedSeat + 1} 号 · {PLAYERS[selectedSeat].displayName}</strong></p>
            <button type="button" onClick={confirm} data-preview-action="strike">{activeRole === "wolf" ? "确认出刀" : activeRole.startsWith("hunter") ? "确认开枪" : activeRole === "idiot" ? "发动技能" : "确认施放"}</button>
          </div>
        </section>
        <div className={styles.players}>{PLAYERS.slice(5).map((player) => renderPlayer(player))}</div>
        <div ref={mobileTrack} className={styles.mobilePlayers}>{PLAYERS.map((player) => renderPlayer(player, true))}</div>
      </main>
      </div>
      <WolfStrikeOverlay strike={strike} />
      <NightActionOverlay event={event} />
    </div>
  );
}
