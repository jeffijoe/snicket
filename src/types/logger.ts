/**
 * Log level.
 */
export type LogLevel = keyof Logger | 'off'

/**
 * Logger interface.
 */
export interface Logger {
  trace(message: string, data?: any): void
  debug(message: string, data?: any): void
  warn(message: string, data?: any): void
  error(message: string, data?: any): void
}
