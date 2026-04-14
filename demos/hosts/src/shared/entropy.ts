import type { IEntropyServiceHandler } from '../../../proto/generated/server.js';
<<<<<<< HEAD
import type { DeriveEntropyResponse } from '../../../proto/generated/messages.js';

export const entropyHandler: IEntropyServiceHandler = {
  async deriveEntropy(): Promise<DeriveEntropyResponse> {
    return { result: { case: 'entropy', value: new Uint8Array(32) } };
=======
import type { DeriveEntropyRequest, DeriveEntropyResponse } from '../../../proto/generated/messages.js';

// Simulated BIP-39 root entropy (fixed 32-byte seed for the mock host).
const MOCK_ROOT_SEED = new Uint8Array([
  0x4d, 0x6f, 0x63, 0x6b, 0x52, 0x6f, 0x6f, 0x74,
  0x53, 0x65, 0x65, 0x64, 0x5f, 0x30, 0x31, 0x32,
  0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x61,
  0x62, 0x63, 0x64, 0x65, 0x66, 0x30, 0x31, 0x32,
]);

/**
 * Deterministic entropy derivation using SHA-256 as a stand-in for BLAKE2b-256
 * keyed hashing. The real host uses a three-layer BLAKE2b-256 scheme; here we
 * concatenate the root seed with the request key and hash once with SHA-256.
 * Same key always yields the same 32-byte output.
 */
async function deriveEntropyFromKey(key: Uint8Array): Promise<Uint8Array> {
  const input = new Uint8Array(MOCK_ROOT_SEED.length + key.length);
  input.set(MOCK_ROOT_SEED, 0);
  input.set(key, MOCK_ROOT_SEED.length);
  const hash = await globalThis.crypto.subtle.digest('SHA-256', input);
  return new Uint8Array(hash);
}

export const entropyHandler: IEntropyServiceHandler = {
  async deriveEntropy(request: DeriveEntropyRequest): Promise<DeriveEntropyResponse> {
    const entropy = await deriveEntropyFromKey(request.key);
    return { result: { case: 'entropy', value: entropy } };
>>>>>>> origin/pg/issue-8-entropy-service
  },
};
