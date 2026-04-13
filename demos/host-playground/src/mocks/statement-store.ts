import type { IStatementStoreServiceHandler } from '../../../proto/generated/server.js';
import type { StatementList, StatementCreateProofResponse, StatementSubmitResponse } from '../../../proto/generated/messages.js';

export const statementStoreHandler: IStatementStoreServiceHandler = {
  async *subscribe(): AsyncGenerator<StatementList> {
    yield { statements: [] };
  },
  async createProof(): Promise<StatementCreateProofResponse> {
    return { result: { case: 'error', value: { code: 0, reason: 'Not implemented' } } };
  },
  async submit(): Promise<StatementSubmitResponse> {
    return { result: { case: 'hash', value: '0xmockhash' } };
  },
};
