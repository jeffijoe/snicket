import ms from 'ms'

/**
 * Creates a clock for testing.
 *
 * @param start
 */
export function createClock(start: Date = new Date()) {
  let time = start
  return {
    get: () => time,
    tick: (amount = '1s') => {
      time = new Date(time.getTime() + ms(amount))
    },
  }
}
