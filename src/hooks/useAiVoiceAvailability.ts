"use client";

import { useSyncExternalStore } from "react";
import { isAiVoiceAvailable, MODEL_SOURCE_CHANGE_EVENT } from "@/lib/api-keys";

function subscribe(onChange: () => void) {
  window.addEventListener(MODEL_SOURCE_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(MODEL_SOURCE_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useAiVoiceAvailability(): boolean {
  return useSyncExternalStore(subscribe, isAiVoiceAvailable, () => false);
}
