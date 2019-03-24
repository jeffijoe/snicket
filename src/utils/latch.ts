/**
 * A DuplexLatch is used to stop accepting new requests and wait
 * for any in-flight requests to complete.
 *
 * I don't know if "latch" is the right word but it kinda reminds me of
 * CountdownLatch in Java so ¯\_(ツ)_/¯
 */
export interface DuplexLatch {
  /**
   * Enters the latch.
   */
  enter(): void
  /**
   * Exits the latch. Should be called only when having entered.
   */
  exit(): void
  /**
   * Waits for all to have exited.
   */
  wait(): Promise<void>
}

/**
 * Creates a duplex latch.
 */
export function createDuplexLatch(): DuplexLatch {
  let count = 0
  let pendingResolves: Array<Function> = []

  return {
    enter() {
      count++
    },
    exit() {
      count--
      maybeTriggerResolves()
    },
    wait() {
      return new Promise(resolve => {
        pendingResolves.push(resolve)
        maybeTriggerResolves()
      })
    }
  }

  function maybeTriggerResolves() {
    if (count <= 0) {
      pendingResolves.forEach(r => r())
      pendingResolves = []
    }
  }
}
