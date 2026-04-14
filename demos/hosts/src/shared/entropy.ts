import type { IEntropyServiceHandler } from '../../../proto/generated/server.js';
import type { DeriveEntropyResponse } from '../../../proto/generated/messages.js';

export const entropyHandler: IEntropyServiceHandler = {
  async deriveEntropy(): Promise<DeriveEntropyResponse> {
    return { result: { case: 'entropy', value: new Uint8Array(32) } };
  },
};
