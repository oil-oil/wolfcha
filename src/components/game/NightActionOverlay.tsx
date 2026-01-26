"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
 
export type NightActionOverlayType = "wolf" | "witch-save" | "witch-poison" | "hunter" | "seer";
 
 interface NightActionOverlayProps {
  overlay: {
    type: NightActionOverlayType;
    id: number;
    target?: { seat: number; name: string; avatarUrl?: string };
  } | null;
 }
 
 export function NightActionOverlay({ overlay }: NightActionOverlayProps) {
  const t = useTranslations();
  const target = overlay?.target;
   return (
     <AnimatePresence>
       {overlay && (
         <motion.div
           key={overlay.id}
           initial={{ opacity: 0 }}
           animate={{ opacity: 1 }}
           exit={{ opacity: 0 }}
           transition={{ duration: 0.25, ease: "easeOut" }}
           className="wc-night-action-overlay"
           data-variant={overlay.type}
           aria-hidden="true"
         >
           {overlay.type === "wolf" && (
             <>
              <div className="wc-night-wolf-flash" />
              <div className="wc-night-wolf-shade" />
              <svg
                className="wc-night-wolf-claws"
                viewBox="0 0 200 200"
                aria-hidden="true"
              >
                <path d="M10 40 Q90 100 180 180" className="wc-night-wolf-claw wc-night-wolf-claw--1" />
                <path d="M30 20 Q110 90 195 165" className="wc-night-wolf-claw wc-night-wolf-claw--2" />
                <path d="M20 70 Q80 120 170 195" className="wc-night-wolf-claw wc-night-wolf-claw--3" />
              </svg>
             </>
           )}
 
           {overlay.type === "witch-save" && (
             <>
               <div className="wc-night-heal-core" />
               <div className="wc-night-heal-ring wc-night-heal-ring--1" />
               <div className="wc-night-heal-ring wc-night-heal-ring--2" />
               <div className="wc-night-heal-ring wc-night-heal-ring--3" />
              <div className="wc-night-heal-sparkles" aria-hidden="true" />
             </>
           )}
 
           {overlay.type === "witch-poison" && (
             <>
               <div className="wc-night-poison-mist" />
               <div className="wc-night-poison-distort" />
              <div className="wc-night-poison-grain" aria-hidden="true" />
             </>
           )}
 
           {overlay.type === "hunter" && (
             <>
               <div className="wc-night-hunter-flash" />
               <div className="wc-night-hunter-burst" />
               <div className="wc-night-hunter-lines">
                 {[
                   "0deg",
                   "45deg",
                   "90deg",
                   "135deg",
                   "180deg",
                   "225deg",
                   "270deg",
                   "315deg",
                 ].map((rot) => (
                   <span
                     key={rot}
                     className="wc-night-hunter-line"
                     style={{ ["--wc-rot" as any]: rot }}
                   />
                 ))}
               </div>
              <div className="wc-night-hunter-core" aria-hidden="true" />
             </>
           )}

          {overlay.type === "seer" && (
            <>
              <div className="wc-night-seer-lens" />
              <div className="wc-night-seer-eye" />
              <div className="wc-night-seer-ring wc-night-seer-ring--1" />
              <div className="wc-night-seer-ring wc-night-seer-ring--2" />
            </>
          )}

          {target && (
            <div className="wc-night-action-target" aria-hidden="true">
              {target.avatarUrl && (
                <img
                  className="wc-night-action-target__avatar"
                  src={target.avatarUrl}
                  alt=""
                />
              )}
              <div className="wc-night-action-target__text">
                <span className="wc-night-action-target__label">{t("nightActionOverlay.target")}</span>
                <span className="wc-night-action-target__name">
                  {t("mentions.playerLabel", { seat: target.seat + 1, name: target.name })}
                </span>
              </div>
            </div>
          )}
         </motion.div>
       )}
     </AnimatePresence>
   );
 }
