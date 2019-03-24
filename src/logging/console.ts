import { Logger, LogLevel } from '../types/logger'
import { assert } from '../utils/invariant'

const levels: Array<LogLevel> = ['trace', 'debug', 'warn', 'error', 'off']
const emojis: Record<LogLevel, string> = {
  trace: '🕵️‍ ',
  debug: '🐞',
  warn: '⚠️ ',
  error: '🚨',
  off: ''
}

/* istanbul ignore next */
// tslint:disable-next-line:no-empty
const noop = () => {}

/**
 * Creates a console logger.
 *
 * @param con
 */
export function createConsoleLogger(
  logLevel: LogLevel = 'error',
  con: any = global.console
): Logger {
  assert(`Unknown log level "${logLevel}"`, levels.includes(logLevel))

  return {
    trace: makeLogMethod('trace'),
    debug: makeLogMethod('debug'),
    warn: makeLogMethod('warn'),
    error: makeLogMethod('error')
  }

  function makeLogMethod(level: keyof Logger) {
    const emoji = emojis[level]
    if (levels.indexOf(level) >= levels.indexOf(logLevel)) {
      return (...args: any[]) => {
        con.log(
          `\u001b[90m[${new Date().toISOString()}]\u001b[39m ${emoji}`,
          ...args,
          '\n'
        )
      }
    }
    return noop
  }
}
