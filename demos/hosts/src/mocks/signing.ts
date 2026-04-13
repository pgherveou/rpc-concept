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

// Deterministic mock signature: 64 bytes derived from the input so repeated
// calls with the same payload return the same result.
function mockSignature(seed: Uint8Array): Uint8Array {
  const sig = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    sig[i] = seed.length > 0 ? seed[i % seed.length] ^ (i * 7) : i * 3;
  }
  return sig;
}

// Mock signed transaction: prefix (1 byte version) + signature + call data.
function mockSignedTransaction(signature: Uint8Array, callData: Uint8Array): Uint8Array {
  const tx = new Uint8Array(1 + signature.length + callData.length);
  tx[0] = 0x84; // extrinsic version prefix
  tx.set(signature, 1);
  tx.set(callData, 1 + signature.length);
  return tx;
}

export const signingHandler: ISigningServiceHandler = {
  async signPayload(request: SigningPayload): Promise<SignPayloadResponse> {
    const account = request.account;
    console.log(
      '[host] signPayload: account=%s/%d method=%d bytes',
      account.dotNsIdentifier,
      account.derivationIndex,
      request.method.length,
    );

    const signature = mockSignature(request.method);
    const signedTransaction = request.withSignedTransaction
      ? mockSignedTransaction(signature, request.method)
      : new Uint8Array(0);

    return {
      result: {
        case: 'ok',
        value: { signature, signedTransaction },
      },
    };
  },

  async signRaw(request: SigningRawPayload): Promise<SignRawResponse> {
    const account = request.account;
    const payload = request.data?.payload;
    console.log(
      '[host] signRaw: account=%s/%d type=%s',
      account.dotNsIdentifier,
      account.derivationIndex,
      payload?.case ?? 'unknown',
    );

    // Derive signature seed from whichever raw payload variant is present.
    let seed: Uint8Array;
    if (payload?.case === 'rawBytes') {
      seed = (payload as { case: 'rawBytes'; value: Uint8Array }).value;
    } else if (payload?.case === 'message') {
      seed = new TextEncoder().encode((payload as { case: 'message'; value: string }).value);
    } else {
      seed = new Uint8Array(0);
    }

    return {
      result: {
        case: 'ok',
        value: { signature: mockSignature(seed), signedTransaction: new Uint8Array(0) },
      },
    };
  },

  async createTransaction(request: CreateTransactionRequest): Promise<CreateTransactionResponse> {
    const account = request.account;
    console.log(
      '[host] createTransaction: account=%s/%d',
      account.dotNsIdentifier,
      account.derivationIndex,
    );

    const callData =
      request.payload?.version?.case === 'v1'
        ? (request.payload.version as { case: 'v1'; value: { callData: Uint8Array } }).value.callData
        : new Uint8Array(0);
    const signature = mockSignature(callData);
    return { result: { case: 'transaction', value: mockSignedTransaction(signature, callData) } };
  },

  async createTransactionNonProduct(request: CreateTransactionNonProductRequest): Promise<CreateTransactionResponse> {
    console.log('[host] createTransactionNonProduct');

    const callData =
      request.payload?.version?.case === 'v1'
        ? (request.payload.version as { case: 'v1'; value: { callData: Uint8Array } }).value.callData
        : new Uint8Array(0);
    const signature = mockSignature(callData);
    return { result: { case: 'transaction', value: mockSignedTransaction(signature, callData) } };
  },
};
