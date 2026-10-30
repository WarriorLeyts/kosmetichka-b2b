/**
 * One change of an order at a time: the status buttons, the assembly check, the customer's cancel /
 * confirm and the items editor of the same order run one after another, never interleaved (a double tap
 * or the customer cancelling while the manager moves the order can't both win). The site is one Node
 * process (pm2 fork), so an in-memory queue per order is enough.
 */
const g = globalThis as unknown as { __orderLocks?: Map<number, Promise<void>> };

export async function withOrderLock<T>(orderId: number, fn: () => Promise<T>): Promise<T> {
  if (!Number.isInteger(orderId) || orderId <= 0) return fn();
  const locks = (g.__orderLocks ??= new Map());
  const prev = locks.get(orderId) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  const tail = prev.then(() => mine);
  locks.set(orderId, tail);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(orderId) === tail) locks.delete(orderId);
  }
}

/** POST/PUT handler with params { id } → the same handler under the order's lock */
export function lockedByOrderId<Q, C extends { params: Promise<{ id: string }> }, R>(handler: (request: Q, ctx: C) => Promise<R>) {
  return async (request: Q, ctx: C): Promise<R> => {
    const { id } = await ctx.params;
    return withOrderLock(Number(id), () => handler(request, ctx));
  };
}
