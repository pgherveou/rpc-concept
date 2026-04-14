import type { IPaymentServiceHandler } from '../../../proto/generated/server.js';
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
  },
};
