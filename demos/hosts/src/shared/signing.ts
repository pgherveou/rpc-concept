import type { ISigningServiceHandler } from '../../../proto/generated/server.js';
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
  },
};
