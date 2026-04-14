import type { ISigningServiceHandler } from '../../../proto/generated/server.js';
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> origin/pg/issue-14-statement-store-service
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
<<<<<<< HEAD
=======
import type {
  SigningPayload,
  SignPayloadResponse,
  SigningRawPayload,
  SignRawResponse,
  CreateTransactionRequest,
  CreateTransactionResponse,
  CreateTransactionNonProductRequest,
} from '../../../proto/generated/messages.js';

const MOCK_SIGNATURE = new Uint8Array(64);
const MOCK_TRANSACTION = new Uint8Array(128);

export const signingHandler: ISigningServiceHandler = {
  async signPayload(request: SigningPayload): Promise<SignPayloadResponse> {
    console.log(
      '[host] signPayload: account=%s/%d',
      request.account.dotNsIdentifier,
      request.account.derivationIndex,
    );

    return {
      result: {
        case: 'ok',
        value: {
          signature: MOCK_SIGNATURE,
          signedTransaction: request.withSignedTransaction ? MOCK_TRANSACTION : new Uint8Array(0),
        },
      },
    };
  },

  async signRaw(request: SigningRawPayload): Promise<SignRawResponse> {
    console.log(
      '[host] signRaw: account=%s/%d',
      request.account.dotNsIdentifier,
      request.account.derivationIndex,
    );

    return {
      result: {
        case: 'ok',
        value: { signature: MOCK_SIGNATURE, signedTransaction: new Uint8Array(0) },
      },
    };
  },

  async createTransaction(request: CreateTransactionRequest): Promise<CreateTransactionResponse> {
    console.log(
      '[host] createTransaction: account=%s/%d',
      request.account.dotNsIdentifier,
      request.account.derivationIndex,
    );

    return { result: { case: 'transaction', value: MOCK_TRANSACTION } };
  },

  async createTransactionNonProduct(request: CreateTransactionNonProductRequest): Promise<CreateTransactionResponse> {
    console.log('[host] createTransactionNonProduct');
    return { result: { case: 'transaction', value: MOCK_TRANSACTION } };
>>>>>>> origin/pg/impl-signing-service
=======
>>>>>>> origin/pg/issue-14-statement-store-service
  },
};
