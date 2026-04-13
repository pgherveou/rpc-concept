import type { IPaymentServiceHandler } from '../../../proto/generated/server.js';
import type {
  PaymentBalance,
  PaymentTopUpResponse,
  PaymentRequestResponse,
  PaymentStatusEvent,
} from '../../../proto/generated/messages.js';

export const paymentHandler: IPaymentServiceHandler = {
  async *balanceSubscribe(): AsyncGenerator<PaymentBalance> {
    yield { available: '1000000000000', pending: '0' };
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
