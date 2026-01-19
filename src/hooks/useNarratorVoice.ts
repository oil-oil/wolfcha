"use client";

import { useCallback, useRef, useState } from "react";
import { getNarratorAudioPath, type NarratorTextKey } from "@/lib/narrator-voice";

interface UseNarratorVoiceOptions {
  enabled?: boolean;
  volume?: number;
}

interface UseNarratorVoiceReturn {
  playNarrator: (key: NarratorTextKey) => Promise<void>;
  stopNarrator: () => void;
  isPlaying: boolean;
  currentKey: NarratorTextKey | null;
}

/**
 * 旁白语音播放 Hook
 * 播放预生成的旁白语音文件
 */
export function useNarratorVoice(options: UseNarratorVoiceOptions = {}): UseNarratorVoiceReturn {
  const { enabled = true, volume = 1.0 } = options;
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentKey, setCurrentKey] = useState<NarratorTextKey | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const stopNarrator = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsPlaying(false);
    setCurrentKey(null);
  }, []);

  const playNarrator = useCallback(async (key: NarratorTextKey): Promise<void> => {
    if (!enabled) return;

    // 停止当前播放
    stopNarrator();

    const audioPath = getNarratorAudioPath(key);
    
    return new Promise((resolve, reject) => {
      const audio = new Audio(audioPath);
      audio.volume = volume;
      audioRef.current = audio;
      
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const cleanup = () => {
        audio.onended = null;
        audio.onerror = null;
        audio.oncanplaythrough = null;
        setIsPlaying(false);
        setCurrentKey(null);
      };

      audio.oncanplaythrough = () => {
        if (controller.signal.aborted) {
          cleanup();
          resolve();
          return;
        }
        
        setIsPlaying(true);
        setCurrentKey(key);
        audio.play().catch((err) => {
          console.warn(`Failed to play narrator audio: ${key}`, err);
          cleanup();
          resolve(); // 不阻塞游戏流程
        });
      };

      audio.onended = () => {
        cleanup();
        resolve();
      };

      audio.onerror = (e) => {
        console.warn(`Narrator audio not found or failed to load: ${key}`, e);
        cleanup();
        resolve(); // 不阻塞游戏流程
      };

      // 设置超时，避免无限等待
      setTimeout(() => {
        if (!controller.signal.aborted && isPlaying) {
          cleanup();
          resolve();
        }
      }, 10000);
    });
  }, [enabled, volume, stopNarrator, isPlaying]);

  return {
    playNarrator,
    stopNarrator,
    isPlaying,
    currentKey,
  };
}
