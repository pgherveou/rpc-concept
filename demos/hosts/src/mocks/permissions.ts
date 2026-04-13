import type { IPermissionsServiceHandler } from '../../../proto/generated/server.js';
import type { DevicePermissionResponse, RemotePermissionResponse } from '../../../proto/generated/messages.js';

export const permissionsHandler: IPermissionsServiceHandler = {
  async devicePermissionRequest(): Promise<DevicePermissionResponse> {
    return { result: { case: 'granted', value: true } };
  },
  async remotePermissionRequest(): Promise<RemotePermissionResponse> {
    return { result: { case: 'granted', value: true } };
  },
};
