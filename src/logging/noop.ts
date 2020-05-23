import { Logger } from '../types/logger'

/* istanbul ignore next */
// tslint:disable-next-line:no-empty
const noop = () => {}

/**
 * No-op logger.
 */
export const noopLogger: Logger = {
  trace: noop,
  debug: noop,
  info: noop,
  error: noop,
  warn: noop,
}
