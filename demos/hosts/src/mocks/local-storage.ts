import type { ILocalStorageServiceHandler } from '../../../proto/generated/server.js';
import type { StorageReadResponse, StorageWriteResponse, StorageClearResponse } from '../../../proto/generated/messages.js';
import { StorageErrorCode } from '../../../proto/generated/messages.js';

const PREFIX = 'truapi:';
const store = new Map<string, Uint8Array>();

export const localStorageHandler: ILocalStorageServiceHandler = {
  async read(req): Promise<StorageReadResponse> {
    try {
      const data = store.get(PREFIX + req.key);
      return { result: { case: 'value', value: { data: data ?? new Uint8Array(0) } } };
    } catch {
      return { result: { case: 'error', value: { code: StorageErrorCode.STORAGE_ERROR_CODE_UNKNOWN, reason: 'Failed to read from storage' } } };
    }
  },
  async write(req): Promise<StorageWriteResponse> {
    try {
      store.set(PREFIX + req.key, req.value);
      return { result: { case: 'ok' } };
    } catch {
      return { result: { case: 'error', value: { code: StorageErrorCode.STORAGE_ERROR_CODE_UNKNOWN, reason: 'Failed to write to storage' } } };
    }
  },
  async clear(req): Promise<StorageClearResponse> {
    try {
      store.delete(PREFIX + req.key);
      return { result: { case: 'ok' } };
    } catch {
      return { result: { case: 'error', value: { code: StorageErrorCode.STORAGE_ERROR_CODE_UNKNOWN, reason: 'Failed to clear storage' } } };
    }
  },
};
