/**
 * Credit-based flow control for stream backpressure.
 *
 * The flow control mechanism uses a REQUEST_N pattern:
 * - The receiver grants the sender N credits (permission to send N messages).
 * - The sender decrements credits with each MESSAGE sent.
 * - When credits reach 0, the sender must pause until more credits arrive.
 * - The receiver sends REQUEST_N frames to grant more credits.
 *
 * This prevents fast producers from overwhelming slow consumers.
 */

import { CancelledError } from './errors.js';

/** Default initial credits granted to a new stream. */
export const DEFAULT_INITIAL_CREDITS = 16;

/** Default credits to replenish when low watermark is hit. */
export const DEFAULT_REPLENISH_CREDITS = 16;

/** When outstanding credits drop to this fraction, request more. */
export const LOW_WATERMARK_RATIO = 0.25;

/** Waiter entry storing both resolve and reject callbacks. */
interface Waiter {
  resolve: () => void;
  reject: (err: Error) => void;
}

/**
 * Tracks send-side credits. The sender uses this to know when it can send.
 */
export class SendFlowController {
  private credits = 0;
  private waiters: Waiter[] = [];

  /** Current available credits */
  get available(): number {
    return this.credits;
  }

  /** Add credits (called when REQUEST_N is received from peer) */
  addCredits(n: number): void {
    this.credits += n;
    // Wake up any waiters
    while (this.waiters.length > 0 && this.credits > 0) {
      const waiter = this.waiters.shift()!;
      this.credits--;
      waiter.resolve();
    }
  }

  /**
   * Acquire a credit before sending a message.
   * Returns immediately if credits are available.
   * Otherwise, returns a promise that resolves when credits are granted.
   */
  async acquire(signal?: AbortSignal): Promise<void> {
    if (this.credits > 0) {
      this.credits--;
      return;
    }

    // Wait for credits
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = { resolve, reject };

      const onAbort = () => {
        const idx = this.waiters.indexOf(waiter);
        if (idx >= 0) this.waiters.splice(idx, 1);
        reject(signal!.reason ?? new Error('Aborted'));
      };

      signal?.addEventListener('abort', onAbort, { once: true });

      // Wrap resolve to also remove abort listener
      const originalResolve = waiter.resolve;
      waiter.resolve = () => {
        signal?.removeEventListener('abort', onAbort);
        originalResolve();
      };

      // Wrap reject to also remove abort listener
      const originalReject = waiter.reject;
      waiter.reject = (err: Error) => {
        signal?.removeEventListener('abort', onAbort);
        originalReject(err);
      };

      this.waiters.push(waiter);
    });
  }

  /** Try to acquire a credit without waiting. Returns false if none available. */
  tryAcquire(): boolean {
    if (this.credits > 0) {
      this.credits--;
      return true;
    }
    return false;
  }

  /** Cancel all pending waiters, rejecting them with CancelledError. */
  cancel(): void {
    const waiters = this.waiters.splice(0);
    const err = new CancelledError('Flow controller cancelled');
    for (const waiter of waiters) {
      waiter.reject(err);
    }
  }
}

/**
 * Tracks receive-side credits. The receiver uses this to decide when to send REQUEST_N.
 */
export class ReceiveFlowController {
  private granted: number;
  private consumed = 0;
  private readonly initialCredits: number;
  private readonly lowWatermark: number;
  private readonly replenishAmount: number;

  constructor(
    initialCredits: number = DEFAULT_INITIAL_CREDITS,
    replenishAmount: number = DEFAULT_REPLENISH_CREDITS,
  ) {
    this.initialCredits = initialCredits;
    this.granted = initialCredits;
    this.replenishAmount = replenishAmount;
    this.lowWatermark = Math.max(1, Math.floor(initialCredits * LOW_WATERMARK_RATIO));
  }

  /** Initial credits to advertise to the sender. */
  get initialCreditCount(): number {
    return this.initialCredits;
  }

  /**
   * Called when a MESSAGE is received.
   * Returns the number of new credits to send (0 if no REQUEST_N needed).
   */
  onMessageReceived(): number {
    this.consumed++;
    const remaining = this.granted - this.consumed;
    if (remaining <= this.lowWatermark) {
      // Replenish
      this.granted += this.replenishAmount;
      return this.replenishAmount;
    }
    return 0;
  }

  /** Reset the controller, restoring to initial credits. */
  reset(): void {
    this.consumed = 0;
    this.granted = this.initialCredits;
  }
}
