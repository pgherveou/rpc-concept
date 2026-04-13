import { useState, useCallback, useRef } from 'react';

export interface LogEntry {
  id: number;
  message: string;
  isError: boolean;
  timestamp: string;
}

export function useLog() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const nextId = useRef(0);

  const addLog = useCallback((message: string, isError = false) => {
    const entry: LogEntry = {
      id: nextId.current++,
      message,
      isError,
      timestamp: new Date().toLocaleTimeString(),
    };
    setEntries(prev => [...prev, entry]);
  }, []);

  return { entries, addLog };
}
