export function injectStyles(): void {
  const style = document.createElement('style');
  style.textContent = `
.rpc-demo {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  color: #333;
}
h1 { font-size: 1.5rem; border-bottom: 2px solid #4a90d9; padding-bottom: 8px; }
h2 { font-size: 1.1rem; color: #4a90d9; margin-top: 24px; }
.section { margin-bottom: 16px; }
.row { display: flex; gap: 8px; margin: 8px 0; align-items: center; }
input[type="text"] {
  flex: 1; padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px;
  font-size: 14px;
}
button {
  padding: 8px 16px; background: #4a90d9; color: white; border: none;
  border-radius: 4px; cursor: pointer; font-size: 14px; white-space: nowrap;
}
button:hover { background: #357abd; }
button:active { background: #2a5f9e; }
.log-panel {
  background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 4px;
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace; font-size: 12px;
  max-height: 300px; overflow-y: auto; min-height: 100px;
}
.chat-panel { min-height: 150px; max-height: 200px; }
.log-entry { margin: 2px 0; }
.log-error { margin: 2px 0; color: #f44; }
.chat-entry { margin: 2px 0; color: #8cd; }
`;
  document.head.appendChild(style);
}
