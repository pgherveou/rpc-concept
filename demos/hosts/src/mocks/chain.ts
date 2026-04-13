import type { IChainServiceHandler } from '../../../proto/generated/server.js';
import type {
  ChainHeadEvent,
  ChainHeadHeaderResponse,
  OperationStartedResponse,
  ChainVoidResponse,
  ChainBytesResponse,
  ChainStringResponse,
  ChainTransactionBroadcastResponse,
} from '../../../proto/generated/messages.js';
import { createRuntimeType } from '../../../proto/generated/messages.js';

export const chainHandler: IChainServiceHandler = {
  async *headFollow(): AsyncGenerator<ChainHeadEvent> {
    yield { event: { case: 'initialized', value: { finalizedBlockHashes: [new Uint8Array(32)], finalizedBlockRuntime: createRuntimeType() } } };
    yield { event: { case: 'newBlock', value: { blockHash: new Uint8Array(32), parentBlockHash: new Uint8Array(32), newRuntime: createRuntimeType() } } };
    yield { event: { case: 'bestBlockChanged', value: { bestBlockHash: new Uint8Array(32) } } };
  },
  async headHeader(): Promise<ChainHeadHeaderResponse> {
    return { result: { case: 'value', value: { header: new Uint8Array(80) } } };
  },
  async headBody(): Promise<OperationStartedResponse> {
    return { result: { case: 'value', value: { result: { case: 'operationId', value: 'op-1' } } } };
  },
  async headStorage(): Promise<OperationStartedResponse> {
    return { result: { case: 'value', value: { result: { case: 'operationId', value: 'op-2' } } } };
  },
  async headCall(): Promise<OperationStartedResponse> {
    return { result: { case: 'value', value: { result: { case: 'operationId', value: 'op-3' } } } };
  },
  async headUnpin(): Promise<ChainVoidResponse> {
    return { result: { case: 'ok' } };
  },
  async headContinue(): Promise<ChainVoidResponse> {
    return { result: { case: 'ok' } };
  },
  async headStopOperation(): Promise<ChainVoidResponse> {
    return { result: { case: 'ok' } };
  },
  async specGenesisHash(): Promise<ChainBytesResponse> {
    return { result: { case: 'value', value: new Uint8Array(32) } };
  },
  async specChainName(): Promise<ChainStringResponse> {
    return { result: { case: 'value', value: 'Mock Chain' } };
  },
  async specProperties(): Promise<ChainStringResponse> {
    return { result: { case: 'value', value: '{"tokenSymbol":"DOT","tokenDecimals":10}' } };
  },
  async transactionBroadcast(): Promise<ChainTransactionBroadcastResponse> {
    return { result: { case: 'value', value: { operationId: 'tx-op-1' } } };
  },
  async transactionStop(): Promise<ChainVoidResponse> {
    return { result: { case: 'ok' } };
  },
};
