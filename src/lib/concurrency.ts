/** 以固定并发处理列表；worker 抛错会在当前批次结束后向上传播，未开始的项不再执行。 */
export async function forEachWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  let failed = false;
  const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (!failed && cursor < items.length) {
      const item = items[cursor++];
      try {
        await worker(item);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  });
  const results = await Promise.allSettled(runners);
  const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (rejected) throw rejected.reason;
}
