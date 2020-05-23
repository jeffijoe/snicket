/**
 * Promise Delay
 *
 * @param ms
 */
export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
