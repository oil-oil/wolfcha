"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { GameLoadingState } from "@/components/game/GameLoadingState";
import { CrowdCanvas } from "./CrowdCanvas";
import { MatchingSeats, type MatchingSeatsProps } from "./MatchingSeats";
import { MatchingAttribution } from "./MatchingAttribution";
import { RollingPlayerCount } from "./RollingPlayerCount";
import { getReadyPlayerIds, parseMatchingRoster, prepareMatchingPlayers, type MatchingRoster } from "./matching-roster";
import type { MatchedPlayer } from "./matching-characters";
import { buildMatchingCrowd } from "./matching-crowd";
import styles from "./matching.module.css";

export interface MatchingAnimationProps {
  roster: MatchingRoster;
  /** Optional controlled readiness. Add IDs as AI participants become ready. */
  readyPlayerIds?: readonly string[];
  className?: string;
  /** The real game can supply its player cards as the transfer destinations. */
  SeatsComponent?: ComponentType<MatchingSeatsProps>;
  onReady?: () => void;
  onProgress?: (entered: number, total: number) => void;
  onPlayerArrived?: (player: MatchedPlayer) => void;
  onComplete?: (players: readonly MatchedPlayer[]) => void;
  onError?: (message: string) => void;
}

function DataError({ message, onError, className = "" }: { message: string; onError?: MatchingAnimationProps["onError"]; className?: string }) {
  const t = useTranslations();
  const callback = useRef(onError);
  useEffect(() => { callback.current = onError; }, [onError]);
  useEffect(() => { callback.current?.(message); }, [message]);
  return <div className={`${styles.animation} ${className}`} data-matching-animation data-phase="error"><p className={styles.assetError} role="alert">{t("dialog.emptyState.rosterUnavailable")}</p></div>;
}

/** Receives an API roster; only public appearance data enters the scene. */
export function MatchingAnimation(props: MatchingAnimationProps) {
  let roster: MatchingRoster;
  let readyIds: string[];
  try {
    roster = parseMatchingRoster(props.roster);
    readyIds = getReadyPlayerIds(roster, props.readyPlayerIds);
  } catch (error) {
    return <DataError message={error instanceof Error ? error.message : "角色名单格式无效。"} onError={props.onError} className={props.className} />;
  }
  // Canonical JSON keeps a repeated/reordered API response from restarting.
  const manifest = JSON.stringify(roster);
  return <MatchingAnimationRound
    key={JSON.stringify([roster.roundId, roster.playerCount])}
    manifest={manifest} hasParticipants={roster.participants.length > 0} readyIdsJson={JSON.stringify(readyIds)}
    className={props.className} SeatsComponent={props.SeatsComponent} onReady={props.onReady} onProgress={props.onProgress}
    onPlayerArrived={props.onPlayerArrived} onComplete={props.onComplete} onError={props.onError}
  />;
}

type SessionProps = Omit<MatchingAnimationProps, "roster" | "readyPlayerIds"> & { manifest: string; readyIdsJson: string };

function MatchingAnimationRound({ hasParticipants, ...props }: SessionProps & { hasParticipants: boolean }) {
  const [identity, setIdentity] = useState({ manifest: props.manifest, hasParticipants, revision: 0 });
  if (identity.manifest !== props.manifest) {
    // The first API response joins the already walking crowd. Changing an
    // established roster cancels the prior selection and transfer instead.
    const firstResponse = !identity.hasParticipants && hasParticipants;
    setIdentity({ manifest: props.manifest, hasParticipants, revision: identity.revision + (firstResponse ? 0 : 1) });
  }
  return <MatchingAnimationSession key={identity.revision} {...props} />;
}

