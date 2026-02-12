"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Role } from "@/types/game";

const STORAGE_KEY = "wolfcha.tutorial.state";

type TutorialState = {
  enabled: boolean;
  seenNightIntro: boolean;
  seenDayIntro: boolean;
  seenRoles: Record<Role, boolean>;
};

const createDefaultRolesState = (): Record<Role, boolean> => ({
  Werewolf: false,
  Seer: false,
  Witch: false,
  Hunter: false,
  Guard: false,
  Idiot: false,
  WhiteWolfKing: false,
  Villager: false,
});

const defaultState: TutorialState = {
  enabled: true,
  seenNightIntro: false,
  seenDayIntro: false,
  seenRoles: createDefaultRolesState(),
};

const normalizeState = (value: Partial<TutorialState>): TutorialState => {
  const seenRoles = {
    ...createDefaultRolesState(),
    ...(value.seenRoles || {}),
  };

  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : defaultState.enabled,
    seenNightIntro: typeof value.seenNightIntro === "boolean" ? value.seenNightIntro : defaultState.seenNightIntro,
    seenDayIntro: typeof value.seenDayIntro === "boolean" ? value.seenDayIntro : defaultState.seenDayIntro,
    seenRoles,
  };
};

export function useTutorial() {
  const [state, setState] = useState<TutorialState>(defaultState);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setIsLoaded(true);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<TutorialState>;
      setState(normalizeState(parsed));
    } catch {
      setState(defaultState);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, isLoaded]);

  const setAutoPromptEnabled = useCallback((enabled: boolean) => {
    setState((prev) => ({ ...prev, enabled }));
  }, []);

  const markSeenNightIntro = useCallback(() => {
    setState((prev) => (prev.seenNightIntro ? prev : { ...prev, seenNightIntro: true }));
  }, []);

  const markSeenDayIntro = useCallback(() => {
    setState((prev) => (prev.seenDayIntro ? prev : { ...prev, seenDayIntro: true }));
  }, []);

  const markSeenRole = useCallback((role: Role) => {
    setState((prev) => {
      if (prev.seenRoles[role]) return prev;
      return {
        ...prev,
        seenRoles: {
          ...prev.seenRoles,
          [role]: true,
        },
      };
    });
  }, []);

  const resetTutorials = useCallback(() => {
    setState(defaultState);
  }, []);

  const hasSeenRole = useCallback(
    (role: Role) => {
      return !!state.seenRoles[role];
    },
    [state.seenRoles]
  );

  const canAutoPrompt = useMemo(() => state.enabled && isLoaded, [state.enabled, isLoaded]);

  return {
    state,
    isLoaded,
    canAutoPrompt,
    setAutoPromptEnabled,
    markSeenNightIntro,
    markSeenDayIntro,
    markSeenRole,
    resetTutorials,
    hasSeenRole,
  };
}
