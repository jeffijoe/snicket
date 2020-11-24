import { DisposedError } from '../errors/errors'
import { noopLogger } from '../logging/noop'
import { Logger } from '../types/logger'

/**
 * Guardian that ensures a spawned actor is
 * restarted when necessary.
 */
export interface Guardian {
  /**
   * Spawn the actor and keep it running until
   * we dispose the guardian.
   */
  start(): void
  /**
   * Disposes the guardian by shutting down the spawned actor.
   */
  dispose(): Promise<void>
}

/**
 * Guardian controller.
 */
export interface GuardianController {
  /**
   * Report an error. Will trigger a restart.
   *
   * @param error
   */
  onError(error: Error): void
  /**
   * Resets the restart count.
   */
  resetRestartCount(): void
}

/**
 * The actor itself.
 */
export interface Actor {
  /**
   * Name of the actor, used for debugging.
   */
  readonly name: string
  /**
   * Startup sequence of the actor.
   */
  startup(): Promise<unknown>
  /**
   * Shutdown sequence of the actor. Called even on fail.
   */
  shutdown(): Promise<unknown>
}

/**
 * Options for creating a Guardian.
 */
export interface GuardianOptions {
  /**
   * Max amount of times to restart before giving up.
   */
  maxRestarts?: number
  /**
   * The logger to use.
   */
  logger?: Logger
  /**
   * Called when restarts are exhausted.
   */
  onRestartsExhausted?: () => void
  /**
   * Spawner for the actor.
   */
  spawn: (controller: GuardianController) => Actor
}

/**
 * Creates a guardian.
 *
 * @param logger
 * @param spawn
 */
export function Guardian({
  onRestartsExhausted,
  spawn,
  maxRestarts = 10,
  logger = noopLogger,
}: GuardianOptions): Guardian {
  let actor = noopActor
  let restartCount = 0
  let actorStartPromise: Promise<unknown> = Promise.resolve()
  let actorRestartPromise: Promise<unknown> = Promise.resolve()
  let disposed = false
  let reportRetriesExhausted: (() => void) | undefined
  const controller: GuardianController = {
    async onError(err) {
      if (disposed || restartCount >= maxRestarts) {
        return
      }
      await actorRestartPromise
      logger.error(`Error in ${actor.name}. Will restart.`, err)
      actorRestartPromise = restart()
    },
    resetRestartCount() {
      restartCount = 0
    },
  }

  return {
    start,
    dispose,
  }

  /**
   * Starts the guardian and spawns the first actor.
   */
  function start() {
    DisposedError.assert(!disposed)
    logger.trace(`Guardian starting.`)
    // Will never throw.
    spawnAndStartActor().catch(Boolean)
  }

  /**
   * Spawns and starts the actor.
   */
  async function spawnAndStartActor() {
    actor = spawn(controller)
    logger.trace(`Starting ${actor.name}`)
    actorStartPromise = Promise.resolve().then(() =>
      actor
        .startup()
        .then(() => logger.trace(`${actor.name} has been started.`))
        .catch((err) => {
          controller.onError(err)
        })
    )
    return actorStartPromise
  }

  /**
   * Restarts the actor by shutting it down first,
   * then spawning another one. Also tracks restart counts.
   */
  async function restart() {
    restartCount++
    if (restartCount >= maxRestarts) {
      logger.warn(`Restarts exhausted for ${actor.name} .`)
      /* istanbul ignore else */
      if (onRestartsExhausted) {
        onRestartsExhausted()
      }

      await shutdownCurrentActor()
      return
    }
    await actorRestartPromise
    await shutdownCurrentActor()
    await spawnAndStartActor()
  }

  /**
   * Disposes of the Guardian by shutting down the running actor.
   */
  async function dispose() {
    DisposedError.assert(!disposed)
    disposed = true
    if (actor === noopActor) {
      return
    }
    logger.trace(`Disposing of Guardian for ${actor.name}`)
    await actorStartPromise
    await shutdownCurrentActor()
    logger.trace(`Guardian for ${actor.name} has been disposed.`)
  }

  /**
   * Shuts down the running actor.
   */
  async function shutdownCurrentActor() {
    logger.trace(`Shutting down ${actor.name}`)
    await actor
      .shutdown()
      .then(() => logger.trace(`${actor.name} has been shut down.`))
      .catch((err) =>
        logger.error(`Error while shutting down actor ${actor.name}:`, err)
      )
  }
}

/* istanbul ignore next: noop actor never used. */
/**
 * The no-op actor.
 */
const noopActor: Actor = {
  name: 'noop',
  startup: () => Promise.resolve(),
  shutdown: () => Promise.resolve(),
}
