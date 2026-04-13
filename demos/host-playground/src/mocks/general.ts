import type { IGeneralServiceHandler } from '../../../proto/generated/server.js';
import type { FeatureSupportedResponse, NavigateToResponse, PushNotificationResponse } from '../../../proto/generated/messages.js';

export const generalHandler: IGeneralServiceHandler = {
  async featureSupported(): Promise<FeatureSupportedResponse> {
    return { result: { case: 'supported', value: true } };
  },
  async navigateTo(): Promise<NavigateToResponse> {
    return { result: { case: 'ok' } };
  },
  async pushNotification(): Promise<PushNotificationResponse> {
    return { result: { case: 'ok' } };
  },
};
