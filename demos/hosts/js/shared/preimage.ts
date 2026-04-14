import type { IPreimageServiceHandler } from '../../../proto/generated/server.js';
import type { PreimageLookupEvent } from '../../../proto/generated/messages.js';

export const preimageHandler: IPreimageServiceHandler = {
  async *lookupSubscribe(): AsyncGenerator<PreimageLookupEvent> {
    yield { value: new Uint8Array(32) };
  },
};
