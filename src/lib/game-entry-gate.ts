/** Keeps a newly generated game in the lobby until its entrance finishes. */
export class GameEntryGate {
  private pending: { roundId: string; resolve: (completed: boolean) => void } | null = null;

  wait(roundId: string): Promise<boolean> {
    this.cancel();
    return new Promise((resolve) => { this.pending = { roundId, resolve }; });
  }

  complete(roundId: string): void {
    if (this.pending?.roundId !== roundId) return;
    const pending = this.pending;
    this.pending = null;
    pending.resolve(true);
  }

  cancel(): void {
    const pending = this.pending;
    this.pending = null;
    pending?.resolve(false);
  }
}
