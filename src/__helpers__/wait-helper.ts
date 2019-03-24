import { delay } from '../utils/promise-util'

/**
 * Waits until the loop returns true.
 *
 * @param loop
 * @param ms
 */
export async function waitUntil<T>(loop: () => T | Promise<T>, ms = 50) {
  do {
    const result = await Promise.resolve(loop())
    if (result) {
      return result
    }
    await delay(ms)
  } while (true)
}
