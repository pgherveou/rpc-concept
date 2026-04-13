import { useEffect } from 'react';
import { UnarySection } from './components/UnarySection.js';
import { StreamSection } from './components/StreamSection.js';
import { ChatSection } from './components/ChatSection.js';
import { LogPanel } from './components/LogPanel.js';
import { useLog } from './hooks/useLog.js';

export function App() {
  const { entries, addLog } = useLog();

  useEffect(() => {
    addLog('UI initialized. Ready to test RPC methods.');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rpc-demo">
      <h1>RPC Bridge Demo</h1>
      <UnarySection addLog={addLog} />
      <StreamSection addLog={addLog} />
      <ChatSection />
      <section className="section">
        <h2>Log</h2>
        <LogPanel id="log" entries={entries} />
      </section>
    </div>
  );
}
