import BigInteger from 'big-integer'
import { StreamStore, ReadDirection } from '../types/stream-store'
import { Logger } from '../types/logger'
import { delay } from './promise-util'
import { ReadFrom } from '../types/messages'

/**
 * Detects gaps and reloads.
 * Idea & original implementation: https://github.com/SQLStreamStore/SQLStreamStore/blob/master/src/SqlStreamStore/Infrastructure/ReadonlyStreamStoreBase.cs#L68
 *
 * Under heavy parallel load, gaps may appear in the position sequence due to sequence
 * number reservation of in-flight transactions.
 * Here we check if there are any gaps, and in the unlikely event there is, we delay a little bit
 * and re-issue the read. This is expected
 *
 * @param logger
 * @param reloadDelay
 * @param readAll
 */
export async function detectGapsAndReloadAll(
  logger: Logger,
  reloadDelay: number,
  reloadTimes: number,
  fromPositionInclusive: string | ReadFrom,
  count: number,
  readAll: StreamStore['readAll']
) {
  let result = await readAll(fromPositionInclusive, count)
  let reloadCount = 0
  // If we are not on the last page, then there's likely no transient gaps,
  // and we can save a bunch of time by not checking and reloading.
  if (!result.isEnd || result.messages.length <= 1) {
    return result
  }

  // Check for gaps between the last page and the one we just got.
  while (
    result.messages[0].position !== fromPositionInclusive &&
    reloadCount < reloadTimes
  ) {
    result = await reloadAfterDelay(++reloadCount)
  }

  // Detect gaps between messages.
  reloadCount = 0
  let foundGap = false
  do {
    foundGap = false
    // -1 because we reference the last message using +1 in the loop.
    for (let i = 0; i < result.messages.length - 1; i++) {
      const thisMessage = result.messages[i]
      const nextMessage = result.messages[i + 1]
      if (
        BigInteger(thisMessage.position)
          .plus(1)
          .notEquals(BigInteger(nextMessage.position))
      ) {
        // That's a gap!
        foundGap = true
        result = await reloadAfterDelay(++reloadCount)
        break
      }
    }

    // The last message's position should be
  } while (foundGap && reloadCount < reloadTimes)

  return result

  /**
   * Does the delay and reload.
   */
  async function reloadAfterDelay(attempt: number) {
    logger.trace(
      `gap-detection: gap detected in position, reloading after ${reloadDelay}ms (attempt ${attempt} / ${reloadTimes})`
    )
    await delay(reloadDelay)
    return readAll(fromPositionInclusive, count, ReadDirection.Forward)
  }
}
