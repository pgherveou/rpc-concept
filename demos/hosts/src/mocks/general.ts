import type { IGeneralServiceHandler } from '../../../proto/generated/server.js';
import type {
  FeatureSupportedRequest,
  FeatureSupportedResponse,
  NavigateToRequest,
  NavigateToResponse,
  PushNotification,
  PushNotificationResponse,
} from '../../../proto/generated/messages.js';
import { NavigateToErrorCode } from '../../../proto/generated/messages.js';

export const generalHandler: IGeneralServiceHandler = {
  async featureSupported(request: FeatureSupportedRequest): Promise<FeatureSupportedResponse> {
    // Chain features are always supported in the playground.
    const feat = request.feature as any;
    const featureCase = feat?.feature?.case ?? feat?.case;
    if (featureCase === 'chain') {
      return { result: { case: 'supported', value: true } };
    }
    return { result: { case: 'supported', value: false } };
  },

  async navigateTo(request: NavigateToRequest): Promise<NavigateToResponse> {
    if (!request.url) {
      return {
        result: {
          case: 'error',
          value: { code: NavigateToErrorCode.NAVIGATE_TO_ERROR_CODE_UNKNOWN, reason: 'Empty URL' },
        },
      };
    }
    console.log('[host] navigateTo:', request.url);
    if (typeof window !== 'undefined') {
      window.open(request.url, '_blank');
    }
    return { result: { case: 'ok' } };
  },

  async pushNotification(request: PushNotification): Promise<PushNotificationResponse> {
    console.log('[host] Push notification:', request.text, request.deeplink ?? '');
    return { result: { case: 'ok' } };
  },
};
