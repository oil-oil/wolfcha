"use client";

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Microphone, SpinnerGap, StopCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

type RecorderStatus = "idle" | "recording" | "transcribing";
const STT_PROCESSING_EVENT = "wolfcha:stt-processing";

type BrowserSpeechRecognitionAlternative = {
  transcript: string;
  confidence: number;
};

type BrowserSpeechRecognitionResult = {
  isFinal: boolean;
  length: number;
  0: BrowserSpeechRecognitionAlternative;
  [index: number]: BrowserSpeechRecognitionAlternative;
};

type BrowserSpeechRecognitionResultList = {
  length: number;
  [index: number]: BrowserSpeechRecognitionResult;
};

type BrowserSpeechRecognitionEvent = Event & {
  resultIndex: number;
  results: BrowserSpeechRecognitionResultList;
};

type BrowserSpeechRecognitionErrorEvent = Event & {
  error: string;
  message?: string;
};

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: ((event: Event) => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: ((event: Event) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

interface VoiceRecorderProps {
  disabled?: boolean;
  isNight?: boolean;
  onTranscript: (text: string) => void;
}

export interface VoiceRecorderHandle {
  prepare: () => void;
  start: () => void;
  stop: () => void;
}

function formatDuration(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(s / 60)).padStart(1, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function getSpeechRecognitionCtor(): BrowserSpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const browserWindow = window as Window & typeof globalThis & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };
  return browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
}

function getBrowserSpeechLang(): string {
  if (typeof navigator === "undefined") return "zh-CN";
  return navigator.language || "zh-CN";
}

function WaveBars({ tone }: { tone: "gold" | "danger" }) {
  const barColor =
    tone === "danger" ? "bg-[var(--color-danger)]/80" : "bg-[var(--color-gold)]/80";
  return (
    <span className="inline-flex items-end gap-0.5 mr-1" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn("w-[2px] rounded-sm animate-pulse", barColor)}
          style={{
            height: 6 + ((i % 2) * 4 + 2),
            animationDelay: `${i * 120}ms`,
            animationDuration: "700ms",
          }}
        />
      ))}
    </span>
  );
}

