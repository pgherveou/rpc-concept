/**
 * Tests for stream lifecycle management.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  Stream,
  StreamState,
  StreamManager,
  RpcError,
  RpcStatusCode,
} from '@rpc-bridge/core';

const enc = new TextEncoder();
const dec = new TextDecoder();
function toBytes(s: string): Uint8Array { return enc.encode(s); }
function fromBytes(b: Uint8Array): string { return dec.decode(b); }

describe('Stream', () => {
  it('should start in IDLE state', () => {
    const stream = new Stream(1);
    assert.equal(stream.state, StreamState.IDLE);
    assert.equal(stream.streamId, 1);
  });

  it('should transition to OPEN state', () => {
    const stream = new Stream(1);
    stream.open();
    assert.equal(stream.state, StreamState.OPEN);
  });

  it('should track send sequence numbers', () => {
    const stream = new Stream(1);
    assert.equal(stream.nextSendSequence(), 1);
    assert.equal(stream.nextSendSequence(), 2);
    assert.equal(stream.nextSendSequence(), 3);
  });

  it('should validate receive sequence numbers', () => {
    const stream = new Stream(1);
    assert.equal(stream.validateReceiveSequence(1), true);
    assert.equal(stream.validateReceiveSequence(2), true);
    assert.equal(stream.validateReceiveSequence(4), false); // Out of order
  });

  it('should skip validation for sequence 0', () => {
    const stream = new Stream(1);
    assert.equal(stream.validateReceiveSequence(0), true);
  });

  it('should queue and deliver messages', async () => {
    const stream = new Stream(1);
    stream.open();

    stream.pushMessage(toBytes('hello'));
    stream.pushMessage(toBytes('world'));
    stream.pushEnd();

    const messages: string[] = [];
    for await (const msg of stream.messages()) {
      messages.push(fromBytes(msg));
    }
    assert.deepEqual(messages, ['hello', 'world']);
  });

  it('should handle async message delivery', async () => {
    const stream = new Stream(1);
    stream.open();

    const consumer = (async () => {
      const messages: string[] = [];
      for await (const msg of stream.messages()) {
        messages.push(fromBytes(msg));
      }
      return messages;
    })();

    await new Promise(r => setTimeout(r, 10));
    stream.pushMessage(toBytes('a'));
    await new Promise(r => setTimeout(r, 10));
    stream.pushMessage(toBytes('b'));
    await new Promise(r => setTimeout(r, 10));
    stream.pushEnd();

    const result = await consumer;
    assert.deepEqual(result, ['a', 'b']);
  });

  it('should propagate errors through the message iterator', async () => {
    const stream = new Stream(1);
    stream.open();

    stream.pushMessage(toBytes('ok'));
    stream.pushError(new RpcError(RpcStatusCode.INTERNAL, 'test error'));

    const messages: string[] = [];
    await assert.rejects(async () => {
      for await (const msg of stream.messages()) {
        messages.push(fromBytes(msg));
      }
    }, (err) => {
      return err instanceof RpcError && err.code === RpcStatusCode.INTERNAL;
    });
    assert.deepEqual(messages, ['ok']);
  });

  it('should collect a single unary response', async () => {
    const stream = new Stream(1);
    stream.open();

    stream.pushMessage(toBytes('response'));
    stream.pushEnd();

    const result = await stream.collectUnary();
    assert.equal(fromBytes(result), 'response');
  });

  it('should throw on empty unary response', async () => {
    const stream = new Stream(1);
    stream.open();

    stream.pushEnd();

    await assert.rejects(
      () => stream.collectUnary(),
      (err) => err instanceof RpcError && err.code === RpcStatusCode.INTERNAL,
    );
  });

  it('should throw on multiple messages in unary response', async () => {
    const stream = new Stream(1);
    stream.open();

    stream.pushMessage(toBytes('first'));
    stream.pushMessage(toBytes('second'));
    stream.pushEnd();

    await assert.rejects(
      () => stream.collectUnary(),
      (err) => err instanceof RpcError && err.message.includes('another message'),
    );
  });

  it('should support cancellation', () => {
    const stream = new Stream(1);
    stream.open();
    assert.equal(stream.signal.aborted, false);

    stream.cancel('test reason');
    assert.equal(stream.state, StreamState.CANCELLED);
    assert.equal(stream.signal.aborted, true);
  });

  it('should not cancel already-closed streams', () => {
    const stream = new Stream(1);
    stream.setState(StreamState.CLOSED);
    stream.cancel();
    assert.equal(stream.state, StreamState.CLOSED);
  });

  it('should handle metadata', () => {
    const stream = new Stream(1);
    stream.setResponseMetadata({ 'key': 'value' });
    assert.deepEqual(stream.responseMetadata, { 'key': 'value' });
  });

  it('should store trailers on end', async () => {
    const stream = new Stream(1);
    stream.open();
    stream.pushMessage(toBytes('msg'));
    stream.pushEnd({ 'trailer-key': 'trailer-value' });

    for await (const _ of stream.messages()) { /* consume */ }
    assert.deepEqual(stream.trailers, { 'trailer-key': 'trailer-value' });
  });
});

describe('StreamManager', () => {
  it('should allocate odd IDs for client side', () => {
    const mgr = new StreamManager(true);
    const s1 = mgr.createStream();
    const s2 = mgr.createStream();
    const s3 = mgr.createStream();
    assert.equal(s1.streamId, 1);
    assert.equal(s2.streamId, 3);
    assert.equal(s3.streamId, 5);
  });

  it('should allocate even IDs for server side', () => {
    const mgr = new StreamManager(false);
    const s1 = mgr.createStream();
    const s2 = mgr.createStream();
    assert.equal(s1.streamId, 2);
    assert.equal(s2.streamId, 4);
  });

  it('should get streams by ID', () => {
    const mgr = new StreamManager(true);
    const s = mgr.createStream();
    assert.strictEqual(mgr.getStream(s.streamId), s);
    assert.equal(mgr.getStream(999), undefined);
  });

  it('should remove streams', () => {
    const mgr = new StreamManager(true);
    const s = mgr.createStream();
    mgr.removeStream(s.streamId);
    assert.equal(mgr.getStream(s.streamId), undefined);
    assert.equal(mgr.size, 0);
  });

  it('should register external streams', () => {
    const mgr = new StreamManager(false);
    const stream = new Stream(77);
    mgr.registerStream(stream);
    assert.strictEqual(mgr.getStream(77), stream);
  });

  it('should cancel all streams', () => {
    const mgr = new StreamManager(true);
    const s1 = mgr.createStream();
    const s2 = mgr.createStream();
    s1.open();
    s2.open();

    mgr.cancelAll('shutdown');
    assert.equal(s1.state, StreamState.CANCELLED);
    assert.equal(s2.state, StreamState.CANCELLED);
    assert.equal(mgr.size, 0);
  });

  it('should track size correctly', () => {
    const mgr = new StreamManager(true);
    assert.equal(mgr.size, 0);
    mgr.createStream();
    assert.equal(mgr.size, 1);
    mgr.createStream();
    assert.equal(mgr.size, 2);
  });
});
