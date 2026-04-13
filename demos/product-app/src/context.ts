import { createContext, useContext } from 'react';
import type { HelloBridgeServiceClient } from '../../proto/generated/client.js';
import type { ChatServiceClient } from '../../proto/generated/client.js';

export interface ServiceClients {
  hello: HelloBridgeServiceClient;
  chat: ChatServiceClient;
}

export const ClientContext = createContext<ServiceClients | null>(null);

export function useHelloClient(): HelloBridgeServiceClient {
  const clients = useContext(ClientContext);
  if (!clients) throw new Error('useHelloClient must be used within ClientContext.Provider');
  return clients.hello;
}

export function useChatClient(): ChatServiceClient {
  const clients = useContext(ClientContext);
  if (!clients) throw new Error('useChatClient must be used within ClientContext.Provider');
  return clients.chat;
}
