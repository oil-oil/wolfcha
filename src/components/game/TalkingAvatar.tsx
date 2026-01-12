"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";

// 说话时的两个嘴型变体（简单切换更自然）
const TALKING_LIPS = ["variant01", "variant05"];
// 闭嘴/静止状态
const IDLE_LIPS = "variant02";

const buildAvatarUrl = (seed: string, lips?: string, options?: { scale?: number; translateY?: number }) => {
  const scale = options?.scale ?? 120;
  const translateY = options?.translateY ?? -5;
  // 使用透明背景
  let url = `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent&scale=${scale}&translateY=${translateY}`;
  if (lips) {
    url += `&lips=${lips}`;
  }
  return url;
};

interface TalkingAvatarProps {
  seed: string;
  isTalking?: boolean;
  className?: string;
  alt?: string;
  scale?: number;
  translateY?: number;
}

export function TalkingAvatar({ 
  seed, 
  isTalking = false, 
  className = "",
  alt = "Avatar",
  scale = 120,
  translateY = -5,
}: TalkingAvatarProps) {
  const [currentLips, setCurrentLips] = useState(IDLE_LIPS);
  const [preloadedUrls, setPreloadedUrls] = useState<string[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lipIndexRef = useRef(0);

  // 预加载所有嘴型图片
  const allLipsUrls = useMemo(() => {
    const urls: string[] = [];
    // 预加载静止状态
    urls.push(buildAvatarUrl(seed, IDLE_LIPS, { scale, translateY }));
    // 预加载说话状态
    for (const lips of TALKING_LIPS) {
      urls.push(buildAvatarUrl(seed, lips, { scale, translateY }));
    }
    return urls;
  }, [seed, scale, translateY]);

  // 预加载图片
  useEffect(() => {
    const loaded: string[] = [];
    let mounted = true;

    const preload = async () => {
      for (const url of allLipsUrls) {
        if (!mounted) break;
        try {
          // 使用 Image 对象预加载
          const img = new Image();
          img.src = url;
          await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve(); // 即使失败也继续
          });
          loaded.push(url);
        } catch {
          // 忽略错误
        }
      }
      if (mounted) {
        setPreloadedUrls(loaded);
      }
    };

    preload();

    return () => {
      mounted = false;
    };
  }, [allLipsUrls]);

  // 说话动画
  useEffect(() => {
    if (isTalking) {
      // 开始说话动画
      lipIndexRef.current = 0;
      
      // 立即切换到第一个说话嘴型
      setCurrentLips(TALKING_LIPS[0]);
      
      // 定时切换嘴型（模拟说话）
      intervalRef.current = setInterval(() => {
        lipIndexRef.current = (lipIndexRef.current + 1) % TALKING_LIPS.length;
        setCurrentLips(TALKING_LIPS[lipIndexRef.current]);
      }, 120); // 每 120ms 切换一次，模拟说话节奏
    } else {
      // 停止说话，恢复静止状态
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setCurrentLips(IDLE_LIPS);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isTalking]);

  const currentUrl = buildAvatarUrl(seed, currentLips, { scale, translateY });

  return (
    <>
      {/* 预加载的隐藏图片 */}
      <div className="hidden">
        {allLipsUrls.map((url) => (
          <img key={url} src={url} alt="" aria-hidden="true" />
        ))}
      </div>
      
      {/* 实际显示的头像 */}
      <img
        src={currentUrl}
        alt={alt}
        className={className}
      />
    </>
  );
}

// 小头像版本（用于聊天记录等）
interface TalkingAvatarSmallProps {
  seed: string;
  isTalking?: boolean;
  className?: string;
  alt?: string;
}

export function TalkingAvatarSmall({ 
  seed, 
  isTalking = false, 
  className = "w-8 h-8 rounded-full",
  alt = "Avatar",
}: TalkingAvatarSmallProps) {
  const [currentLips, setCurrentLips] = useState(IDLE_LIPS);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lipIndexRef = useRef(0);

  // 预加载 URL（透明背景）
  const preloadUrls = useMemo(() => {
    const urls: string[] = [];
    urls.push(`https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent&lips=${IDLE_LIPS}`);
    for (const lips of TALKING_LIPS) {
      urls.push(`https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent&lips=${lips}`);
    }
    return urls;
  }, [seed]);

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
      setCurrentLips(TALKING_LIPS[0]);
      
      intervalRef.current = setInterval(() => {
        lipIndexRef.current = (lipIndexRef.current + 1) % TALKING_LIPS.length;
        setCurrentLips(TALKING_LIPS[lipIndexRef.current]);
      }, 120);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setCurrentLips(IDLE_LIPS);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isTalking]);

  const currentUrl = `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent&lips=${currentLips}`;

  return (
    <img
      src={currentUrl}
      alt={alt}
      className={className}
    />
  );
}
