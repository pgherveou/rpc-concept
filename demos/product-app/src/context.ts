import { createContext, useContext } from 'react';
import type { HelloBridgeServiceClient } from '../../proto/generated/client.js';

export const ClientContext = createContext<HelloBridgeServiceClient | null>(null);

export function useClient(): HelloBridgeServiceClient {
  const client = useContext(ClientContext);
  if (!client) throw new Error('useClient must be used within ClientContext.Provider');
  return client;
}
