import type { ILocalStorageServiceHandler } from '../../../proto/generated/server.js';
<<<<<<< HEAD
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
=======
import type { StorageReadResponse, StorageWriteResponse, StorageClearResponse } from '../../../proto/generated/messages.js';

const PREFIX = 'truapi:';
const store = new Map<string, Uint8Array>();

export const localStorageHandler: ILocalStorageServiceHandler = {
  async read(req): Promise<StorageReadResponse> {
    const data = store.get(PREFIX + req.key);
    return { result: { case: 'value', value: { data } } };
  },
  async write(req): Promise<StorageWriteResponse> {
    store.set(PREFIX + req.key, req.value);
    return { result: { case: 'ok' } };
  },
  async clear(req): Promise<StorageClearResponse> {
    store.delete(PREFIX + req.key);
>>>>>>> origin/pg/impl-local-storage-service
    return { result: { case: 'ok' } };
  },
};
