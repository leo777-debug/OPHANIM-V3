/** Resolves to null when the work takes longer than the limit (the work itself keeps running). */
export function withTimeout<T>(work: Promise<T>, milliseconds: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), milliseconds); });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}
