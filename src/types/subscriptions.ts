import { StreamMessage, StreamVersion, MessagePosition } from './messages'

/**
 * Stream Subscription.
 */
export interface StreamSubscription extends Subscription {
  /**
   * Stream ID.
   */
  streamId: string
}

/**
 * All Messages Subscription.
 */
export interface AllSubscription extends Subscription {}

/**
 * Subscription.
 */
export interface Subscription {
  /**
   * Unsubscribes and disposes the subscription.
   */
  dispose(): Promise<void>
}

/**
 * Options for stream subscriptions.
 */
export interface StreamSubscriptionOptions extends SubscriptionOptions {
  /**
   * Start notifying after this version (exclusive).
   * You can use `SubscribeAt` enum for meta versions.
   */
  afterVersion?: StreamVersion | SubscribeAt
}

/**
 * Options for subscribing to the all-stream.
 */
export interface AllSubscriptionOptions extends SubscriptionOptions {
  /**
   * Start notifying after this position (exclusive).
   * You can use `SubscribeAt` enum for meta positions.
   */
  afterPosition?: MessagePosition | SubscribeAt
}

/**
 * Subscription options.
 */
export interface SubscriptionOptions {
  /**
   * Max amount of messages to pull at a time.
   */
  maxCountPerRead?: number
  /**
   * A callback that is invoked with `caughtUp: true` when the subscription has caught up with the stream
   * (when the underlying read has isEnd=true) and when it falls behind (when the underlying page read
   * has isEnd=false).
   *
   * Return value is not used for anything.
   */
  onCaughtUpChanged?: (caughtUp: boolean) => void
  /**
   * If the message processor throws an error, the subscription will be dropped. This callback
   * is called if that happens.
   */
  onSubscriptionDropped?: () => void
  /**
   * Called when the subscription is disposed, and will wait for the promise to resolve.
   */
  dispose?: () => Promise<void>
}

/**
 * Special stream versions used to start subscribing at a specific point.
 */
export enum SubscribeAt {
  /**
   * Subscribe from the beginning.
   */
  Beginning = -2,
  /**
   * Subscribe at the end
   */
  End = -1
}

/**
 * Message processor function.
 */
export type MessageProcessor = (message: StreamMessage) => Promise<void>

/**
 * Used to notify a subscription that there are changes to pull.
 */
export interface StreamStoreNotifier {
  /**
   * Adds a listener to the notifier, returns a disposer.
   *
   * @param cb
   */
  listen(cb: () => void): () => void
  /**
   * Disposes the notifier.
   */
  dispose(): Promise<void>
}
