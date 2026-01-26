
"use client";

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Microphone, SpinnerGap, StopCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

type RecorderStatus = "idle" | "recording" | "transcribing";

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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;

  const samples = new Float32Array(numFrames * numChannels);
  for (let ch = 0; ch < numChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < numFrames; i++) {
      samples[i * numChannels + ch] = data[i];
    }
  }

  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * blockAlign;
  const bufferSize = 44 + dataSize;
  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");

  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);

  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]));
    const v = x < 0 ? x * 0x8000 : x * 0x7fff;
    view.setInt16(offset, Math.round(v), true);
    offset += 2;
  }

  return arrayBuffer;
}

async function decodeToWav(blob: Blob): Promise<Uint8Array> {
  const ab = await blob.arrayBuffer();
  const AudioContextCtor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
  if (!AudioContextCtor) {
    throw new Error("AudioContext is not supported in this browser");
  }
  const ctx = new AudioContextCtor();
  try {
    const audioBuffer = await ctx.decodeAudioData(ab.slice(0));
    const wavAb = audioBufferToWav(audioBuffer);
    return new Uint8Array(wavAb);
  } finally {
    await ctx.close().catch(() => undefined);
  }
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

    const timerRef = useRef<number | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const stopRequestedRef = useRef(false);
    const releaseStreamTimerRef = useRef<number | null>(null);

    const isRecording = status === "recording";
  const isBusy = status !== "idle";
  const sttEnabled = false;
  const sttDisabled = disabled || !sttEnabled;

  const canUse = useMemo(() => {
    return typeof window !== "undefined" && typeof navigator !== "undefined";
  }, []);

  const stopStreamNow = useCallback(() => {
    if (releaseStreamTimerRef.current) {
      window.clearTimeout(releaseStreamTimerRef.current);
      releaseStreamTimerRef.current = null;
    }
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
  }, []);

  const scheduleReleaseStream = useCallback(() => {
    if (releaseStreamTimerRef.current) {
      window.clearTimeout(releaseStreamTimerRef.current);
      releaseStreamTimerRef.current = null;
    }

    // Keep mic warm for a short window to avoid losing the first seconds next time.
    releaseStreamTimerRef.current = window.setTimeout(() => {
      // Only release when truly idle
      if (!recorderRef.current) {
        stopStreamNow();
      }
    }, 8000);
  }, [stopStreamNow]);

  const cleanupMedia = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setSeconds(0);

    if (recorderRef.current) {
      recorderRef.current.ondataavailable = null;
      recorderRef.current.onstop = null;
      recorderRef.current.onerror = null;
      recorderRef.current = null;
    }

    chunksRef.current = [];
  }, []);

  useEffect(() => {
    if (!sttEnabled) {
      setError(t("voiceRecorder.errors.micUnavailable"));
    }
    return () => {
      cleanupMedia();
      stopStreamNow();
    };
  }, [cleanupMedia, stopStreamNow, sttEnabled]);

  const acquireStream = useCallback(async (): Promise<MediaStream> => {
    if (streamRef.current) {
      const live = streamRef.current.getTracks().some((t) => t.readyState === "live");
      if (live) return streamRef.current;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    return stream;
  }, []);

  const prepare = useCallback(() => {
    if (!canUse) return;
    if (sttDisabled) return;
    if (status === "transcribing") return;

    stopRequestedRef.current = false;

    void acquireStream()
      .then(() => {
        scheduleReleaseStream();
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : t("voiceRecorder.errors.micUnavailable"));
      });
  }, [acquireStream, canUse, scheduleReleaseStream, status, sttDisabled]);

  const start = useCallback(async () => {
    if (!canUse) return;
    if (sttDisabled || isBusy) return;

    setError(null);
    setSeconds(0);
    stopRequestedRef.current = false;

    try {
      const stream = await acquireStream();

      if (stopRequestedRef.current) {
        stopRequestedRef.current = false;
        setStatus("idle");
        scheduleReleaseStream();
        return;
      }

      const mimeTypeCandidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/ogg",
      ];
      const mimeType = mimeTypeCandidates.find((t) => {
        try {
          return typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t);
        } catch {
          return false;
        }
      });

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onerror = () => {
        setError(t("voiceRecorder.errors.recordFailed"));
        setStatus("idle");
        cleanupMedia();
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        cleanupMedia();

        if (blob.size === 0) {
          setStatus("idle");
          setError(t("voiceRecorder.errors.noAudio"));
          return;
        }

        setStatus("transcribing");
        try {
          const wavBytes = await decodeToWav(blob);
          const b64 = bytesToBase64(wavBytes);

          const resp = await fetch("/api/stt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audio: b64, format: "wav" }),
          });

          if (!resp.ok) {
            const text = await resp.text();
            throw new Error(text || `HTTP ${resp.status}`);
          }

          const json = (await resp.json()) as any;
          const transcript = typeof json?.text === "string" ? json.text.trim() : "";
          if (!transcript) {
            setError(t("voiceRecorder.errors.noTranscript"));
          } else {
            onTranscript(transcript);
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : t("voiceRecorder.errors.sttFailed"));
        } finally {
          setStatus("idle");
          scheduleReleaseStream();
        }
      };

      setStatus("recording");
      recorder.start();

      timerRef.current = window.setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    } catch (e) {
      setStatus("idle");
      setError(e instanceof Error ? e.message : t("voiceRecorder.errors.micUnavailable"));
      cleanupMedia();
      scheduleReleaseStream();
    }
  }, [acquireStream, canUse, cleanupMedia, isBusy, onTranscript, scheduleReleaseStream, sttDisabled]);

  const stop = useCallback(() => {
    if (status === "idle") return;
    if (status === "transcribing") return;

    try {
      if (!recorderRef.current) {
        // still waiting for getUserMedia / recorder init
        stopRequestedRef.current = true;
        setStatus("idle");
        scheduleReleaseStream();
        return;
      }

      recorderRef.current.stop();
    } catch {
      setStatus("idle");
      cleanupMedia();
      scheduleReleaseStream();
    }
  }, [cleanupMedia, scheduleReleaseStream, status]);

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

      {error ? (
        <div
          className={cn(
            "absolute right-0 -top-5 text-[11px] whitespace-nowrap",
            isNight ? "text-white/55" : "text-[var(--text-muted)]"
          )}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
});

