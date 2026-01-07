"use client";

import { forwardRef } from "react";

interface WolfIconProps {
  size?: number;
  weight?: "thin" | "light" | "regular" | "bold" | "fill";
  className?: string;
}

export const WolfIcon = forwardRef<SVGSVGElement, WolfIconProps>(
  ({ size = 24, weight = "regular", className }, ref) => {
    const strokeWidth = weight === "thin" ? 1 : weight === "light" ? 1.5 : weight === "bold" ? 2.5 : 2;
    const isFill = weight === "fill";

    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={isFill ? "currentColor" : "none"}
        stroke={isFill ? "none" : "currentColor"}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        {isFill ? (
          // Filled wolf head
          <path d="M12 2L8 6L4 4V10L2 14L4 16L6 22H18L20 16L22 14L20 10V4L16 6L12 2ZM8 12C8.55228 12 9 12.4477 9 13C9 13.5523 8.55228 14 8 14C7.44772 14 7 13.5523 7 13C7 12.4477 7.44772 12 8 12ZM16 12C16.5523 12 17 12.4477 17 13C17 13.5523 16.5523 14 16 14C15.4477 14 15 13.5523 15 13C15 12.4477 15.4477 12 16 12ZM12 16L10 18H14L12 16Z" />
        ) : (
          // Stroked wolf head
          <>
            <path d="M12 2L8 6L4 4V10L2 14L4 16L6 22H18L20 16L22 14L20 10V4L16 6L12 2Z" />
            <circle cx="8" cy="13" r="1" fill="currentColor" />
            <circle cx="16" cy="13" r="1" fill="currentColor" />
            <path d="M10 18L12 16L14 18" />
          </>
        )}
      </svg>
    );
  }
);

WolfIcon.displayName = "WolfIcon";