export const VoiceRecorder = forwardRef<VoiceRecorderHandle, VoiceRecorderProps>(
  function VoiceRecorder({ disabled = false, isNight = false, onTranscript }, ref) {
    const t = useTranslations();
    const [status, setStatus] = useState<RecorderStatus>("idle");
    const [error, setError] = useState<string | null>(null);
    const [seconds, setSeconds] = useState(0);

    const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
    const browserTranscriptRef = useRef("");
    const browserHadFinalResultRef = useRef(false);
    const browserStopRequestedRef = useRef(false);
    const browserFallbackDisabledRef = useRef(false);
    const [browserRecognitionBlocked, setBrowserRecognitionBlocked] = useState(false);
    const timerRef = useRef<number | null>(null);

    const speechRecognitionCtor = useMemo(() => getSpeechRecognitionCtor(), []);
    const sttEnabled = Boolean(speechRecognitionCtor);
    const sttDisabled = disabled || !sttEnabled || browserRecognitionBlocked;
    const isRecording = status === "recording";
    const isBusy = status !== "idle";

    const clearTimer = useCallback(() => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setSeconds(0);
    }, []);

    const startTimer = useCallback(() => {
      clearTimer();
      timerRef.current = window.setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    }, [clearTimer]);

    const cleanupRecognition = useCallback(() => {
      const recognition = recognitionRef.current;
      if (recognition) {
        recognition.onstart = null;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
      }
      recognitionRef.current = null;
    }, []);

    const flushBrowserTranscript = useCallback(() => {
      const transcript = browserTranscriptRef.current.trim();
      browserTranscriptRef.current = "";
      browserHadFinalResultRef.current = false;

      if (!transcript) {
        setError(t("voiceRecorder.errors.noTranscript"));
        return;
      }

      onTranscript(transcript);
    }, [onTranscript, t]);

    useEffect(() => {
      return () => {
        cleanupRecognition();
        clearTimer();
      };
    }, [cleanupRecognition, clearTimer]);

    useEffect(() => {
      if (typeof window === "undefined") return;

      window.dispatchEvent(new CustomEvent(STT_PROCESSING_EVENT, {
        detail: { active: status !== "idle" },
      }));

      return () => {
        window.dispatchEvent(new CustomEvent(STT_PROCESSING_EVENT, {
          detail: { active: false },
        }));
      };
    }, [status]);

    const prepare = useCallback(() => {
      return;
    }, []);

    const start = useCallback(async () => {
      if (sttDisabled || isBusy || !speechRecognitionCtor) return;

      setError(null);
      browserTranscriptRef.current = "";
      browserHadFinalResultRef.current = false;
      browserStopRequestedRef.current = false;

      const recognition = new speechRecognitionCtor();
      recognitionRef.current = recognition;
      recognition.lang = getBrowserSpeechLang();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setStatus("recording");
        startTimer();
      };

      recognition.onresult = (event) => {
        let finalTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result?.isFinal) {
            finalTranscript += result[0]?.transcript || "";
          }
        }

        if (finalTranscript.trim()) {
          browserTranscriptRef.current = `${browserTranscriptRef.current} ${finalTranscript}`.trim();
          browserHadFinalResultRef.current = true;
        }
      };

      recognition.onerror = (event) => {
        const errorCode = event.error || "unknown";
        if (errorCode === "not-allowed" || errorCode === "service-not-allowed") {
          browserFallbackDisabledRef.current = true;
          setBrowserRecognitionBlocked(true);
        }

        if (errorCode !== "aborted") {
          if (errorCode === "no-speech") {
            setError(t("voiceRecorder.errors.noTranscript"));
          } else {
            setError(event.message || t("voiceRecorder.errors.sttFailed"));
          }
        }
      };

      recognition.onend = () => {
        clearTimer();
        cleanupRecognition();
        setStatus("idle");

        if (browserStopRequestedRef.current || browserHadFinalResultRef.current) {
          flushBrowserTranscript();
        }
      };

      try {
        recognition.start();
      } catch (error) {
        cleanupRecognition();
        clearTimer();
        setStatus("idle");
        setError(error instanceof Error ? error.message : t("voiceRecorder.errors.sttFailed"));
      }
    }, [cleanupRecognition, clearTimer, flushBrowserTranscript, isBusy, speechRecognitionCtor, startTimer, sttDisabled, t]);

    const stop = useCallback(() => {
      if (status === "idle") return;
      if (status === "transcribing") return;

      if (recognitionRef.current) {
        try {
          browserStopRequestedRef.current = true;
          setStatus("transcribing");
          clearTimer();
          recognitionRef.current.stop();
          return;
        } catch {
          cleanupRecognition();
          setStatus("idle");
          flushBrowserTranscript();
        }
      }
    }, [cleanupRecognition, clearTimer, flushBrowserTranscript, status]);

    useImperativeHandle(
      ref,
      () => ({
        prepare: () => {
          prepare();
        },
        start: () => {
          void start();
        },
        stop: () => {
          stop();
        },
      }),
      [prepare, start, stop]
    );

    const buttonClassName = cn(
      "h-8 px-3 rounded text-xs font-medium border transition-all flex items-center gap-1.5 cursor-pointer",
      sttDisabled || isBusy ? "opacity-40 cursor-not-allowed" : "",
      isRecording
        ? "border-[var(--color-danger)]/50 text-[var(--color-danger)] bg-transparent hover:bg-[var(--color-danger)]/10"
        : "border-[var(--color-gold)]/50 text-[var(--color-gold)] bg-transparent hover:bg-[var(--color-gold)]/10"
    );

    return (
      <div className="relative">
        <button
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={isRecording ? stop : start}
          disabled={sttDisabled || status === "transcribing"}
          className={buttonClassName}
          title={
            isRecording
              ? t("voiceRecorder.actions.stop")
              : sttEnabled
                ? t("voiceRecorder.actions.voiceInput")
                : t("voiceRecorder.errors.micUnavailable")
          }
        >
          {status === "transcribing" ? (
            <>
              <SpinnerGap size={14} className="animate-spin" weight="bold" />
              {t("voiceRecorder.status.transcribing")}
            </>
          ) : isRecording ? (
            <>
              <StopCircle size={14} weight="fill" />
              <WaveBars tone="danger" />
              {formatDuration(seconds)}
            </>
          ) : (
            <>
              <Microphone size={14} weight="fill" />
              {t("voiceRecorder.actions.holdToTalk")}
            </>
          )}
        </button>

        {(error || !sttEnabled) ? (
          <div
            className={cn(
              "absolute right-0 -top-5 text-[11px] whitespace-nowrap",
              isNight ? "text-white/55" : "text-[var(--text-muted)]"
            )}
          >
            {error || t("voiceRecorder.errors.micUnavailable")}
          </div>
        ) : null}
      </div>
    );
  }
);
