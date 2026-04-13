import { useEffect, useRef } from 'react';
import type { LogEntry } from '../hooks/useLog.js';

interface LogPanelProps {
  id: string;
  entries: LogEntry[];
  className?: string;
}

export function LogPanel({ id, entries, className = 'log-panel' }: LogPanelProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [entries]);

  return (
    <div id={id} className={className} ref={ref}>
      {entries.map(entry => (
        <div key={entry.id} className={entry.isError ? 'log-error' : 'log-entry'}>
          [{entry.timestamp}] {entry.message}
        </div>
      ))}
    </div>
  );
}
