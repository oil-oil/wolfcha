"use client";

import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  buildAvatarUrl,
  getIdleLipsForSeed,
  getTalkingLips,
  getDefaultIdleLips,
  type AvatarUrlOptions,
} from "@/lib/avatar-config";
import type { Gender } from "@/lib/character-generator";

// ============================================
// 类型定义
// ============================================

export interface AvatarProps {
  /** 用于生成头像的种子值 */
  seed: string;
  /** 性别 - 影响发型选择 */
  gender?: Gender;
  /** 是否正在说话（触发嘴型动画） */
  isTalking?: boolean;
  /** CSS 类名 */
  className?: string;
  /** 替代文本 */
  alt?: string;
  /** 缩放比例 (默认 100) */
  scale?: number;
  /** Y轴位移 (默认 0) */
  translateY?: number;
  /** 背景色 (默认根据 seed 生成，可设为 "transparent") */
  backgroundColor?: string | "transparent";
  /** 是否预加载嘴型变体（用于流畅的说话动画） */
  preloadTalkingVariants?: boolean;
  /** 说话动画速度 (ms)，默认 120 */
  talkingSpeed?: number;
  /** 尺寸预设 */
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "portrait";
}

// 尺寸预设映射
const SIZE_CLASSES: Record<NonNullable<AvatarProps["size"]>, string> = {
  xs: "w-6 h-6",
  sm: "w-8 h-8",
  md: "w-10 h-10",
  lg: "w-12 h-12",
  xl: "w-16 h-16",
  portrait: "w-[220px] lg:w-[260px] xl:w-[300px] h-auto",
};

// ============================================
// 主组件
// ============================================

export function Avatar({
  seed,
  gender,
  isTalking = false,
  className = "",
  alt = "Avatar",
  scale = 100,
  translateY = 0,
  backgroundColor,
  preloadTalkingVariants = true,
  talkingSpeed = 120,
  size,
}: AvatarProps) {
  // 获取说话嘴型列表
  const talkingLips = useMemo(() => getTalkingLips(), []);
  
  // 获取该用户的静止嘴型
  const idleLips = useMemo(() => getIdleLipsForSeed(seed), [seed]);
  
  // 当前嘴型状态
  const [currentLips, setCurrentLips] = useState(idleLips);
  
  // 动画相关 refs
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lipIndexRef = useRef(0);

  // 构建基础 URL 选项
  const baseUrlOptions = useMemo<Omit<AvatarUrlOptions, "lips">>(
    () => ({
      seed,
      gender,
      scale,
      translateY,
      backgroundColor,
    }),
    [seed, gender, scale, translateY, backgroundColor]
  );

  // 预加载所有嘴型变体的 URLs
  const allLipsUrls = useMemo(() => {
    if (!preloadTalkingVariants) return [];
    
    const urls: string[] = [];
    // 预加载静止状态
    urls.push(buildAvatarUrl({ ...baseUrlOptions, lips: idleLips }));
    // 预加载说话状态
    for (const lips of talkingLips) {
      urls.push(buildAvatarUrl({ ...baseUrlOptions, lips }));
    }
    return urls;
  }, [baseUrlOptions, idleLips, talkingLips, preloadTalkingVariants]);

  // 预加载图片
  useEffect(() => {
    if (!preloadTalkingVariants || allLipsUrls.length === 0) return;

    let mounted = true;
    
    const preload = async () => {
      for (const url of allLipsUrls) {
        if (!mounted) break;
        try {
          const img = new Image();
          img.src = url;
          await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          });
        } catch {
          // 忽略错误
        }
      }
    };

    preload();

    return () => {
      mounted = false;
    };
  }, [allLipsUrls, preloadTalkingVariants]);

  // 说话动画控制
  useEffect(() => {
    if (isTalking) {
      // 开始说话动画
      lipIndexRef.current = 0;
      setCurrentLips(talkingLips[0]);
      
      intervalRef.current = setInterval(() => {
        lipIndexRef.current = (lipIndexRef.current + 1) % talkingLips.length;
        setCurrentLips(talkingLips[lipIndexRef.current]);
      }, talkingSpeed);
    } else {
      // 停止说话，恢复静止状态
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setCurrentLips(idleLips);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isTalking, talkingLips, idleLips, talkingSpeed]);

  // 当前头像 URL
  const currentUrl = useMemo(
    () => buildAvatarUrl({ ...baseUrlOptions, lips: currentLips }),
    [baseUrlOptions, currentLips]
  );

  // 组合类名
  const combinedClassName = useMemo(() => {
    const sizeClass = size ? SIZE_CLASSES[size] : "";
    return `${sizeClass} ${className}`.trim();
  }, [size, className]);

  return (
    <>
      {/* 预加载的隐藏图片 */}
      {preloadTalkingVariants && (
        <div className="hidden" aria-hidden="true">
          {allLipsUrls.map((url) => (
            <img key={url} src={url} alt="" />
          ))}
        </div>
      )}
      
      {/* 实际显示的头像 */}
      <img
        src={currentUrl}
        alt={alt}
        className={combinedClassName}
      />
    </>
  );
}

