/** Slower poison stain; the small initial shake stays brief and never holds the card off-center. */
export const POISON_HIT_TIMING = { impactMs: 235, hitMs: 680, shakeMs: 240 } as const;

export const POISON_BUBBLES = [
  { x: 119, y: 247, radius: 12, drift: -15 },
  { x: 292, y: 252, radius: 17, drift: 16 },
  { x: 145, y: 297, radius: 7, drift: -18 },
  { x: 275, y: 292, radius: 9, drift: 12 },
  { x: 106, y: 205, radius: 6, drift: -8 },
  { x: 313, y: 213, radius: 8, drift: 7 },
  { x: 264, y: 142, radius: 5, drift: 11 },
] as const;
