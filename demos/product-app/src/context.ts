import { createContext, useContext } from 'react';
import type { HelloServiceClient } from '../../proto/generated/client.js';
import type { ChatServiceClient } from '../../proto/generated/client.js';

export interface ServiceClients {
  hello: HelloServiceClient;
  chat: ChatServiceClient;
}

export const ClientContext = createContext<ServiceClients | null>(null);

export function useHelloClient(): HelloServiceClient {
  const clients = useContext(ClientContext);
  if (!clients) throw new Error('useHelloClient must be used within ClientContext.Provider');
  return clients.hello;
}

export function useChatClient(): ChatServiceClient {
  const clients = useContext(ClientContext);
  if (!clients) throw new Error('useChatClient must be used within ClientContext.Provider');
  return clients.chat;
}
