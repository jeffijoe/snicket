import { StreamStoreNotifier } from '../types/subscriptions'
import { DisposedError } from '../errors/errors'

/**
 * In-memory stream store notifier.
 */
export interface InMemoryNotifier extends StreamStoreNotifier {
  /**
   * Invokes all the observers.
   */
  invoke(): void
}

/**
 * Creates an in-memory stream store notifier.
 */
export function createInMemoryNotifier(): InMemoryNotifier {
  let observers: Array<Function> = []
  let disposed = false
  return {
    invoke() {
      // tslint:disable-next-line:no-floating-promises
      Promise.resolve().then(() => observers.forEach(o => o()))
    },
    listen(cb) {
      DisposedError.assert(!disposed, 'The notifier has been disposed.')
      observers.push(cb)
      return () => {
        observers = observers.filter(o => o !== cb)
      }
    },
    async dispose() {
      DisposedError.assert(!disposed, 'The notifier has already been disposed.')
      disposed = true
      observers = []
    }
  }
}
