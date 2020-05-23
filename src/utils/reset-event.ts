/**
 * Like C#'s reset event, used to wait for a repeating event to occur before
 * continuing.
 */
export function createResetEvent(initial = false): ResetEvent {
  let _resolves: Array<Function> = []
  let _set = initial
  return {
    set,
    reset,
    wait,
  }

  function set() {
    _set = true
    trigger()
  }

  function reset() {
    _set = false
  }

  function wait() {
    const p = new Promise<void>((r) => _resolves.push(r))
    if (_set) {
      trigger()
    }

    return p
  }

  function trigger() {
    for (let i in _resolves) {
      _resolves[i]()
    }
    _resolves = []
  }
}

/**
 * Reset event.
 */
export interface ResetEvent {
  /**
   * Resolves waiting promises and sets the event.
   */
  set(): void
  /**
   * Resets the event.
   */
  reset(): void
  /**
   * Wait until the next set.
   */
  wait(): Promise<void>
}
