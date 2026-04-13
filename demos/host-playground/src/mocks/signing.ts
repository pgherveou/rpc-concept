import type { ISigningServiceHandler } from '../../../proto/generated/server.js';
import type { SignPayloadResponse, SignRawResponse, CreateTransactionResponse } from '../../../proto/generated/messages.js';

export const signingHandler: ISigningServiceHandler = {
  async signPayload(): Promise<SignPayloadResponse> {
    return { result: { case: 'ok', value: { signature: new Uint8Array(64), signedTransaction: new Uint8Array(0) } } };
  },
  async signRaw(): Promise<SignRawResponse> {
    return { result: { case: 'ok', value: { signature: new Uint8Array(64), signedTransaction: new Uint8Array(0) } } };
  },
  async createTransaction(): Promise<CreateTransactionResponse> {
    return { result: { case: 'transaction', value: new Uint8Array(128) } };
  },
  async createTransactionNonProduct(): Promise<CreateTransactionResponse> {
    return { result: { case: 'transaction', value: new Uint8Array(128) } };
  },
};
