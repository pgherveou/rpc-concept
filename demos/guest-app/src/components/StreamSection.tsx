import { useRef } from 'react';
import { useClient } from '../context.js';

interface StreamSectionProps {
  addLog: (msg: string, isError?: boolean) => void;
}

export function StreamSection({ addLog }: StreamSectionProps) {
  const client = useClient();
  const abortRef = useRef<AbortController | undefined>(undefined);

  const handleStart = async () => {
    const nameInput = document.getElementById('input-name') as HTMLInputElement;
    const name = nameInput?.value.trim() || 'World';
    addLog(`Starting WatchGreeting("${name}")...`);

    abortRef.current = new AbortController();

    try {
      const stream = client.watchGreeting(
        { name, maxCount: 20, intervalMs: 1000 },
      );
      for await (const event of stream) {
        if (abortRef.current.signal.aborted) break;
        addLog(`[#${event.seq}] ${event.message}`);
      }
      addLog('Stream completed.');
    } catch (err) {
      if (String(err).includes('cancel') || String(err).includes('abort')) {
        addLog('Stream cancelled.');
      } else {
        addLog(`Stream error: ${err}`, true);
      }
    } finally {
      abortRef.current = undefined;
    }
  };

  const handleStop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      addLog('Cancelling stream...');
    }
  };

  return (
    <section className="section">
      <h2>Server Streaming: WatchGreeting</h2>
      <div className="row">
        <button id="btn-stream" onClick={handleStart}>Start Stream</button>
        <button id="btn-stop-stream" onClick={handleStop}>Stop Stream</button>
      </div>
    </section>
  );
}
