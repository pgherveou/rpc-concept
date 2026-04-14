import type { IPaymentServiceHandler } from '../../../proto/generated/server.js';
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> origin/pg/impl-preimage-service
=======
>>>>>>> origin/pg/issue-11-permissions-service
=======
>>>>>>> origin/pg/impl-signing-service
=======
>>>>>>> origin/pg/issue-14-statement-store-service
import type {
  PaymentBalanceEvent,
  PaymentTopUpResponse,
  PaymentRequestResponse,
  PaymentStatusEvent,
} from '../../../proto/generated/messages.js';

export const paymentHandler: IPaymentServiceHandler = {
  async *balanceSubscribe(): AsyncGenerator<PaymentBalanceEvent> {
    yield { result: { case: 'balance', value: { available: '1000000000000', pending: '0' } } };
  },
  async topUp(): Promise<PaymentTopUpResponse> {
    return { result: { case: 'ok' } };
  },
  async request(): Promise<PaymentRequestResponse> {
    return { result: { case: 'receipt', value: { id: 'mock-receipt-1' } } };
  },
  async *statusSubscribe(): AsyncGenerator<PaymentStatusEvent> {
    yield { result: { case: 'status', value: { status: { case: undefined } } } };
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
import type { PaymentTopUpResponse, PaymentRequestResponse, PaymentRequestMsg } from '../../../proto/generated/messages.js';

let paymentCounter = 0;

export const paymentHandler: IPaymentServiceHandler = {
  async *balanceSubscribe() {
    yield {
      result: {
        case: 'balance',
        value: { available: '1000000000000', pending: '0' },
      },
    };
    // Keep stream open (production pushes updates as balance changes).
    await new Promise(() => {});
  },

  async topUp(): Promise<PaymentTopUpResponse> {
    return { result: { case: 'ok' } };
  },

  async request(request: PaymentRequestMsg): Promise<PaymentRequestResponse> {
    paymentCounter++;
    return { result: { case: 'receipt', value: { id: `pay-${paymentCounter}` } } };
  },

  async *statusSubscribe() {
    yield {
      result: { case: 'status', value: { status: { case: 'processing' } } },
    };
    // Keep stream open (production pushes updates as payment progresses).
    await new Promise(() => {});
>>>>>>> origin/pg/impl-payment-service
=======
>>>>>>> origin/pg/impl-preimage-service
=======
>>>>>>> origin/pg/issue-11-permissions-service
=======
>>>>>>> origin/pg/impl-signing-service
=======
>>>>>>> origin/pg/issue-14-statement-store-service
  },
};
