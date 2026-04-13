import type { ILocalStorageServiceHandler } from '../../../proto/generated/server.js';
import type { StorageReadResponse, StorageWriteResponse, StorageClearResponse, StorageReadRequest } from '../../../proto/generated/messages.js';

const store = new Map<string, Uint8Array>();

export const localStorageHandler: ILocalStorageServiceHandler = {
  async read(req: StorageReadRequest): Promise<StorageReadResponse> {
    const value = store.get(req.key);
    if (value !== undefined) {
      return { result: { case: 'value', value: { data: value } } };
    }
    return { result: { case: 'error', value: { code: 0, reason: 'Key not found' } } };
  },
  async write(req): Promise<StorageWriteResponse> {
    store.set(req.key, new TextEncoder().encode(JSON.stringify(req.value)));
    return { result: { case: 'ok' } };
  },
  async clear(req): Promise<StorageClearResponse> {
    store.delete(req.key);
    return { result: { case: 'ok' } };
  },
};
