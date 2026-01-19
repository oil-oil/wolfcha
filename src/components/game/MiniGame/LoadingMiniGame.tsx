import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

type MiniGameItem = {
  x: number;
  y: number;
  r: number;
  speed: number;
  isBad: boolean;
};

type CatchEffect = {
  x: number;
  y: number;
  life: number;
  isBad: boolean;
};

const CANVAS_WIDTH = 300;
const CANVAS_HEIGHT = 170;

const COLOR_GOLD = "#c5a059";
const COLOR_GOLD_SOFT = "rgba(197, 160, 89, 0.35)";
const COLOR_BLOOD = "#bf2e2e";
const COLOR_TEXT = "#d8c7a6";

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const drawStar = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  spikes: number,
  outerRadius: number,
  innerRadius: number
) => {
  let rot = (Math.PI / 2) * 3;
  let x = cx;
  let y = cy;
  const step = Math.PI / spikes;

  ctx.beginPath();
  ctx.moveTo(cx, cy - outerRadius);
  for (let i = 0; i < spikes; i += 1) {
    x = cx + Math.cos(rot) * outerRadius;
    y = cy + Math.sin(rot) * outerRadius;
    ctx.lineTo(x, y);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    ctx.lineTo(x, y);
    rot += step;
  }
  ctx.lineTo(cx, cy - outerRadius);
  ctx.closePath();
};

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

