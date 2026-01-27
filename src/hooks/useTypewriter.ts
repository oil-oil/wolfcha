"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const CHUNK_SIZE = 3; // characters per tick (faster for both Chinese and English)
const SPEED_MULTIPLIER = 0.7; // ~1.43x faster overall

interface UseTypewriterOptions {
  text: string;
  speed?: number; // ms per character (used to compute delay per chunk)
  enabled?: boolean;
  onComplete?: () => void;
}

export function useTypewriter({
  text,
  speed = 30,
  enabled = true,
  onComplete,
}: UseTypewriterOptions) {
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [completedText, setCompletedText] = useState<string | null>(null);
  const indexRef = useRef(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const reset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    indexRef.current = 0;
    setDisplayedText("");
    setIsTyping(false);
  }, []);

  useEffect(() => {
    if (!enabled || !text) {
      const next = text || "";
      queueMicrotask(() => {
        setDisplayedText(next);
        setIsTyping(false);
        setCompletedText(next);
      });
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    indexRef.current = 0;
    queueMicrotask(() => {
      setDisplayedText("");
      setIsTyping(true);
      setCompletedText(null);
    });

    const typeNextChunk = () => {
      if (indexRef.current >= text.length) {
        setIsTyping(false);
        setCompletedText(text);
        onComplete?.();
        return;
      }
      const advance = Math.min(CHUNK_SIZE, text.length - indexRef.current);
      indexRef.current += advance;
      setDisplayedText(text.slice(0, indexRef.current));

      // Base delay: faster (SPEED_MULTIPLIER) and scales with chunk size
      let delay = speed * advance * SPEED_MULTIPLIER;
      const lastChar = text[indexRef.current - 1];
      if (lastChar === "。" || lastChar === ".") delay *= 1.8;
      else if (lastChar === "，" || lastChar === ",") delay *= 1.2;
      else if (lastChar === "！" || lastChar === "!" || lastChar === "？" || lastChar === "?") delay *= 1.3;
      else if (lastChar === " ") delay *= 0.9;

      timeoutRef.current = setTimeout(typeNextChunk, Math.round(delay));
    };

    timeoutRef.current = setTimeout(typeNextChunk, Math.round(speed * SPEED_MULTIPLIER));

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [text, speed, enabled, onComplete]);

  return { displayedText, isTyping, completedText, reset };
}
