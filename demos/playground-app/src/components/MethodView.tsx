import { useState } from 'react';
import type { ServiceClients } from '../setup-client.js';

const styles = {
  container: { padding: '24px', fontFamily: 'system-ui, sans-serif', maxWidth: '900px', margin: '0 auto' } as const,
  header: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' } as const,
  backBtn: { background: 'none', border: '1px solid #ddd', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', fontSize: '13px' } as const,
  title: { fontSize: '20px', fontWeight: 600, color: '#333' } as const,
  section: { background: '#fff', borderRadius: '8px', padding: '16px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' } as const,
  label: { fontSize: '12px', fontWeight: 600, color: '#666', textTransform: 'uppercase', marginBottom: '8px' } as const,
  textarea: { width: '100%', minHeight: '80px', fontFamily: 'monospace', fontSize: '13px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box', resize: 'vertical' } as const,
  callBtn: { background: '#2196f3', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 20px', cursor: 'pointer', fontSize: '14px', fontWeight: 500 } as const,
  response: { fontFamily: 'monospace', fontSize: '13px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#f5f5f5', padding: '12px', borderRadius: '4px', maxHeight: '400px', overflow: 'auto' } as const,
  error: { color: '#d32f2f' } as const,
  logEntry: { borderBottom: '1px solid #eee', padding: '4px 0', fontSize: '13px', fontFamily: 'monospace' } as const,
};

// Map service+method to a callable function on the clients
function getClientMethod(
  clients: ServiceClients,
  service: string,
  method: string,
): { call: (req: unknown) => Promise<unknown> | AsyncGenerator<unknown>; isStream: boolean } | null {
  const svcMap: Record<string, [keyof ServiceClients, string]> = {};
  // Build a lookup from ServiceName/MethodName -> [clientKey, methodName]
  const serviceKeys: Array<[string, keyof ServiceClients, string[]]> = [
    ['GeneralService', 'general', ['featureSupported', 'navigateTo', 'pushNotification']],
    ['PermissionsService', 'permissions', ['devicePermissionRequest', 'remotePermissionRequest']],
    ['LocalStorageService', 'localStorage', ['read', 'write', 'clear']],
    ['AccountService', 'account', ['getAccount', 'getAlias', 'createProof', 'getNonProductAccounts', 'connectionStatusSubscribe', 'getUserId']],
    ['SigningService', 'signing', ['signPayload', 'signRaw', 'createTransaction', 'createTransactionNonProduct']],
    ['ChatService', 'chat', ['createRoom', 'createSimpleGroup', 'registerBot', 'postMessage', 'listSubscribe', 'actionSubscribe', 'customRenderSubscribe']],
    ['StatementStoreService', 'statementStore', ['subscribe', 'createProof', 'submit']],
    ['PreimageService', 'preimage', ['lookupSubscribe']],
    ['ChainService', 'chain', ['headFollow', 'headHeader', 'headBody', 'headStorage', 'headCall', 'headUnpin', 'headContinue', 'headStopOperation', 'specGenesisHash', 'specChainName', 'specProperties', 'transactionBroadcast', 'transactionStop']],
    ['PaymentService', 'payment', ['balanceSubscribe', 'topUp', 'request', 'statusSubscribe']],
    ['EntropyService', 'entropy', ['deriveEntropy']],
  ];

  for (const [svcName, clientKey, methods] of serviceKeys) {
    for (const m of methods) {
      svcMap[`${svcName}/${m}`] = [clientKey, m];
    }
  }

  // Convert PascalCase method name to camelCase
  const camel = method.charAt(0).toLowerCase() + method.slice(1);
  const key = `${service}/${camel}`;
  const entry = svcMap[key];
  if (!entry) return null;

  const [clientKey, methodName] = entry;
  const client = clients[clientKey] as any;
  const fn = client[methodName];
  if (!fn) return null;

  // Detect if this is a streaming method
  const streamMethods = new Set([
    'connectionStatusSubscribe', 'listSubscribe', 'actionSubscribe', 'customRenderSubscribe',
    'subscribe', 'lookupSubscribe', 'headFollow', 'balanceSubscribe', 'statusSubscribe',
  ]);
  const isStream = streamMethods.has(methodName);

  return {
    call: (req: unknown) => fn.call(client, req),
    isStream,
  };
}

function getDefaultRequest(service: string, method: string): string {
  // Provide sensible defaults for some methods
  const defaults: Record<string, string> = {
    'GeneralService/FeatureSupported': '{ "feature": { "case": "chain", "value": {} } }',
    'GeneralService/NavigateTo': '{ "url": "https://example.com" }',
    'GeneralService/PushNotification': '{ "text": "Hello!", "deeplink": "app://home" }',
    'LocalStorageService/Read': '{ "key": "test-key" }',
    'LocalStorageService/Write': '{ "key": "test-key", "value": {} }',
    'LocalStorageService/Clear': '{ "key": "test-key" }',
    'EntropyService/DeriveEntropy': '{ "key": {} }',
  };
  return defaults[`${service}/${method}`] || '{}';
}

export function MethodView({
  clients,
  service,
  method,
  onBack,
}: {
  clients: ServiceClients;
  service: string;
  method: string;
  onBack: () => void;
}) {
  const [request, setRequest] = useState(getDefaultRequest(service, method));
  const [response, setResponse] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [streamLog, setStreamLog] = useState<string[]>([]);
  const [streamActive, setStreamActive] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const clientMethod = getClientMethod(clients, service, method);

  const handleCall = async () => {
    if (!clientMethod) return;
    setResponse('');
    setError('');
    setStreamLog([]);

    let parsed: unknown;
    try {
      parsed = JSON.parse(request);
    } catch (e) {
      setError('Invalid JSON request');
      return;
    }

    if (clientMethod.isStream) {
      setStreamActive(true);
      const ac = new AbortController();
      setAbortController(ac);

      try {
        const gen = clientMethod.call(parsed) as AsyncGenerator<unknown>;
        for await (const event of gen) {
          if (ac.signal.aborted) break;
          setStreamLog((prev) => [...prev, JSON.stringify(event, null, 2)]);
        }
        setStreamLog((prev) => [...prev, '--- stream ended ---']);
      } catch (e: any) {
        if (!ac.signal.aborted) {
          setError(e.message || String(e));
        }
      } finally {
        setStreamActive(false);
        setAbortController(null);
      }
    } else {
      setLoading(true);
      try {
        const result = await (clientMethod.call(parsed) as Promise<unknown>);
        setResponse(JSON.stringify(result, null, 2));
      } catch (e: any) {
        setError(e.message || String(e));
      } finally {
        setLoading(false);
      }
    }
  };

  const handleStop = () => {
    abortController?.abort();
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} data-testid="back-button" onClick={onBack}>Back</button>
        <div style={styles.title}>{service} / {method}</div>
      </div>

      <div style={styles.section}>
        <div style={styles.label}>Request</div>
        <textarea
          style={styles.textarea}
          data-testid="request-editor"
          value={request}
          onChange={(e) => setRequest(e.target.value)}
        />
        <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
          {clientMethod?.isStream ? (
            streamActive ? (
              <button style={{ ...styles.callBtn, background: '#d32f2f' }} data-testid="stop-button" onClick={handleStop}>Stop</button>
            ) : (
              <button style={styles.callBtn} data-testid="subscribe-button" onClick={handleCall}>Subscribe</button>
            )
          ) : (
            <button style={styles.callBtn} data-testid="call-button" onClick={handleCall} disabled={loading}>
              {loading ? 'Calling...' : 'Call'}
            </button>
          )}
        </div>
      </div>

      {(response || error || streamLog.length > 0) && (
        <div style={styles.section}>
          <div style={styles.label}>Response</div>
          {error && <div style={{ ...styles.response, ...styles.error }} data-testid="error-display">{error}</div>}
          {response && <div style={styles.response} data-testid="response-content">{response}</div>}
          {streamLog.length > 0 && (
            <div style={styles.response} data-testid="stream-log">
              {streamLog.map((entry, i) => (
                <div key={i} style={styles.logEntry} data-testid="stream-entry">{entry}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
