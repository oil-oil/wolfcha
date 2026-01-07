"use client";

import { forwardRef, SVGProps } from "react";

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

// 狼人图标
export const WerewolfIcon = forwardRef<SVGSVGElement, IconProps>(
  ({ size = 24, className, ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      width={size}
      height={size}
      className={className}
      {...props}
    >
      <path d="M12 2L8 7L4 5V11L2 14L4 16L6 22H18L20 16L22 14L20 11V5L16 7L12 2Z" fill="currentColor"/>
      <path d="M8 11.5L12 11.5M16 11.5L12 11.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="8" cy="13" r="1.5" fill="white"/>
      <circle cx="16" cy="13" r="1.5" fill="white"/>
      <path d="M10 18L12 16L14 18" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
);
WerewolfIcon.displayName = "WerewolfIcon";

// 预言家图标
export const SeerIcon = forwardRef<SVGSVGElement, IconProps>(
  ({ size = 24, className, ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      width={size}
      height={size}
      className={className}
      {...props}
    >
      <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.2"/>
      <circle cx="12" cy="12" r="7" fill="currentColor"/>
      <path d="M12 8C12 8 10 10 10 12C10 14 12 16 12 16" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      <path d="M14 10L15 9" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      <path d="M9 14L8 15" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="15" cy="9" r="1" fill="white"/>
    </svg>
  )
);
SeerIcon.displayName = "SeerIcon";

// 村民图标
export const VillagerIcon = forwardRef<SVGSVGElement, IconProps>(
  ({ size = 24, className, ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      width={size}
      height={size}
      className={className}
      {...props}
    >
      <path d="M2 10L12 3L22 10V20C22 21.1 21.1 22 20 22H4C2.9 22 2 21.1 2 20V10Z" fill="currentColor"/>
      <rect x="8" y="14" width="8" height="8" fill="white" opacity="0.9"/>
      <path d="M10 14V22" stroke="currentColor" strokeWidth="1" opacity="0.3"/>
      <path d="M8 18H16" stroke="currentColor" strokeWidth="1" opacity="0.3"/>
    </svg>
  )
);
VillagerIcon.displayName = "VillagerIcon";

// 夜晚图标
export const NightIcon = forwardRef<SVGSVGElement, IconProps>(
  ({ size = 24, className, ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      width={size}
      height={size}
      className={className}
      {...props}
    >
      <path d="M21 12.79C20.8996 12.8 20.8005 12.8055 20.7027 12.8164C19.9829 12.8959 19.2618 12.8361 18.5583 12.6384C14.7354 11.5658 12.4497 7.5756 13.5222 3.75276C13.6277 3.37648 13.7633 3.01174 13.9248 2.66228C9.50766 3.65582 6.00293 7.39956 5.37893 11.9687C4.75494 16.5379 7.23078 20.9419 11.4116 22.8427C15.5925 24.7434 20.6559 23.6337 23.6826 20.0805C22.9555 20.4851 22.1384 20.7366 21.2847 20.808C21.1873 20.8162 21.0894 20.8202 20.9912 20.8202C20.8931 20.8202 20.7951 20.8162 20.6977 20.808C17.0685 20.4072 14.4361 17.1895 14.8368 13.5603C14.8872 13.1044 14.9926 12.658 15.1481 12.2306C17.3093 13.8863 20.1228 14.1378 22.5647 12.9806C22.0945 12.8596 21.6033 12.7959 21.1091 12.7959C21.0727 12.7959 21.0363 12.7939 21 12.79Z" fill="currentColor"/>
      <circle cx="18" cy="6" r="1" fill="currentColor" opacity="0.5"/>
      <circle cx="7" cy="18" r="1" fill="currentColor" opacity="0.5"/>
    </svg>
  )
);
NightIcon.displayName = "NightIcon";

// 白天图标
export const DayIcon = forwardRef<SVGSVGElement, IconProps>(
  ({ size = 24, className, ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      width={size}
      height={size}
      className={className}
      {...props}
    >
      <circle cx="12" cy="12" r="6" fill="currentColor"/>
      <path d="M12 2V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M12 20V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M4 12H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M22 12H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M4.9 4.9L6.3 6.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M17.7 17.7L19.1 19.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M19.1 4.9L17.7 6.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M6.3 17.7L4.9 19.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
);
DayIcon.displayName = "DayIcon";

// 发言图标
export const SpeechIcon = forwardRef<SVGSVGElement, IconProps>(
  ({ size = 24, className, ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      width={size}
      height={size}
      className={className}
      {...props}
    >
      <path d="M21 15C21 16.1 20.1 17 19 17H7L3 21V5C3 3.9 3.9 3 5 3H19C20.1 3 21 3.9 21 5V15Z" fill="currentColor"/>
      <rect x="7" y="7" width="10" height="2" rx="1" fill="white"/>
      <rect x="7" y="11" width="7" height="2" rx="1" fill="white"/>
    </svg>
  )
);
SpeechIcon.displayName = "SpeechIcon";

// 投票图标
export const VoteIcon = forwardRef<SVGSVGElement, IconProps>(
  ({ size = 24, className, ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      width={size}
      height={size}
      className={className}
      {...props}
    >
      <path d="M16 4H8C5.79086 4 4 5.79086 4 8V16C4 18.2091 5.79086 20 8 20H16C18.2091 20 20 18.2091 20 16V8C20 5.79086 18.2091 4 16 4Z" fill="currentColor"/>
      <path d="M8 11L11 14L16 9" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
);
VoteIcon.displayName = "VoteIcon";

// 出局图标
export const DeathIcon = forwardRef<SVGSVGElement, IconProps>(
  ({ size = 24, className, ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      width={size}
      height={size}
      className={className}
      {...props}
    >
      <path d="M12 2C7.58 2 4 4.58 4 9C4 12.5 6 15.5 9 17L12 22L15 17C18 15.5 20 12.5 20 9C20 4.58 16.42 2 12 2Z" fill="currentColor"/>
      <circle cx="9" cy="8" r="1.5" fill="white"/>
      <circle cx="15" cy="8" r="1.5" fill="white"/>
      <path d="M10 13C10 13 11 12 12 12C13 12 14 13 14 13" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
);
DeathIcon.displayName = "DeathIcon";

// 胜利图标
export const VictoryIcon = forwardRef<SVGSVGElement, IconProps>(
  ({ size = 24, className, ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      width={size}
      height={size}
      className={className}
      {...props}
    >
      <path d="M5 9L2 19H22L19 9L12 14L5 9Z" fill="currentColor"/>
      <path d="M5 9L2 19L12 22L22 19L19 9" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" opacity="0.7"/>
      <path d="M5 9L8 4L12 7L16 4L19 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
      <circle cx="12" cy="7" r="1" fill="currentColor"/>
      <circle cx="8" cy="4" r="1" fill="currentColor"/>
      <circle cx="16" cy="4" r="1" fill="currentColor"/>
    </svg>
  )
);
VictoryIcon.displayName = "VictoryIcon";

// 计时器图标
export const TimerIcon = forwardRef<SVGSVGElement, IconProps>(
  ({ size = 24, className, ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      width={size}
      height={size}
      className={className}
      {...props}
    >
      <path d="M12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21Z" fill="currentColor" opacity="0.2"/>
      <path d="M12 12V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M12 12L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="12" cy="12" r="2" fill="currentColor"/>
    </svg>
  )
);
TimerIcon.displayName = "TimerIcon";

// AI 思考图标
export const AIThinkingIcon = forwardRef<SVGSVGElement, IconProps>(
  ({ size = 24, className, ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      width={size}
      height={size}
      className={className}
      {...props}
    >
      <rect x="4" y="6" width="16" height="12" rx="2" fill="currentColor"/>
      <path d="M8 10L9 11L11 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M13 14H16" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M7 16H17" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
    </svg>
  )
);
AIThinkingIcon.displayName = "AIThinkingIcon";

// 系统提示图标
export const InfoIcon = forwardRef<SVGSVGElement, IconProps>(
  ({ size = 24, className, ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      width={size}
      height={size}
      className={className}
      {...props}
    >
      <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" fill="currentColor"/>
      <path d="M12 16V12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="12" cy="8" r="1" fill="white"/>
    </svg>
  )
);
InfoIcon.displayName = "InfoIcon";

// 用户图标
export const UserIcon = forwardRef<SVGSVGElement, IconProps>(
  ({ size = 24, className, ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      width={size}
      height={size}
      className={className}
      {...props}
    >
      <circle cx="12" cy="8" r="4" fill="currentColor"/>
      <path d="M4 20C4 16.6863 7.13401 14 11 14H13C16.866 14 20 16.6863 20 20V22H4V20Z" fill="currentColor"/>
    </svg>
  )
);
UserIcon.displayName = "UserIcon";

// 女巫图标
export const WitchIcon = forwardRef<SVGSVGElement, IconProps>(
  ({ size = 24, className, ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      width={size}
      height={size}
      className={className}
      {...props}
    >
      <path d="M7 14C7 10 10 2 12 2C14 2 17 10 17 14C17 18 15 22 12 22C9 22 7 18 7 14Z" fill="currentColor"/>
      <path d="M12 6V10" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M10 8H14" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="14" cy="16" r="1.5" fill="#E9D5FF"/>
      <circle cx="10" cy="18" r="1" fill="#E9D5FF"/>
    </svg>
  )
);
WitchIcon.displayName = "WitchIcon";

// 猎人图标
export const HunterIcon = forwardRef<SVGSVGElement, IconProps>(
  ({ size = 24, className, ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      width={size}
      height={size}
      className={className}
      {...props}
    >
      <path d="M4 18L9 13L16 20H4V18Z" fill="currentColor"/>
      <path d="M20 6L9 17" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
      <circle cx="20" cy="6" r="2" fill="currentColor"/>
      <rect x="6" y="16" width="8" height="2" rx="1" fill="white"/>
    </svg>
  )
);
HunterIcon.displayName = "HunterIcon";

// 守卫图标
export const GuardIcon = forwardRef<SVGSVGElement, IconProps>(
  ({ size = 24, className, ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      width={size}
      height={size}
      className={className}
      {...props}
    >
      <path d="M12 2L4 6V11C4 16.5 7.5 21 12 22C16.5 21 20 16.5 20 11V6L12 2Z" fill="currentColor"/>
      <path d="M12 7V17" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      <path d="M8 11H16" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
);
GuardIcon.displayName = "GuardIcon";
