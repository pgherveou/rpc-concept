import type { ILocalStorageServiceHandler } from '../../../proto/generated/server.js';
import type { StorageReadResponse, StorageWriteResponse, StorageClearResponse } from '../../../proto/generated/messages.js';

const PREFIX = 'truapi:';
const store = new Map<string, Uint8Array>();

export const localStorageHandler: ILocalStorageServiceHandler = {
  async read(req): Promise<StorageReadResponse> {
    const data = store.get(PREFIX + req.key);
    return { result: { case: 'value', value: { data: data ?? new Uint8Array(0) } } };
  },
  async write(req): Promise<StorageWriteResponse> {
    store.set(PREFIX + req.key, req.value);
    return { result: { case: 'ok' } };
  },
  async clear(req): Promise<StorageClearResponse> {
    store.delete(PREFIX + req.key);
    return { result: { case: 'ok' } };
  },
};
