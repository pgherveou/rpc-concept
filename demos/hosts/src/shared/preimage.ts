import type { IPreimageServiceHandler } from '../../../proto/generated/server.js';
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> origin/pg/issue-11-permissions-service
import type { PreimageLookupEvent } from '../../../proto/generated/messages.js';

export const preimageHandler: IPreimageServiceHandler = {
  async *lookupSubscribe(): AsyncGenerator<PreimageLookupEvent> {
    yield { value: new Uint8Array(32) };
<<<<<<< HEAD
=======
import type { PreimageLookupRequest, PreimageLookupEvent } from '../../../proto/generated/messages.js';

// Simulated preimage cache (hex key -> resolved bytes)
const preimageCache = new Map<string, Uint8Array>();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function deriveMockPreimage(key: Uint8Array): Uint8Array {
  const data = new Uint8Array(32);
  const keyLen = key.length || 1;
  for (let i = 0; i < data.length; i++) {
    data[i] = (key[i % keyLen] ?? 0) ^ 0xff;
  }
  return data;
}

export const preimageHandler: IPreimageServiceHandler = {
  async *lookupSubscribe(request: PreimageLookupRequest): AsyncGenerator<PreimageLookupEvent> {
    const keyHex = toHex(request.key);
    console.log(`[host] preimage lookupSubscribe key=0x${keyHex}`);

    const cached = preimageCache.get(keyHex);
    if (cached) {
      console.log(`[host] preimage cache hit for key=0x${keyHex}`);
      yield { value: cached };
      return;
    }

    // Not cached: emit empty value (preimage pending)
    yield { value: new Uint8Array(0) };

    // Simulate IPFS fetch delay
    await delay(2000);

    // Resolve, cache, and emit
    const resolved = deriveMockPreimage(request.key);
    preimageCache.set(keyHex, resolved);
    console.log(`[host] preimage resolved for key=0x${keyHex}`);
    yield { value: resolved };
>>>>>>> origin/pg/impl-preimage-service
=======
>>>>>>> origin/pg/issue-11-permissions-service
  },
};
