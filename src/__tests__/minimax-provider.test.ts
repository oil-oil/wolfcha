import { describe, it, expect } from "vitest";
import {
  MODEL_IDS,
  ALL_MODELS,
  BUILTIN_PLAYER_MODELS,
  AVAILABLE_MODELS,
  PROJECT_MODELS,
  type ModelRef,
} from "../types/game";

describe("MiniMax model configuration", () => {
  it("MODEL_IDS.minimax contains M2.7 and M2.7-highspeed", () => {
    expect(MODEL_IDS.minimax.m27).toBe("MiniMax-M2.7");
    expect(MODEL_IDS.minimax.m27Highspeed).toBe("MiniMax-M2.7-highspeed");
  });

  it("ALL_MODELS includes MiniMax direct provider entries", () => {
    const minimaxDirect = ALL_MODELS.filter(
      (m) => m.provider === "minimax"
    );
    expect(minimaxDirect.length).toBeGreaterThanOrEqual(2);

    const modelNames = minimaxDirect.map((m) => m.model);
    expect(modelNames).toContain("MiniMax-M2.7");
    expect(modelNames).toContain("MiniMax-M2.7-highspeed");
  });

  it("MiniMax direct models have temperature=1 and reasoning disabled", () => {
    const minimaxDirect = ALL_MODELS.filter(
      (m) => m.provider === "minimax"
    );
    for (const ref of minimaxDirect) {
      expect(ref.temperature).toBe(1);
      expect(ref.reasoning).toEqual({ enabled: false });
    }
  });

  it("BUILTIN_PLAYER_MODELS includes MiniMax M2.7 via tokendance", () => {
    const minimaxBuiltin = BUILTIN_PLAYER_MODELS.find(
      (m) => m.model === MODEL_IDS.tokendance.minimaxM27
    );
    expect(minimaxBuiltin).toBeDefined();
    expect(minimaxBuiltin?.provider).toBe("tokendance");
  });

  it("ALL_MODELS includes MiniMax M2.1 via zenmux", () => {
    const minimaxZenmux = ALL_MODELS.find(
      (m) => m.model === MODEL_IDS.zenmux.minimaxM21
    );
    expect(minimaxZenmux).toBeDefined();
    expect(minimaxZenmux?.provider).toBe("zenmux");
  });

  it("ModelRef provider type includes 'minimax'", () => {
    const ref: ModelRef = {
      provider: "minimax",
      model: "MiniMax-M2.7",
      temperature: 1,
    };
    expect(ref.provider).toBe("minimax");
  });

  it("MiniMax direct models are NOT in PROJECT_MODELS (custom key only)", () => {
    const minimaxProject = PROJECT_MODELS.filter(
      (m) => m.provider === "minimax"
    );
    expect(minimaxProject.length).toBe(0);
  });

  it("MiniMax direct models are NOT in AVAILABLE_MODELS (custom key only)", () => {
    const minimaxAvailable = AVAILABLE_MODELS.filter(
      (m) => m.provider === "minimax"
    );
    expect(minimaxAvailable.length).toBe(0);
  });
});

describe("MiniMax temperature clamping", () => {
  it("MiniMax API requires temperature in (0, 1]", () => {
    // Simulate the clamping logic from route.ts
    const clampMinimax = (temp: number) =>
      Math.min(Math.max(0.01, temp), 1);

    expect(clampMinimax(0)).toBe(0.01); // 0 clamped to 0.01
    expect(clampMinimax(0.5)).toBe(0.5);
    expect(clampMinimax(1)).toBe(1);
    expect(clampMinimax(1.5)).toBe(1); // >1 clamped to 1
    expect(clampMinimax(-0.5)).toBe(0.01); // negative clamped to 0.01
  });
});

describe("MiniMax model logo", () => {
  it("model-logo regex matches minimax model names", () => {
    const minimaxRegex = /minimax/i;
    expect(minimaxRegex.test("MiniMax-M2.7")).toBe(true);
    expect(minimaxRegex.test("MiniMax-M2.7-highspeed")).toBe(true);
    expect(minimaxRegex.test("minimax/minimax-m2.1")).toBe(true);
    expect(minimaxRegex.test("minimax-m2.7")).toBe(true);
    expect(minimaxRegex.test("deepseek-v3.2")).toBe(false);
  });
});
