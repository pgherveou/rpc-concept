import { useRef, useEffect } from 'react';
import { useChatClient } from '../context.js';
import { useBidiChat } from '../hooks/useBidiChat.js';

export function ChatSection() {
  const client = useChatClient();
  const { chatEntries, startChat, sendMessage, stopChat } = useBidiChat(client);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatLogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }
  }, [chatEntries]);

  const handleSend = () => {
    const text = inputRef.current?.value.trim();
    if (!text) return;
    inputRef.current!.value = '';
    sendMessage(text);
  };

  return (
    <section className="section">
      <h2>Bidi Streaming: Chat</h2>
      <div className="row">
        <button id="btn-chat-start" onClick={startChat}>Start Chat</button>
        <button id="btn-chat-stop" onClick={stopChat}>End Chat</button>
      </div>
      <div className="row">
        <input id="input-chat" type="text" placeholder="Type a message..." ref={inputRef} />
        <button id="btn-chat-send" onClick={handleSend}>Send</button>
      </div>
      <div id="chat-log" className="log-panel chat-panel" ref={chatLogRef}>
        {chatEntries.map(entry => (
          <div key={entry.id} className="chat-entry">{entry.text}</div>
        ))}
      </div>
    </section>
  );
}
