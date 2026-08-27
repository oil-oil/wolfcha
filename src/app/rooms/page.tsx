"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RoomEntry } from "@/components/multiplayer/RoomEntry";
import { useMultiplayerRoom } from "@/hooks/useMultiplayerRoom";
import type { CreateMultiplayerRoomInput } from "@/types/multiplayer";
import styles from "@/components/multiplayer/multiplayer.module.css";

export default function RoomsPage() {
  const router = useRouter();
  const [redirectAfterRoom, setRedirectAfterRoom] = useState(false);
  const { view, status, authStatus, actionLoading, error, createRoom, joinRoom, retryConnection } = useMultiplayerRoom();
  useEffect(() => { if (redirectAfterRoom && view) router.push(`/rooms/${view.room.code}`); }, [redirectAfterRoom, router, view]);
  const handleCreate = async (input: CreateMultiplayerRoomInput) => { const result = await createRoom(input); if (result.ok) setRedirectAfterRoom(true); };
  const handleJoin = async (input: { code: string; displayName: string }) => { const result = await joinRoom(input); if (result.ok) setRedirectAfterRoom(true); };
  return <div className={styles.page}><div className={styles.container}><header className={styles.hero}><span className={styles.eyebrow}>Wolfcha · Multiplayer</span><h1>多人狼人杀</h1><p>邀请朋友进入同一间房，在真实的推理与协作中决出胜负。</p></header><RoomEntry authenticated={authStatus === "authenticated"} authLoading={authStatus === "loading"} loading={actionLoading} connectionStatus={status} error={error?.message} onRetryConnection={retryConnection} onCreate={handleCreate} onJoin={handleJoin} /></div></div>;
}