// ============================================
// 简化版小头像组件
// ============================================

export interface AvatarSmallProps {
  seed: string;
  gender?: Gender;
  isTalking?: boolean;
  className?: string;
  alt?: string;
  size?: "xs" | "sm" | "md";
}

export function AvatarSmall({
  seed,
  gender,
  isTalking = false,
  className = "w-8 h-8 rounded-full",
  alt = "Avatar",
  size,
}: AvatarSmallProps) {
  const talkingLips = useMemo(() => getTalkingLips(), []);
  const idleLips = useMemo(() => getIdleLipsForSeed(seed), [seed]);
  const [currentLips, setCurrentLips] = useState(idleLips);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lipIndexRef = useRef(0);

  // 构建 URL 选项
  const urlOptions = useMemo<Omit<AvatarUrlOptions, "lips">>(
    () => ({
      seed,
      gender,
      backgroundColor: "transparent",
    }),
    [seed, gender]
  );

  // 预加载 URLs
  const preloadUrls = useMemo(() => {
    const urls: string[] = [];
    urls.push(buildAvatarUrl({ ...urlOptions, lips: idleLips }));
    for (const lips of talkingLips) {
      urls.push(buildAvatarUrl({ ...urlOptions, lips }));
    }
    return urls;
  }, [urlOptions, idleLips, talkingLips]);

  // 预加载
  useEffect(() => {
    for (const url of preloadUrls) {
      const img = new Image();
      img.src = url;
    }
  }, [preloadUrls]);

  // 说话动画
  useEffect(() => {
    if (isTalking) {
      lipIndexRef.current = 0;
      setCurrentLips(talkingLips[0]);
      
      intervalRef.current = setInterval(() => {
        lipIndexRef.current = (lipIndexRef.current + 1) % talkingLips.length;
        setCurrentLips(talkingLips[lipIndexRef.current]);
      }, 120);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setCurrentLips(idleLips);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isTalking, talkingLips, idleLips]);

  const currentUrl = buildAvatarUrl({ ...urlOptions, lips: currentLips });

  const sizeClass = size ? SIZE_CLASSES[size] : "";
  const combinedClassName = `${sizeClass} ${className}`.trim();

  return (
    <img
      src={currentUrl}
      alt={alt}
      className={combinedClassName}
    />
  );
}

// ============================================
// 静态头像组件（无动画，用于列表等）
// ============================================

export interface StaticAvatarProps {
  seed: string;
  gender?: Gender;
  className?: string;
  alt?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  backgroundColor?: string | "transparent";
}

export function StaticAvatar({
  seed,
  gender,
  className = "",
  alt = "Avatar",
  size,
  backgroundColor,
}: StaticAvatarProps) {
  const url = useMemo(
    () =>
      buildAvatarUrl({
        seed,
        gender,
        lips: getDefaultIdleLips(),
        backgroundColor,
      }),
    [seed, gender, backgroundColor]
  );

  const sizeClass = size ? SIZE_CLASSES[size] : "";
  const combinedClassName = `${sizeClass} ${className}`.trim();

  return <img src={url} alt={alt} className={combinedClassName} />;
}

// ============================================
// 工具函数导出
// ============================================

/**
 * 快速获取头像 URL（用于非组件场景）
 */
export { buildAvatarUrl, buildSimpleAvatarUrl } from "@/lib/avatar-config";
