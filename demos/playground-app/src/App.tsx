import { useState } from 'react';
import type { ServiceClients } from './setup-client.js';
import { ServiceTable, type ServiceInfo } from './components/ServiceTable.js';
import { MethodView } from './components/MethodView.js';

// Static service/method metadata for the UI
const services: ServiceInfo[] = [
  {
    name: 'GeneralService', methods: [
      { name: 'FeatureSupported', type: 'unary' },
      { name: 'NavigateTo', type: 'unary' },
      { name: 'PushNotification', type: 'unary' },
    ],
  },
  {
    name: 'PermissionsService', methods: [
      { name: 'DevicePermissionRequest', type: 'unary' },
      { name: 'RemotePermissionRequest', type: 'unary' },
    ],
  },
  {
    name: 'LocalStorageService', methods: [
      { name: 'Read', type: 'unary' },
      { name: 'Write', type: 'unary' },
      { name: 'Clear', type: 'unary' },
    ],
  },
  {
    name: 'AccountService', methods: [
      { name: 'GetAccount', type: 'unary' },
      { name: 'GetAlias', type: 'unary' },
      { name: 'CreateProof', type: 'unary' },
      { name: 'GetNonProductAccounts', type: 'unary' },
      { name: 'ConnectionStatusSubscribe', type: 'server-stream' },
      { name: 'GetUserId', type: 'unary' },
    ],
  },
  {
    name: 'SigningService', methods: [
      { name: 'SignPayload', type: 'unary' },
      { name: 'SignRaw', type: 'unary' },
      { name: 'CreateTransaction', type: 'unary' },
      { name: 'CreateTransactionNonProduct', type: 'unary' },
    ],
  },
  {
    name: 'ChatService', methods: [
      { name: 'CreateRoom', type: 'unary' },
      { name: 'CreateSimpleGroup', type: 'unary' },
      { name: 'RegisterBot', type: 'unary' },
      { name: 'PostMessage', type: 'unary' },
      { name: 'ListSubscribe', type: 'server-stream' },
      { name: 'ActionSubscribe', type: 'server-stream' },
      { name: 'CustomRenderSubscribe', type: 'bidi' },
    ],
  },
  {
    name: 'StatementStoreService', methods: [
      { name: 'Subscribe', type: 'server-stream' },
      { name: 'CreateProof', type: 'unary' },
      { name: 'Submit', type: 'unary' },
    ],
  },
  {
    name: 'PreimageService', methods: [
      { name: 'LookupSubscribe', type: 'server-stream' },
    ],
  },
  {
    name: 'ChainService', methods: [
      { name: 'HeadFollow', type: 'server-stream' },
      { name: 'HeadHeader', type: 'unary' },
      { name: 'HeadBody', type: 'unary' },
      { name: 'HeadStorage', type: 'unary' },
      { name: 'HeadCall', type: 'unary' },
      { name: 'HeadUnpin', type: 'unary' },
      { name: 'HeadContinue', type: 'unary' },
      { name: 'HeadStopOperation', type: 'unary' },
      { name: 'SpecGenesisHash', type: 'unary' },
      { name: 'SpecChainName', type: 'unary' },
      { name: 'SpecProperties', type: 'unary' },
      { name: 'TransactionBroadcast', type: 'unary' },
      { name: 'TransactionStop', type: 'unary' },
    ],
  },
  {
    name: 'PaymentService', methods: [
      { name: 'BalanceSubscribe', type: 'server-stream' },
      { name: 'TopUp', type: 'unary' },
      { name: 'Request', type: 'unary' },
      { name: 'StatusSubscribe', type: 'server-stream' },
    ],
  },
  {
    name: 'EntropyService', methods: [
      { name: 'DeriveEntropy', type: 'unary' },
    ],
  },
];

interface Selection {
  service: string;
  method: string;
}

export function App({ clients }: { clients: ServiceClients }) {
  const [selection, setSelection] = useState<Selection | null>(null);

  if (!selection) {
    return <ServiceTable services={services} onSelect={(s, m) => setSelection({ service: s, method: m })} />;
  }

  return (
    <MethodView
      clients={clients}
      service={selection.service}
      method={selection.method}
      onBack={() => setSelection(null)}
    />
  );
}
