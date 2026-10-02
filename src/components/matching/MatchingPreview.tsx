"use client";

import { useCallback, useMemo, useState } from "react";
import { Play, RotateCcw, SlidersHorizontal, UserPlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { DayIcon } from "@/components/icons/FlatIcons";
import { GameBackground } from "@/components/game/GameBackground";
import { GameTopBar } from "@/components/game/GameTopBar";
import { SettingsModal } from "@/components/game/SettingsModal";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useSettings } from "@/hooks/useSettings";
import { createInitialGameState } from "@/lib/game-master";
import { CrowdCanvas } from "./CrowdCanvas";
import { MatchingAnimation } from "./MatchingAnimation";
import { MatchingAttribution } from "./MatchingAttribution";
import { createDemoRoster } from "./matching-fixtures";
import { parseMatchingRoster, type MatchingRoster } from "./matching-roster";
import styles from "./matching.module.css";

export function MatchingPreview() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { settings, setBgmVolume, setSoundEnabled, setAiVoiceEnabled, setAutoAdvanceDialogueEnabled, setSpectatorMode, setGenshinMode } = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewGameState] = useState(createInitialGameState);
  const [variant, setVariant] = useState<"original" | "matching">("matching");
  const [totalSeats, setTotalSeats] = useState(12);
  const [round, setRound] = useState(0);
  const [requestedCount, setRequestedCount] = useState(0);
  const [matchedCount, setMatchedCount] = useState(0);
  const [settled, setSettled] = useState(false);
  const [ready, setReady] = useState(false);
  const [awaitingRoster, setAwaitingRoster] = useState(false);
  const [importedRoster, setImportedRoster] = useState<MatchingRoster | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");

  const roster = useMemo(() => {
    const source = importedRoster ?? createDemoRoster(totalSeats, round);
    return { ...source, roundId: `${source.roundId}-${round}`, participants: awaitingRoster ? [] : source.participants };
  }, [importedRoster, totalSeats, round, awaitingRoster]);
  const readyPlayerIds = useMemo(() => roster.participants.slice(0, requestedCount).map((participant) => participant.playerId), [roster, requestedCount]);
  const matched = requestedCount === totalSeats;
  const handleReady = useCallback(() => setReady(true), []);
  const handleProgress = useCallback((count: number) => setMatchedCount(count), []);
  const handleComplete = useCallback(() => setSettled(true), []);

  const restart = () => {
    setRequestedCount(0);
    setMatchedCount(0);
    setSettled(false);
    setReady(false);
    setRound((value) => value + 1);
  };

  const openImport = () => {
    setImportText(JSON.stringify(importedRoster ?? createDemoRoster(totalSeats, round), null, 2));
    setImportError("");
    setImportOpen(true);
  };

  const importParticipants = () => {
    try {
      const data = parseMatchingRoster(JSON.parse(importText));
      if (!data.participants.length) throw new Error("请提供本局完整的 AI 角色名单。");
      restart();
      setImportedRoster(data);
      setTotalSeats(data.playerCount);
      setAwaitingRoster(false);
      setVariant("matching");
      setRequestedCount(data.playerCount);
      setImportOpen(false);
    } catch (error) {
      setImportError(error instanceof SyntaxError ? "这份内容还不是有效的 JSON，请检查格式。" : error instanceof Error ? error.message : "角色名单格式无效。");
    }
  };

  const playLabel = variant === "original" ? "重新播放原版动效" : settled ? "再看一次" : matched ? "重新匹配" : "演示匹配成功";
  const demoActions = (
    <div className={styles.demoActions} role="group" aria-label="匹配演示">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={styles.iconButton} data-demo-action="options" title="演示选项" aria-label="演示选项"><SlidersHorizontal size={15} /></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={10} className={styles.demoMenu}>
          <div className={styles.roomSize}>
            <label htmlFor="matching-seats">匹配人数</label>
            <select id="matching-seats" value={totalSeats} onKeyDown={(event) => event.stopPropagation()} onChange={(event) => { restart(); setImportedRoster(null); setAwaitingRoster(false); setTotalSeats(Number(event.target.value)); }}>
              {Array.from({ length: 7 }, (_, index) => index + 6).map((count) => <option key={count} value={count}>{count} 人局</option>)}
            </select>
          </div>
          <DropdownMenuItem onSelect={() => {
            setSpectatorMode(true);
            setGenshinMode(false);
            router.push(locale === "zh" ? "/zh" : "/");
          }}>进入全 AI 对局</DropdownMenuItem>
          <div className={styles.menuDivider} />
          <DropdownMenuItem onSelect={openImport}>导入本局角色</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => {
            const source = createDemoRoster(totalSeats, round + 1);
            restart();
            setImportedRoster({ ...source, participants: source.participants.map((player) => ({ ...player, avatarSeed: `wolfcha-preview-random-${round + 1}-${player.seat}` })) });
            setAwaitingRoster(false);
            setVariant("matching");
            setRequestedCount(totalSeats);
          }}>演示随机头像</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => {
            setVariant("matching");
            if (awaitingRoster) {
              setAwaitingRoster(false);
              setRequestedCount(totalSeats);
            } else {
              restart();
              setAwaitingRoster(true);
            }
          }}>{awaitingRoster ? "演示接口返回" : "演示等待接口"}</DropdownMenuItem>
          {importedRoster && <DropdownMenuItem onSelect={() => { restart(); setImportedRoster(null); setAwaitingRoster(false); }}>恢复示例名单</DropdownMenuItem>}
          <div className={styles.menuDivider} />
          <DropdownMenuCheckboxItem checked={variant === "matching"} onCheckedChange={() => { restart(); setAwaitingRoster(false); setVariant("matching"); }}>匹配动效</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={variant === "original"} onCheckedChange={() => { restart(); setVariant("original"); }}>原版动效</DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button type="button" className={styles.iconButton} data-demo-action="match-one" onClick={() => setRequestedCount((count) => Math.min(count + 1, totalSeats))} disabled={!ready || awaitingRoster || matched || variant === "original"} title={`匹配一位 · ${matchedCount}/${totalSeats}`} aria-label="匹配一位"><UserPlus size={15} /></button>
      <button type="button" className={styles.iconButton} data-demo-action="play" onClick={matched || variant === "original" ? restart : () => setRequestedCount(totalSeats)} disabled={!ready || (awaitingRoster && variant === "matching")} title={playLabel} aria-label={playLabel}>
        {matched || variant === "original" ? <RotateCcw size={15} /> : <Play size={15} />}
      </button>
    </div>
  );

  return (
    <div className={styles.preview}>
      <GameBackground isNight={false} />
      <GameTopBar day={0} aliveCount={totalSeats} totalCount={totalSeats} phaseIcon={<DayIcon size={14} />} phaseLabel={t("phase.lobby.description")} onSettingsOpen={() => setSettingsOpen(true)} actions={demoActions} brandHref="/" />
      {variant === "matching" ? (
        <MatchingAnimation roster={roster} readyPlayerIds={readyPlayerIds} onReady={handleReady} onProgress={handleProgress} onComplete={handleComplete} />
      ) : (
        <main className={styles.stage}>
          <CrowdCanvas key={`original-${round}`} variant="original" compact onReady={handleReady} />
          <MatchingAttribution original />
        </main>
      )}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className={styles.rosterDialog}>
          <DialogHeader>
            <DialogTitle>导入本局角色</DialogTitle>
            <DialogDescription>粘贴本局 6–12 位 AI 的信息，人物会按指定座位入场。seat 从 0 开始。</DialogDescription>
          </DialogHeader>
          <label htmlFor="matching-roster-json" className={styles.rosterLabel}>本局角色信息</label>
          <textarea id="matching-roster-json" className={styles.rosterInput} value={importText} onChange={(event) => { setImportText(event.target.value); setImportError(""); }} spellCheck={false} />
          {importError && <p className={styles.rosterError} role="alert">{importError}</p>}
          <button type="button" className={styles.importButton} onClick={importParticipants}>应用并演示入场</button>
        </DialogContent>
      </Dialog>
      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        gameState={previewGameState}
        bgmVolume={settings.bgmVolume}
        isSoundEnabled={settings.isSoundEnabled}
        isAiVoiceEnabled={settings.isAiVoiceEnabled}
        isAutoAdvanceDialogueEnabled={settings.isAutoAdvanceDialogueEnabled}
        onBgmVolumeChange={setBgmVolume}
        onSoundEnabledChange={setSoundEnabled}
        onAiVoiceEnabledChange={setAiVoiceEnabled}
        onAutoAdvanceDialogueEnabledChange={setAutoAdvanceDialogueEnabled}
      />
    </div>
  );
}
