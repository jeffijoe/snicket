const handlers = new Map<string, (cmd: any) => Promise<void>>()

/**
 * Register a command handler for the specified type.
 *
 * @param type
 * @param handler
 */
export function register<T extends { type: string }>(
  type: T['type'],
  handler: (cmd: T) => Promise<void>
) {
  handlers.set(type, handler)
}

/**
 * Dispatches the specified command.
 *
 * @param cmd
 */
export async function dispatch(cmd: { type: string }) {
  const handler = handlers.get(cmd.type)
  if (!handler) throw new TypeError('no handler registered for ' + cmd.type)

  await handler(cmd)
}
