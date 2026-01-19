/**
 * 异步流程控制器
 * 用于管理游戏流程中的异步操作，支持中断和恢复
 */

export interface FlowToken {
  value: number;
  isValid: () => boolean;
}

export class AsyncFlowController {
  private tokenValue = 0;
  private pausePromise: Promise<void> | null = null;
  private pauseResolve: (() => void) | null = null;

  /** 获取当前流程令牌 */
  getToken(): FlowToken {
    const capturedValue = this.tokenValue;
    return {
      value: capturedValue,
      isValid: () => this.tokenValue === capturedValue,
    };
  }

  /** 中断当前流程（使所有旧令牌失效） */
  interrupt(): void {
    this.tokenValue += 1;
  }

  /** 检查令牌是否仍然有效 */
  isTokenValid(token: FlowToken): boolean {
    return token.isValid();
  }

  /** 暂停流程 */
  pause(): void {
    if (!this.pausePromise) {
      this.pausePromise = new Promise((resolve) => {
        this.pauseResolve = resolve;
      });
    }
  }

  /** 恢复流程 */
  resume(): void {
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pausePromise = null;
      this.pauseResolve = null;
    }
  }

  /** 等待暂停解除 */
  async waitForUnpause(): Promise<void> {
    if (this.pausePromise) {
      await this.pausePromise;
    }
  }

  /** 是否处于暂停状态 */
  isPaused(): boolean {
    return this.pausePromise !== null;
  }
}

/** 延迟工具函数 */
export const delay = (ms: number): Promise<void> => 
  new Promise((resolve) => setTimeout(resolve, ms));

/** 随机延迟工具函数 */
export const randomDelay = (minMs: number, maxMs: number): Promise<void> => {
  const ms = Math.floor(minMs + Math.random() * (maxMs - minMs));
  return delay(ms);
};

/** 计算唯一最高票（用于投票结算） */
export function computeUniqueTopSeat(votes: Record<string, number>): number | null {
  const counts: Record<number, number> = {};
  for (const seat of Object.values(votes)) {
    counts[seat] = (counts[seat] || 0) + 1;
  }
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;

  let max = -1;
  for (const [, c] of entries) max = Math.max(max, c);

  const topSeats = entries
    .filter(([, c]) => c === max)
    .map(([s]) => Number(s));

  return topSeats.length === 1 ? topSeats[0] : null;
}

/** 从平票中随机选择一个 */
export function pickRandomFromTie(votes: Record<string, number>): number {
  const counts: Record<number, number> = {};
  for (const seat of Object.values(votes)) {
    counts[seat] = (counts[seat] || 0) + 1;
  }
  const entries = Object.entries(counts);
  let max = -1;
  for (const [, c] of entries) max = Math.max(max, c);
  const topSeats = entries.filter(([, c]) => c === max).map(([s]) => Number(s));
  return topSeats[Math.floor(Math.random() * topSeats.length)];
}
