import type { IPreimageServiceHandler } from '../../../proto/generated/server.js';
import type { PreimageLookupRequest, PreimageLookupEvent } from '../../../proto/generated/messages.js';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes.slice(0, 8), b => b.toString(16).padStart(2, '0')).join('');
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const preimageHandler: IPreimageServiceHandler = {
  async *lookupSubscribe(request: PreimageLookupRequest): AsyncGenerator<PreimageLookupEvent> {
    const keyHex = toHex(request.key);
    console.log(`[host] preimage lookupSubscribe key=0x${keyHex}...`);

    // First event: preimage not yet available (empty value)
    yield { value: new Uint8Array(0) };

    // Simulate network fetch delay
    await delay(500);

    // Second event: preimage resolved with mock data derived from the key
    const mockData = new Uint8Array(64);
    const keyLen = request.key.length || 1;
    for (let i = 0; i < mockData.length; i++) {
      mockData[i] = (request.key[i % keyLen] ?? 0) ^ 0xff;
    }
    console.log(`[host] preimage resolved for key=0x${keyHex}...`);
    yield { value: mockData };
  },
};
