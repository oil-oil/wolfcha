"use client";

import { StaticAvatar, type StaticAvatarProps } from "@/components/game/Avatar";

/** Keep the shared portrait unchanged; a failed external image gets a local fallback. */
export function MultiplayerAvatar(props: StaticAvatarProps) {
  return <span style={{ display: "contents" }} onErrorCapture={(event) => {
    const image = event.target;
    if (image instanceof HTMLImageElement && image.getAttribute("src") !== "/brand/wolfcha-favicon.svg") {
      image.src = "/brand/wolfcha-favicon.svg";
    }
  }}><StaticAvatar {...props} /></span>;
}
