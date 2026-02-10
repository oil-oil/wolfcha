"use client";

import { useState, useRef, useCallback } from "react";
import { X, Image as ImageIcon, Loader2, BarChart3, User } from "lucide-react";
import { toPng } from "html-to-image";
import type { GameAnalysisData } from "@/types/analysis";
import { SharePoster } from "./SharePoster";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: GameAnalysisData;
  overrideTag?: string | null;
}

export type PosterMode = "radar" | "portrait";

const POSTER_EXPORT_PIXEL_RATIO = 3;
const POSTER_EXPORT_BACKGROUND_COLOR = "#0f0e0d";

async function waitForImagesInElement(element: HTMLElement): Promise<void> {
  const images = Array.from(element.querySelectorAll("img"));
  if (images.length === 0) return;

  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }

          const cleanup = () => {
            img.removeEventListener("load", handleLoad);
            img.removeEventListener("error", handleError);
          };

          const handleLoad = () => {
            cleanup();
            resolve();
          };

          const handleError = () => {
            cleanup();
            resolve();
          };

          img.addEventListener("load", handleLoad, { once: true });
          img.addEventListener("error", handleError, { once: true });
        })
    )
  );
}

export function ShareModal({ isOpen, onClose, data, overrideTag }: ShareModalProps) {
  const [isGeneratingPoster, setIsGeneratingPoster] = useState(false);
  const [posterMode, setPosterMode] = useState<PosterMode>("radar");
  const posterContainerRef = useRef<HTMLDivElement>(null);

  const handleSavePoster = useCallback(async () => {
    if (!posterContainerRef.current || isGeneratingPoster) return;

    setIsGeneratingPoster(true);
    try {
      await document.fonts?.ready;

      await waitForImagesInElement(posterContainerRef.current);

      const dataUrl = await toPng(posterContainerRef.current, {
        cacheBust: true,
        pixelRatio: POSTER_EXPORT_PIXEL_RATIO,
        backgroundColor: POSTER_EXPORT_BACKGROUND_COLOR,
      });

      const link = document.createElement("a");
      link.download = `wolfcha-report-${data.gameId.slice(0, 8)}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error("Failed to generate poster:", error);
    } finally {
      setIsGeneratingPoster(false);
    }
  }, [data.gameId, isGeneratingPoster]);


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 bg-[#1a1614] border border-[var(--color-gold)]/20 rounded-xl shadow-2xl max-w-[420px] w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-gold)]/10">
          <h2 className="text-lg font-bold text-[var(--color-gold)] tracking-wider">
            分享海报
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="px-5 pt-4 flex justify-center">
          <div className="inline-flex rounded-lg bg-black/30 p-1 border border-[var(--color-gold)]/10">
            <button
              onClick={() => setPosterMode("radar")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                posterMode === "radar"
                  ? "bg-[var(--color-gold)]/20 text-[var(--color-gold)]"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              雷达图
            </button>
            <button
              onClick={() => setPosterMode("portrait")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                posterMode === "portrait"
                  ? "bg-[var(--color-gold)]/20 text-[var(--color-gold)]"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              <User className="w-3.5 h-3.5" />
              称号
            </button>
          </div>
        </div>

        {/* Poster Preview */}
        <div className="p-5 pt-3 flex justify-center overflow-auto max-h-[calc(90vh-220px)]">
          <div
            ref={posterContainerRef}
            className="shadow-2xl rounded-lg overflow-hidden border border-[var(--color-gold)]/10"
          >
            <SharePoster data={data} mode={posterMode} overrideTag={overrideTag} />
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-[var(--color-gold)]/10 space-y-3">
          <button
            onClick={handleSavePoster}
            disabled={isGeneratingPoster}
            className="w-full flex items-center justify-center gap-2 bg-[var(--color-gold)]/90 text-[#1a1614] font-bold py-3 rounded-lg hover:bg-[var(--color-gold)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGeneratingPoster ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ImageIcon className="w-4 h-4" />
            )}
            {isGeneratingPoster ? "生成中..." : "保存海报"}
          </button>

        </div>
      </div>
    </div>
  );
}