function MatchingAnimationSession({ manifest, readyIdsJson, className = "", SeatsComponent = MatchingSeats, ...callbacks }: SessionProps) {
  const t = useTranslations();
  const roster = useMemo(() => JSON.parse(manifest) as MatchingRoster, [manifest]);
  const players = useMemo(() => prepareMatchingPlayers(roster), [roster]);
  const crowdPlayers = useMemo(() => buildMatchingCrowd(players), [players]);
  const readyIds = useMemo(() => JSON.parse(readyIdsJson) as string[], [readyIdsJson]);
  const reducedMotion = useReducedMotion();
  const [entered, setEntered] = useState(0);
  const [departing, setDeparting] = useState(false);
  const [settled, setSettled] = useState(false);
  const [failed, setFailed] = useState(false);
  const [arrivedSeats, setArrivedSeats] = useState<number[]>([]);
  const avatarRefs = useRef(new Map<number, HTMLDivElement>());
  const events = useRef(callbacks);
  const completed = useRef(false);
  const errorReported = useRef(false);
  useEffect(() => { events.current = callbacks; });
  useEffect(() => { events.current.onProgress?.(entered, roster.playerCount); }, [entered, roster.playerCount]);
  useEffect(() => {
    if (!players.length || entered !== roster.playerCount) return;
    const timer = window.setTimeout(() => setDeparting(true), reducedMotion ? 0 : 500);
    return () => window.clearTimeout(timer);
  }, [entered, players.length, roster.playerCount, reducedMotion]);

  const registerAvatar = useCallback((seat: number, element: HTMLDivElement | null) => {
    if (element) avatarRefs.current.set(seat, element);
    else avatarRefs.current.delete(seat);
  }, []);
  const avatarForSeat = useCallback((seat: number) => avatarRefs.current.get(seat), []);
  const handleCountChange = useCallback((count: number) => {
    setEntered(count);
    if (count === 0) {
      setDeparting(false);
      setSettled(false);
      setArrivedSeats([]);
      avatarRefs.current.forEach((avatar) => avatar.style.setProperty("--arrival-progress", "0"));
    }
  }, []);
  const handleArrived = useCallback((seat: number) => {
    setArrivedSeats((previous) => previous.includes(seat) ? previous : [...previous, seat]);
    const player = players.find((entry) => entry.seat === seat);
    if (player) events.current.onPlayerArrived?.(player);
  }, [players]);
  const handleComplete = useCallback(() => {
    setSettled(true);
    if (completed.current) return;
    completed.current = true;
    events.current.onComplete?.(players);
  }, [players]);
  const handleError = useCallback(() => {
    if (errorReported.current) return;
    errorReported.current = true;
    setFailed(true);
    events.current.onError?.("角色图片未能加载，请重试。");
  }, []);
  const phase = failed ? "error" : settled ? "settled" : departing ? "arriving" : players.length ? "searching" : "waiting";

  return (
    <div className={`${styles.animation} ${className}`} data-matching-animation data-round-id={roster.roundId} data-phase={phase}>
      {failed ? <p className={styles.assetError} role="alert">{t("dialog.emptyState.avatarsUnavailable")}</p> : (
        <>
          <SeatsComponent players={players} totalSeats={roster.playerCount} visible={departing} arrivedSeats={arrivedSeats} onAvatarRef={registerAvatar} onAvatarError={handleError} />
          {!settled && (
            <div className={styles.loadingState} data-active={!departing} aria-hidden={departing} inert={departing}>
              <GameLoadingState showSupportingText={false} miniGameVariant="orb-rain" countDisplay={<RollingPlayerCount current={entered} total={roster.playerCount} />} />
            </div>
          )}
          <CrowdCanvas
            variant="matching"
            compact
            players={crowdPlayers}
            matchedPlayerIds={readyIds}
            totalSeats={roster.playerCount}
            status={departing ? "matched" : "searching"}
            avatarForSeat={avatarForSeat}
            onMatchedCountChange={handleCountChange}
            onReady={() => events.current.onReady?.()}
            onError={handleError}
            onSeatArrived={handleArrived}
            onTransitionComplete={handleComplete}
          />
        </>
      )}
      <MatchingAttribution />
    </div>
  );
}
