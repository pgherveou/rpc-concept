import type { IStatementStoreServiceHandler } from '../../../proto/generated/server.js';
import type {
  StatementList,
  StatementCreateProofResponse,
  StatementSubmitResponse,
  SignedStatement,
  TopicFilter,
} from '../../../proto/generated/messages.js';

// Mock 32-byte signer/topic values
const MOCK_SIGNER = new Uint8Array(32);
MOCK_SIGNER[0] = 0xd4;
MOCK_SIGNER[1] = 0x35;

const MOCK_SIGNER_2 = new Uint8Array(32);
MOCK_SIGNER_2[0] = 0x8e;
MOCK_SIGNER_2[1] = 0xaf;

const MOCK_TOPIC_A = new Uint8Array(32);
MOCK_TOPIC_A[0] = 0x01;

const MOCK_TOPIC_B = new Uint8Array(32);
MOCK_TOPIC_B[0] = 0x02;

function mockSignature(len: number): Uint8Array {
  const sig = new Uint8Array(len);
  for (let i = 0; i < len; i++) sig[i] = (i * 7 + 0xab) & 0xff;
  return sig;
}

function makeSignedStatements(filter: TopicFilter): SignedStatement[] {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const statements: SignedStatement[] = [
    {
      proof: { proof: { case: 'sr25519', value: { signature: mockSignature(64), signer: MOCK_SIGNER } } },
      decryptionKey: new Uint8Array(0),
      expiry: now + 3600n,
      channel: new Uint8Array(0),
      topics: [MOCK_TOPIC_A],
      data: new TextEncoder().encode('{"type":"profile","name":"Alice"}'),
    },
    {
      proof: { proof: { case: 'ed25519', value: { signature: mockSignature(64), signer: MOCK_SIGNER_2 } } },
      decryptionKey: new Uint8Array(32),
      expiry: now + 7200n,
      channel: new Uint8Array(0),
      topics: [MOCK_TOPIC_A, MOCK_TOPIC_B],
      data: new TextEncoder().encode('{"type":"attestation","score":42}'),
    },
  ];

  // If a topic filter is provided, only return statements matching at least
  // the positional topics (absent/empty entries act as wildcards).
  if (filter.topics.length > 0) {
    return statements.filter((s) =>
      filter.topics.every((entry, i) => {
        if (!entry.topic || entry.topic.length === 0) return true;
        const sTopic = s.topics[i];
        if (!sTopic) return false;
        return sTopic.every((b, j) => b === entry.topic![j]);
      }),
    );
  }

  return statements;
}

let submitCounter = 0;

export const statementStoreHandler: IStatementStoreServiceHandler = {
  async *subscribe(request: TopicFilter): AsyncGenerator<StatementList> {
    // Initial batch
    yield { statements: makeSignedStatements(request) };

    // Simulate a delayed second update after a short pause
    await new Promise((r) => setTimeout(r, 1500));
    const now = BigInt(Math.floor(Date.now() / 1000));
    yield {
      statements: [
        {
          proof: { proof: { case: 'sr25519', value: { signature: mockSignature(64), signer: MOCK_SIGNER } } },
          decryptionKey: new Uint8Array(0),
          expiry: now + 1800n,
          channel: new Uint8Array(0),
          topics: [MOCK_TOPIC_B],
          data: new TextEncoder().encode('{"type":"update","seq":1}'),
        },
      ],
    };
  },

  async createProof(): Promise<StatementCreateProofResponse> {
    return {
      result: {
        case: 'proof',
        value: {
          proof: {
            case: 'sr25519',
            value: { signature: mockSignature(64), signer: MOCK_SIGNER },
          },
        },
      },
    };
  },

  async submit(): Promise<StatementSubmitResponse> {
    submitCounter++;
    const hash = '0x' + Array.from(mockSignature(32)).map((b) => b.toString(16).padStart(2, '0')).join('');
    return { result: { case: 'hash', value: `${hash}-${submitCounter}` } };
  },
};
