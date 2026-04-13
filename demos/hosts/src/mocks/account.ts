import type { IAccountServiceHandler } from '../../../proto/generated/server.js';
import {
  AccountConnectionStatus,
  type GetAccountRequest,
  type GetAccountResponse,
  type GetAliasResponse,
  type CreateProofResponse,
  type GetNonProductAccountsResponse,
  type AccountConnectionStatusEvent,
  type GetUserIdResponse,
  type RequestCredentialsErrorCode,
  type CreateProofErrorCode,
} from '../../../proto/generated/messages.js';

// Mock root public key (deterministic).
const MOCK_ROOT_KEY = new Uint8Array(32);
MOCK_ROOT_KEY[0] = 0xaa;
MOCK_ROOT_KEY[1] = 0xbb;

// Derive a deterministic mock public key from dotNsIdentifier and derivationIndex.
function deriveProductKey(dotNsIdentifier: string, derivationIndex: number): Uint8Array {
  const key = new Uint8Array(32);
  for (let i = 0; i < dotNsIdentifier.length && i < 30; i++) {
    key[i] = dotNsIdentifier.charCodeAt(i);
  }
  key[30] = (derivationIndex >> 8) & 0xff;
  key[31] = derivationIndex & 0xff;
  return key;
}

export const accountHandler: IAccountServiceHandler = {
  async getAccount(request: GetAccountRequest): Promise<GetAccountResponse> {
    const { dotNsIdentifier, derivationIndex } = request.account;
    const publicKey = deriveProductKey(dotNsIdentifier, derivationIndex);
    return { result: { case: 'account', value: { publicKey, name: 'Alice (derived)' } } };
  },

  async getAlias(): Promise<GetAliasResponse> {
    // Ring VRF alias not yet implemented
    return {
      result: {
        case: 'error',
        value: { code: 4 as RequestCredentialsErrorCode, reason: 'Ring VRF alias not yet implemented' },
      },
    };
  },

  async createProof(): Promise<CreateProofResponse> {
    // Ring VRF proof not yet implemented
    return {
      result: {
        case: 'error',
        value: { code: 3 as CreateProofErrorCode, reason: 'Ring VRF proof not yet implemented' },
      },
    };
  },

  async getNonProductAccounts(): Promise<GetNonProductAccountsResponse> {
    return {
      result: {
        case: 'accounts',
        value: { accounts: [{ publicKey: MOCK_ROOT_KEY, name: 'Alice' }] },
      },
    };
  },

  async *connectionStatusSubscribe(): AsyncGenerator<AccountConnectionStatusEvent> {
    // Playground is always authenticated
    yield { status: AccountConnectionStatus.ACCOUNT_CONNECTION_STATUS_CONNECTED };
  },

  async getUserId(): Promise<GetUserIdResponse> {
    return {
      result: {
        case: 'identity',
        value: { dotNsIdentifier: 'alice.dot', publicKey: MOCK_ROOT_KEY },
      },
    };
  },
};
