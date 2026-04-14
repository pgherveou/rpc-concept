import type { IChainServiceHandler } from '../../../proto/generated/server.js';
import type {
  ChainHeadEvent,
  ChainHeadHeaderResponse,
  OperationStartedResponse,
  ChainVoidResponse,
  ChainBytesResponse,
  ChainStringResponse,
  ChainTransactionBroadcastResponse,
  ChainHeadFollowRequest,
  ChainHeadBlockRequest,
  ChainHeadStorageRequest,
  ChainHeadCallRequest,
  ChainHeadUnpinRequest,
  ChainHeadOperationRequest,
  ChainGenesisRequest,
  ChainTransactionBroadcastRequest,
  ChainTransactionStopRequest,
} from '../../../proto/generated/messages.js';

// Polkadot genesis hash
const POLKADOT_GENESIS = hexToBytes(
  '91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3',
);

// Simulated runtime spec matching Polkadot
const POLKADOT_RUNTIME = {
  case: 'valid' as const,
  value: {
    specName: 'polkadot',
    implName: 'parity-polkadot',
    specVersion: 1003004,
    implVersion: 0,
    transactionVersion: 26,
    apis: [
      { name: 'Core', version: 5 },
      { name: 'Metadata', version: 2 },
      { name: 'BlockBuilder', version: 6 },
      { name: 'TaggedTransactionQueue', version: 3 },
      { name: 'OffchainWorkerApi', version: 2 },
      { name: 'AccountNonceApi', version: 1 },
      { name: 'TransactionPaymentApi', version: 4 },
    ],
  },
};

let opCounter = 0;
function nextOpId(): string {
  return `op-${++opCounter}`;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function randomHash(): Uint8Array {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

// Fake SCALE-encoded header (80 bytes, loosely mimicking Substrate header layout)
function fakeHeader(blockNumber: number, parentHash: Uint8Array): Uint8Array {
  const header = new Uint8Array(80);
  header.set(parentHash, 0);
  // Encode block number at offset 32 (compact SCALE, simplified)
  header[32] = (blockNumber << 2) & 0xff;
  header[33] = (blockNumber >> 6) & 0xff;
  // Fill stateRoot, extrinsicsRoot with deterministic pseudo-random
  for (let i = 34; i < 80; i++) header[i] = (blockNumber * 7 + i * 13) & 0xff;
  return header;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const chainHandler: IChainServiceHandler = {
  async *headFollow(
    _request: ChainHeadFollowRequest,
  ): AsyncGenerator<ChainHeadEvent> {
    let blockNumber = 21_000_000;
    const finalizedHash = randomHash();

    // Initialized event with finalized block and runtime
    yield {
      event: {
        case: 'initialized',
        value: {
          finalizedBlockHashes: [finalizedHash],
          finalizedBlockRuntime: { runtime: POLKADOT_RUNTIME },
        },
      },
    };

    // Simulate 5 new blocks arriving every ~2s
    let parentHash = finalizedHash;
    const pendingHashes: Uint8Array[] = [];

    for (let i = 0; i < 5; i++) {
      await delay(2000);
      blockNumber++;

      const blockHash = randomHash();
      pendingHashes.push(blockHash);

      yield {
        event: {
          case: 'newBlock',
          value: {
            blockHash,
            parentBlockHash: parentHash,
            newRuntime: { runtime: { case: undefined } },
          },
        },
      };

      yield {
        event: {
          case: 'bestBlockChanged',
          value: { bestBlockHash: blockHash },
        },
      };

      // Finalize every 2 blocks
      if (pendingHashes.length >= 2) {
        const finalized = pendingHashes.splice(0, pendingHashes.length);
        yield {
          event: {
            case: 'finalized',
            value: {
              finalizedBlockHashes: finalized,
              prunedBlockHashes: [],
            },
          },
        };
      }

      parentHash = blockHash;
    }

    // Finalize any remaining
    if (pendingHashes.length > 0) {
      yield {
        event: {
          case: 'finalized',
          value: {
            finalizedBlockHashes: pendingHashes,
            prunedBlockHashes: [],
          },
        },
      };
    }
  },

  async headHeader(
    _request: ChainHeadBlockRequest,
  ): Promise<ChainHeadHeaderResponse> {
    const blockNumber = 21_000_000 + Math.floor(Math.random() * 100);
    return {
      result: {
        case: 'value',
        value: { header: fakeHeader(blockNumber, randomHash()) },
      },
    };
  },

  async headBody(
    _request: ChainHeadBlockRequest,
  ): Promise<OperationStartedResponse> {
    return {
      result: {
        case: 'value',
        value: { result: { case: 'operationId', value: nextOpId() } },
      },
    };
  },

  async headStorage(
    _request: ChainHeadStorageRequest,
  ): Promise<OperationStartedResponse> {
    return {
      result: {
        case: 'value',
        value: { result: { case: 'operationId', value: nextOpId() } },
      },
    };
  },

  async headCall(
    _request: ChainHeadCallRequest,
  ): Promise<OperationStartedResponse> {
    return {
      result: {
        case: 'value',
        value: { result: { case: 'operationId', value: nextOpId() } },
      },
    };
  },

  async headUnpin(
    _request: ChainHeadUnpinRequest,
  ): Promise<ChainVoidResponse> {
    return { result: { case: 'ok' } };
  },

  async headContinue(
    _request: ChainHeadOperationRequest,
  ): Promise<ChainVoidResponse> {
    return { result: { case: 'ok' } };
  },

  async headStopOperation(
    _request: ChainHeadOperationRequest,
  ): Promise<ChainVoidResponse> {
    return { result: { case: 'ok' } };
  },

  async specGenesisHash(
    _request: ChainGenesisRequest,
  ): Promise<ChainBytesResponse> {
    return { result: { case: 'value', value: POLKADOT_GENESIS } };
  },

  async specChainName(
    _request: ChainGenesisRequest,
  ): Promise<ChainStringResponse> {
    return { result: { case: 'value', value: 'Polkadot' } };
  },

  async specProperties(
    _request: ChainGenesisRequest,
  ): Promise<ChainStringResponse> {
    return {
      result: {
        case: 'value',
        value: JSON.stringify({
          ss58Format: 0,
          tokenDecimals: 10,
          tokenSymbol: 'DOT',
        }),
      },
    };
  },

  async transactionBroadcast(
    _request: ChainTransactionBroadcastRequest,
  ): Promise<ChainTransactionBroadcastResponse> {
    return {
      result: { case: 'value', value: { operationId: nextOpId() } },
    };
  },

  async transactionStop(
    _request: ChainTransactionStopRequest,
  ): Promise<ChainVoidResponse> {
    return { result: { case: 'ok' } };
  },
};
