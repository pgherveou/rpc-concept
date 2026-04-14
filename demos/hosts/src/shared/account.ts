import type { IAccountServiceHandler } from '../../../proto/generated/server.js';
import {
  AccountConnectionStatus,
  type GetAccountResponse,
  type GetAliasResponse,
  type CreateProofResponse,
  type GetNonProductAccountsResponse,
  type AccountConnectionStatusEvent,
  type GetUserIdResponse,
} from '../../../proto/generated/messages.js';

export const accountHandler: IAccountServiceHandler = {
  async getAccount(): Promise<GetAccountResponse> {
    return { result: { case: 'account', value: { publicKey: new Uint8Array(32), name: 'Alice' } } };
  },
  async getAlias(): Promise<GetAliasResponse> {
    return { result: { case: 'alias', value: { context: new Uint8Array(0), alias: new Uint8Array(0) } } };
  },
  async createProof(): Promise<CreateProofResponse> {
    return { result: { case: 'proof', value: new Uint8Array(64) } };
  },
  async getNonProductAccounts(): Promise<GetNonProductAccountsResponse> {
    return { result: { case: 'accounts', value: { accounts: [{ publicKey: new Uint8Array(32), name: 'Bob' }] } } };
  },
  async *connectionStatusSubscribe(): AsyncGenerator<AccountConnectionStatusEvent> {
    yield { status: AccountConnectionStatus.ACCOUNT_CONNECTION_STATUS_CONNECTED };
  },
  async getUserId(): Promise<GetUserIdResponse> {
    return { result: { case: 'identity', value: { dotNsIdentifier: 'mock-user', publicKey: new Uint8Array(32) } } };
  },
};
