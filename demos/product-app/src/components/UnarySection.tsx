import { useRef } from 'react';
import { useClient } from '../context.js';

interface UnarySectionProps {
  addLog: (msg: string, isError?: boolean) => void;
}

export function UnarySection({ addLog }: UnarySectionProps) {
  const client = useClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = async () => {
    const name = inputRef.current?.value.trim() || 'World';
    addLog(`Calling SayHello("${name}")...`);
    try {
      const response = await client.sayHello({ name, language: '' });
      addLog(`Response: ${response.message}`);
    } catch (err) {
      addLog(`Error: ${err}`, true);
    }
  };

  return (
    <section className="section">
      <h2>Unary RPC: SayHello</h2>
      <div className="row">
        <input id="input-name" type="text" placeholder="Enter name" defaultValue="World" ref={inputRef} />
        <button id="btn-hello" onClick={handleClick}>Say Hello</button>
      </div>
    </section>
  );
}
