import type { IPaymentServiceHandler } from '../../../proto/generated/server.js';
import type {
  PaymentBalanceRequest,
  PaymentBalanceEvent,
  PaymentTopUpRequest,
  PaymentTopUpResponse,
  PaymentRequestMsg,
  PaymentRequestResponse,
  PaymentStatusRequest,
  PaymentStatusEvent,
  PaymentTopUpErrorCode,
  PaymentRequestErrorCode,
  PaymentStatusErrorCode,
} from '../../../proto/generated/messages.js';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Simulated balance state shared across subscriptions.
let balanceAvailable = BigInt('1000000000000');
let balancePending = BigInt('0');

let paymentCounter = 0;
const knownPayments = new Set<string>();

export const paymentHandler: IPaymentServiceHandler = {
  async *balanceSubscribe(_request: PaymentBalanceRequest): AsyncGenerator<PaymentBalanceEvent> {
    // Emit current balance immediately.
    yield {
      result: {
        case: 'balance',
        value: { available: balanceAvailable.toString(), pending: balancePending.toString() },
      },
    };

    // Simulate a pending deposit arriving.
    await delay(1500);
    balancePending = BigInt('500000000000');
    yield {
      result: {
        case: 'balance',
        value: { available: balanceAvailable.toString(), pending: balancePending.toString() },
      },
    };

    // Pending clears into available.
    await delay(1500);
    balanceAvailable += balancePending;
    balancePending = BigInt('0');
    yield {
      result: {
        case: 'balance',
        value: { available: balanceAvailable.toString(), pending: balancePending.toString() },
      },
    };
  },

  async topUp(request: PaymentTopUpRequest): Promise<PaymentTopUpResponse> {
    const amount = BigInt(request.amount || '0');
    if (amount <= 0n) {
      return {
        result: {
          case: 'error',
          value: { code: 3 as PaymentTopUpErrorCode, reason: 'Invalid amount' },
        },
      };
    }

    if (!request.source?.source?.case) {
      return {
        result: {
          case: 'error',
          value: { code: 2 as PaymentTopUpErrorCode, reason: 'No source provided' },
        },
      };
    }

    balanceAvailable += amount;
    return { result: { case: 'ok' } };
  },

  async request(request: PaymentRequestMsg): Promise<PaymentRequestResponse> {
    const amount = BigInt(request.amount || '0');
    if (amount <= 0n) {
      return {
        result: {
          case: 'error',
          value: { code: 3 as PaymentRequestErrorCode, reason: 'Invalid amount' },
        },
      };
    }

    if (amount > balanceAvailable) {
      return {
        result: {
          case: 'error',
          value: { code: 2 as PaymentRequestErrorCode, reason: 'Insufficient balance' },
        },
      };
    }

    balanceAvailable -= amount;
    paymentCounter++;
    const id = `pay-${paymentCounter}`;
    knownPayments.add(id);
    return { result: { case: 'receipt', value: { id } } };
  },

  async *statusSubscribe(request: PaymentStatusRequest): AsyncGenerator<PaymentStatusEvent> {
    if (!request.paymentId || !knownPayments.has(request.paymentId)) {
      yield {
        result: {
          case: 'error',
          value: { code: 1 as PaymentStatusErrorCode, reason: 'Payment not found' },
        },
      };
      return;
    }

    yield {
      result: { case: 'status', value: { status: { case: 'processing' } } },
    };

    await delay(2000);

    yield {
      result: { case: 'status', value: { status: { case: 'completed' } } },
    };
  },
};
