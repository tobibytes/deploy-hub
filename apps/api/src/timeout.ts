/**
 * A hung Docker socket used to stop Rig from starting at all, which meant the
 * dashboard and the health check were unreachable exactly when they were most
 * needed. Every call out to Docker now carries a deadline.
 */
export class TimeoutError extends Error {
  constructor(what: string, ms: number) {
    super(`${what} did not answer within ${Math.round(ms / 1000)} seconds.`);
    this.name = 'TimeoutError';
  }
}

export async function withTimeout<T>(what: string, ms: number, work: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(what, ms)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
