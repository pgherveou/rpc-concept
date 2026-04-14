import type { IGeneralServiceHandler } from '../../../proto/generated/server.js';
import { NavigateToErrorCode } from '../../../proto/generated/messages.js';

export interface GeneralHandlerOptions {
  onNavigate?: (url: string) => void;
  onNotification?: (text: string, deeplink?: string) => void;
}

export function createGeneralHandler(opts?: GeneralHandlerOptions): IGeneralServiceHandler {
  return {
    async featureSupported(request) {
      // Chain features are always supported in the playground.
      const feat = request.feature as any;
      const featureCase = feat?.feature?.case ?? feat?.case;
      if (featureCase === 'chain') {
        return { result: { case: 'supported', value: true } };
      }
      return { result: { case: 'supported', value: false } };
    },

    async navigateTo(request) {
      if (!request.url) {
        return {
          result: {
            case: 'error',
            value: { code: NavigateToErrorCode.NAVIGATE_TO_ERROR_CODE_UNKNOWN, reason: 'Empty URL' },
          },
        };
      }
      console.log('[host] navigateTo:', request.url);
      (opts?.onNavigate ?? defaultNavigate)(request.url);
      return { result: { case: 'ok' } };
    },

    async pushNotification(request) {
      console.log('[host] Push notification:', request.text, request.deeplink ?? '');
      (opts?.onNotification ?? defaultNotification)(request.text, request.deeplink);
      return { result: { case: 'ok' } };
    },
  };
}

function defaultNavigate(url: string): void {
  if (typeof window !== 'undefined') {
    window.open(url, '_blank');
  }
}

function defaultNotification(text: string, deeplink?: string): void {
  console.log('[host] Notification:', text, deeplink ?? '');
}
