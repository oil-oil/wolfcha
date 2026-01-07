"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface UseTypewriterOptions {
  text: string;
  speed?: number; // ms per character
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
      setDisplayedText(text || "");
      setIsTyping(false);
      return;
    }

    // If text changed, reset and start typing
    reset();
    setIsTyping(true);

    const typeNextChar = () => {
      if (indexRef.current < text.length) {
        indexRef.current++;
        setDisplayedText(text.slice(0, indexRef.current));
        
        // Variable speed for more natural effect
        const char = text[indexRef.current - 1];
        let delay = speed;
        if (char === "，" || char === ",") delay = speed * 3;
        else if (char === "。" || char === ".") delay = speed * 5;
        else if (char === "！" || char === "!") delay = speed * 4;
        else if (char === "？" || char === "?") delay = speed * 4;
        else if (char === " ") delay = speed * 0.5;
        
        timeoutRef.current = setTimeout(typeNextChar, delay);
      } else {
        setIsTyping(false);
        onComplete?.();
      }
    };

    timeoutRef.current = setTimeout(typeNextChar, speed);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [text, speed, enabled, onComplete, reset]);

  return { displayedText, isTyping, reset };
}
