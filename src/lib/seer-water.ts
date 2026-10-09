export const SEER_WATER_MAP_SIZE = 128;
export const SEER_WATER_UPDATE_MS = 1000 / 60;
// The original 2.5s sound plays in full; the faster visual settles independently.
export const SEER_WATER_VISUAL_MS = 1450;
export const SEER_WATER_WAVE_CYCLES = 2.5;

/** Radial surface normals bend the actual scene; lighting describes the same wave crests. */
export function createSeerWaterMaps(size = SEER_WATER_MAP_SIZE) {
  const normals = new Uint8ClampedArray(size * size * 4);
  const light = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size * 2 - 1;
      const dy = (y + 0.5) / size * 2 - 1;
      const radius = Math.hypot(dx, dy);
      const taper = Math.max(0, Math.min(1, (1 - radius) * 9)) * Math.min(1, radius * 14);
      const slope = Math.cos(radius * Math.PI * 2 * SEER_WATER_WAVE_CYCLES) * taper;
      const nx = radius > 0 ? dx / radius * slope : 0;
      const ny = radius > 0 ? dy / radius * slope : 0;
      const at = (y * size + x) * 4;
      normals[at] = 128 + nx * 94;
      normals[at + 1] = 128 + ny * 94;
      normals[at + 2] = 128;
      normals[at + 3] = 255;
      const illumination = -nx * 0.42 - ny * 0.75;
      light[at] = illumination > 0 ? 190 : 20;
      light[at + 1] = illumination > 0 ? 232 : 61;
      light[at + 2] = illumination > 0 ? 239 : 76;
      light[at + 3] = Math.abs(illumination) * (illumination > 0 ? 65 : 48);
    }
  }
  return { normals, light, size };
}

export function seerWaterFrame(elapsedMs: number, durationMs: number, maxRadius: number, reducedMotion = false) {
  const progress = Math.max(0, Math.min(1, elapsedMs / durationMs));
  const strength = Math.sin(progress * Math.PI) ** 1.4;
  return {
    done: progress >= 1,
    radius: maxRadius * (0.015 + (1 - (1 - progress) ** 1.35) * 1.22),
    displacement: reducedMotion ? 0 : strength * 8.5,
    lightOpacity: reducedMotion ? 0 : strength * 0.88,
    washOpacity: strength * 0.035,
  };
}