const LoadingMiniGame = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const itemsRef = useRef<MiniGameItem[]>([]);
  const effectsRef = useRef<CatchEffect[]>([]);
  const paddleRef = useRef({ x: CANVAS_WIDTH / 2, targetX: CANVAS_WIDTH / 2 });
  const [score, setScore] = useState(0);
  const [flashBad, setFlashBad] = useState(false);
  const flashTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = CANVAS_WIDTH * dpr;
    canvas.height = CANVAS_HEIGHT * dpr;
    canvas.style.width = `${CANVAS_WIDTH}px`;
    canvas.style.height = `${CANVAS_HEIGHT}px`;
    ctx.scale(dpr, dpr);

    let isActive = true;
    let lastTime = performance.now();
    let spawnAccumulator = 0;
    // 120Hz as baseline: 32 frames at 120fps = 266.67ms spawn interval
    const SPAWN_INTERVAL = 266.67;
    // Target frame time for 120Hz baseline
    const TARGET_FRAME_TIME = 8.33;

    const spawnItem = () => {
      const isBad = Math.random() < 0.18;
      itemsRef.current.push({
        x: Math.random() * (CANVAS_WIDTH - 20) + 10,
        y: -10,
        r: isBad ? 6.5 : 6,
        speed: Math.random() * 0.8 + 1.2,
        isBad,
      });
    };

    const spawnEffect = (x: number, y: number, isBad: boolean) => {
      effectsRef.current.push({ x, y, isBad, life: 18 });
    };

    const drawPaddle = () => {
      const paddle = paddleRef.current;
      const width = 46;
      const height = 6;

      ctx.save();
      ctx.translate(paddle.x, CANVAS_HEIGHT - 20);
      ctx.lineWidth = 1;
      ctx.strokeStyle = COLOR_GOLD;
      ctx.fillStyle = COLOR_GOLD_SOFT;
      drawRoundedRect(ctx, -width / 2, -height / 2, width, height, 3);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    const drawItem = (item: MiniGameItem) => {
      ctx.save();
      ctx.translate(item.x, item.y);
      if (item.isBad) {
        ctx.fillStyle = COLOR_BLOOD;
        ctx.beginPath();
        ctx.ellipse(0, 0, item.r + 2, item.r, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#0b0a0d";
        ctx.beginPath();
        ctx.ellipse(0, 0, 1.3, item.r * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = COLOR_GOLD;
        ctx.fillStyle = COLOR_TEXT;
        drawStar(ctx, 0, 0, 5, item.r, item.r / 2.4);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    };

    const update = (currentTime: number) => {
      if (!isActive) return;

      // Calculate delta time and time scale (based on 120Hz)
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;
      const timeScale = deltaTime / TARGET_FRAME_TIME;

      // Spawn items based on accumulated time
      spawnAccumulator += deltaTime;
      if (spawnAccumulator >= SPAWN_INTERVAL) {
        spawnItem();
        spawnAccumulator -= SPAWN_INTERVAL;
      }

      const paddle = paddleRef.current;
      // Apply time scale to paddle movement for consistent feel
      const paddleLerp = 1 - Math.pow(1 - 0.15, timeScale);
      paddle.x += (paddle.targetX - paddle.x) * paddleLerp;
      paddle.x = clamp(paddle.x, 20, CANVAS_WIDTH - 20);

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      drawPaddle();

      const nextItems: MiniGameItem[] = [];
      for (const item of itemsRef.current) {
        // Apply time scale to item movement
        item.y += item.speed * timeScale;
        drawItem(item);

        const dy = item.y - (CANVAS_HEIGHT - 20);
        const dx = item.x - paddle.x;
        if (Math.abs(dy) < 10 && Math.abs(dx) < 28) {
          setScore((prev) => Math.max(0, prev + (item.isBad ? -10 : 1)));
          spawnEffect(item.x, item.y, item.isBad);
          if (item.isBad) {
            setFlashBad(true);
            if (flashTimerRef.current) {
              window.clearTimeout(flashTimerRef.current);
            }
            flashTimerRef.current = window.setTimeout(() => {
              setFlashBad(false);
            }, 220);
          }
          continue;
        }

        if (item.y < CANVAS_HEIGHT + 10) nextItems.push(item);
      }
      itemsRef.current = nextItems;

      if (effectsRef.current.length > 0) {
        const nextEffects: CatchEffect[] = [];
        for (const effect of effectsRef.current) {
          ctx.save();
          ctx.translate(effect.x, effect.y);
          const progress = effect.life / 18;
          if (effect.isBad) {
            ctx.strokeStyle = `rgba(191, 46, 46, ${0.6 * progress})`;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.ellipse(0, 0, 10 * (1.1 - progress), 6 * (1.1 - progress), 0, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            ctx.strokeStyle = `rgba(197, 160, 89, ${0.7 * progress})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(0, 0, 9 * (1.1 - progress), 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();

          // Apply time scale to effect life decay
          effect.life -= timeScale;
          if (effect.life > 0) nextEffects.push(effect);
        }
        effectsRef.current = nextEffects;
      }

      frameRef.current = requestAnimationFrame(update);
    };

    frameRef.current = requestAnimationFrame(update);

    return () => {
      isActive = false;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMove = (clientX: number) => {
      const rect = canvas.getBoundingClientRect();
      const nextX = clientX - rect.left;
      paddleRef.current.targetX = clamp(nextX, 20, CANVAS_WIDTH - 20);
    };

    const handleMouse = (event: MouseEvent) => handleMove(event.clientX);
    const handleTouch = (event: TouchEvent) => {
      if (event.touches[0]) handleMove(event.touches[0].clientX);
    };

    canvas.addEventListener("mousemove", handleMouse);
    canvas.addEventListener("touchmove", handleTouch, { passive: true });

    return () => {
      canvas.removeEventListener("mousemove", handleMouse);
      canvas.removeEventListener("touchmove", handleTouch);
    };
  }, []);

  return (
    <div className="relative flex flex-col items-center gap-2">
      <canvas
        ref={canvasRef}
        className="rounded-[8px]"
        aria-label="loading mini game"
      />
      <div
        className={`pointer-events-none absolute left-1/2 top-[52%] -translate-x-1/2 -translate-y-1/2 ${
          flashBad ? "text-[var(--color-blood)]/80" : "text-[var(--text-primary)]/70"
        }`}
      >
        <div className="relative h-[28px] min-w-[48px] overflow-hidden text-center text-lg font-semibold tracking-[0.2em]">
          <AnimatePresence mode="popLayout">
            <motion.span
              key={score}
              className="absolute left-0 top-0 w-full"
              initial={{ y: 18, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -18, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              {score}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default LoadingMiniGame;
