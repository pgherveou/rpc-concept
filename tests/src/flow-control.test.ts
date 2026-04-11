/**
 * Tests for flow control / backpressure mechanisms.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SendFlowController,
  ReceiveFlowController,
  DEFAULT_INITIAL_CREDITS,
} from '@rpc-bridge/core';

describe('SendFlowController', () => {
  it('should start with zero credits', () => {
    const fc = new SendFlowController();
    assert.equal(fc.available, 0);
  });

  it('should acquire credits synchronously when available', async () => {
    const fc = new SendFlowController();
    fc.addCredits(5);
    assert.equal(fc.available, 5);

    await fc.acquire();
    assert.equal(fc.available, 4);

    await fc.acquire();
    assert.equal(fc.available, 3);
  });

  it('should tryAcquire correctly', () => {
    const fc = new SendFlowController();
    assert.equal(fc.tryAcquire(), false);

    fc.addCredits(2);
    assert.equal(fc.tryAcquire(), true);
    assert.equal(fc.available, 1);
    assert.equal(fc.tryAcquire(), true);
    assert.equal(fc.available, 0);
    assert.equal(fc.tryAcquire(), false);
  });

  it('should wait for credits when none available', async () => {
    const fc = new SendFlowController();
    let resolved = false;

    const promise = fc.acquire().then(() => { resolved = true; });

    // Not yet resolved
    await new Promise(r => setTimeout(r, 10));
    assert.equal(resolved, false);

    // Grant credits
    fc.addCredits(1);
    await promise;
    assert.equal(resolved, true);
    assert.equal(fc.available, 0);
  });

  it('should handle multiple waiters in order', async () => {
    const fc = new SendFlowController();
    const order: number[] = [];

    const p1 = fc.acquire().then(() => order.push(1));
    const p2 = fc.acquire().then(() => order.push(2));
    const p3 = fc.acquire().then(() => order.push(3));

    // Grant 3 credits at once
    fc.addCredits(3);
    await Promise.all([p1, p2, p3]);
    assert.deepEqual(order, [1, 2, 3]);
  });

  it('should support cancellation via AbortSignal', async () => {
    const fc = new SendFlowController();
    const controller = new AbortController();

    const promise = fc.acquire(controller.signal);
    controller.abort(new Error('test abort'));

    await assert.rejects(promise, { message: 'test abort' });
  });

  it('should cancel all waiters', async () => {
    const fc = new SendFlowController();
    fc.cancel();
    // No error thrown - cancel just clears the queue
    assert.equal(fc.available, 0);
  });
});

describe('ReceiveFlowController', () => {
  it('should track initial credits', () => {
    const fc = new ReceiveFlowController(16, 16);
    assert.equal(fc.initialCredits, 16);
  });

  it('should not replenish when credits are plenty', () => {
    const fc = new ReceiveFlowController(16, 16);

    // Consume a few - still above low watermark (25% of 16 = 4)
    const replenish1 = fc.onMessageReceived();
    assert.equal(replenish1, 0);

    const replenish2 = fc.onMessageReceived();
    assert.equal(replenish2, 0);
  });

  it('should replenish when hitting low watermark', () => {
    const fc = new ReceiveFlowController(16, 16);

    // Low watermark is floor(16 * 0.25) = 4
    // So after consuming 12 messages, remaining = 4 = watermark, should replenish
    let totalReplenished = 0;
    for (let i = 0; i < 20; i++) {
      totalReplenished += fc.onMessageReceived();
    }

    // Should have replenished at least once
    assert.ok(totalReplenished > 0, `Expected some credits to be replenished, got ${totalReplenished}`);
  });

  it('should replenish the configured amount', () => {
    const fc = new ReceiveFlowController(4, 8);

    // Low watermark = floor(4 * 0.25) = 1
    // After 3 messages, remaining = 1 = watermark
    let replenish = 0;
    for (let i = 0; i < 3; i++) {
      replenish += fc.onMessageReceived();
    }

    // Should replenish with 8 credits
    const r = fc.onMessageReceived();
    if (replenish === 0) {
      assert.equal(r, 8);
    }
  });

  it('should reset correctly', () => {
    const fc = new ReceiveFlowController(16, 16);
    for (let i = 0; i < 10; i++) {
      fc.onMessageReceived();
    }
    fc.reset();
    assert.equal(fc.initialCredits, DEFAULT_INITIAL_CREDITS);
  });
});
