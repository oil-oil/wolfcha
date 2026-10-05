import { MATCHING_CROWD_PLAYERS } from "./matching-crowd";

export const MATCHING_IMAGE_CACHE_LIMIT = 128;

type ImagePriority = "high" | "low";
interface CachedImage {
  image: HTMLImageElement;
  promise: Promise<HTMLImageElement>;
  ready: boolean;
}

// Reuse both in-flight requests and decoded images across scene remounts and
// rounds. The browser's HTTP cache continues to cover full page reloads.
const images = new Map<string, CachedImage>();

function trimImages() {
  for (const [src, entry] of images) {
    if (images.size <= MATCHING_IMAGE_CACHE_LIMIT) break;
    // Never evict an in-flight request that another scene may be awaiting.
    if (entry.ready) images.delete(src);
  }
}

export function loadMatchingImage(src: string, priority: ImagePriority = "high"): Promise<HTMLImageElement> {
  const cached = images.get(src);
  if (cached) {
    images.delete(src);
    images.set(src, cached);
    if (priority === "high") cached.image.fetchPriority = "high";
    return cached.promise;
  }

  const image = new Image();
  image.crossOrigin = "anonymous";
  image.fetchPriority = priority;
  let resolveImage!: (value: HTMLImageElement) => void;
  let rejectImage!: (error: Error) => void;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    resolveImage = resolve;
    rejectImage = reject;
  });
  const entry: CachedImage = { image, promise, ready: false };
  images.set(src, entry);
  let finished = false;
  const timer = window.setTimeout(() => finish(false), 20_000);
  function finish(ok: boolean) {
    if (finished) return;
    finished = true;
    window.clearTimeout(timer);
    image.onload = image.onerror = null;
    if (ok) {
      entry.ready = true;
      trimImages();
      resolveImage(image);
    } else {
      if (images.get(src) === entry) images.delete(src);
      rejectImage(new Error(`Unable to load matching image: ${src}`));
    }
  }
  image.onload = () => { void image.decode().then(() => finish(true), () => finish(false)); };
  image.onerror = () => finish(false);
  image.src = src;
  trimImages();
  return promise;
}

/** Warm the fixed crowd while the welcome screen is idle; never delay start. */
export function scheduleMatchingAssetWarmup(): () => void {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return () => {};

  let cancelled = false;
  let index = 0;
  const worker = async () => {
    while (!cancelled && index < MATCHING_CROWD_PLAYERS.length) {
      const player = MATCHING_CROWD_PLAYERS[index++];
      // Failure is optional here; the visible scene can retry the same asset.
      await loadMatchingImage(player.figureUrl, "low").catch(() => {});
    }
  };
  const run = () => { if (!cancelled) for (let i = 0; i < 4; i++) void worker(); };
  const idle = typeof window.requestIdleCallback === "function";
  const scheduled = idle ? window.requestIdleCallback(run, { timeout: 1500 }) : window.setTimeout(run, 1000);
  return () => {
    cancelled = true;
    if (idle) window.cancelIdleCallback(scheduled);
    else window.clearTimeout(scheduled);
  };
}
