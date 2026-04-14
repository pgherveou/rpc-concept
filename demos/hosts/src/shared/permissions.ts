import type { IPermissionsServiceHandler } from '../../../proto/generated/server.js';
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> origin/pg/impl-signing-service
import type { DevicePermissionResponse, RemotePermissionResponse } from '../../../proto/generated/messages.js';

export const permissionsHandler: IPermissionsServiceHandler = {
  async devicePermissionRequest(): Promise<DevicePermissionResponse> {
    return { result: { case: 'granted', value: true } };
  },
  async remotePermissionRequest(): Promise<RemotePermissionResponse> {
<<<<<<< HEAD
=======
import type {
  DevicePermissionRequestMsg,
  DevicePermissionResponse,
  RemotePermissionRequestMsg,
  RemotePermissionResponse,
} from '../../../proto/generated/messages.js';
import { DevicePermission } from '../../../proto/generated/messages.js';

// Tracks granted device permissions for the session.
const grantedDevicePermissions = new Set<DevicePermission>();

// Permissions that the mock host always denies.
const deniedDevicePermissions = new Set<DevicePermission>([
  DevicePermission.DEVICE_PERMISSION_BIOMETRICS,
]);

export const permissionsHandler: IPermissionsServiceHandler = {
  async devicePermissionRequest(request: DevicePermissionRequestMsg): Promise<DevicePermissionResponse> {
    const perm = request.permission;
    console.log(`[PermissionsService] devicePermissionRequest: ${DevicePermission[perm] ?? perm}`);

    if (perm === DevicePermission.DEVICE_PERMISSION_UNSPECIFIED) {
      return { result: { case: 'error', value: { reason: 'Permission type is required' } } };
    }

    if (deniedDevicePermissions.has(perm)) {
      return { result: { case: 'granted', value: false } };
    }

    grantedDevicePermissions.add(perm);
    return { result: { case: 'granted', value: true } };
  },

  async remotePermissionRequest(request: RemotePermissionRequestMsg): Promise<RemotePermissionResponse> {
    const perms = request.permissions;
    console.log(`[PermissionsService] remotePermissionRequest: ${perms.length} permission(s)`);

    if (perms.length === 0) {
      return { result: { case: 'error', value: { reason: 'At least one permission is required' } } };
    }

    for (const entry of perms) {
      const p = entry.permission;
      switch (p.case) {
        case 'remote': {
          const domains = p.value.domains;
          // Deny wildcard-all domain requests
          if (domains.some((d) => d === '*')) {
            console.log('[PermissionsService] denied: wildcard (*) remote domain');
            return { result: { case: 'granted', value: false } };
          }
          console.log(`[PermissionsService] granted remote domains: ${domains.join(', ')}`);
          break;
        }
        case 'webRtc':
          console.log('[PermissionsService] granted webRtc');
          break;
        case 'chainSubmit':
          console.log('[PermissionsService] granted chainSubmit');
          break;
        case 'statementSubmit':
          console.log('[PermissionsService] granted statementSubmit');
          break;
        default:
          console.log('[PermissionsService] unknown remote permission, ignoring');
          break;
      }
    }

>>>>>>> origin/pg/issue-11-permissions-service
=======
>>>>>>> origin/pg/impl-signing-service
    return { result: { case: 'granted', value: true } };
  },
};
