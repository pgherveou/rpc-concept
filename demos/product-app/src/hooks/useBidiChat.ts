import { useRef, useState, useCallback } from 'react';
import type { ChatServiceClient } from '../../../proto/generated/client.js';
import type { ChatMessage } from '../../../proto/generated/messages.js';

export interface ChatEntry {
  id: number;
  text: string;
}

interface ChatState {
  queue: ChatMessage[];
  resolve: ((value: IteratorResult<ChatMessage>) => void) | undefined;
  seq: number;
  done: boolean;
  abort: AbortController | undefined;
  nextEntryId: number;
}

function freshState(): ChatState {
  return { queue: [], resolve: undefined, seq: 0, done: false, abort: undefined, nextEntryId: 0 };
}

export function useBidiChat(client: ChatServiceClient) {
  const [chatEntries, setChatEntries] = useState<ChatEntry[]>([]);
  const state = useRef<ChatState>(freshState());

  const addChatEntry = useCallback((text: string) => {
    const id = state.current.nextEntryId++;
    setChatEntries(prev => [...prev, { id, text }]);
  }, []);

  const startChat = useCallback(() => {
    const s = state.current;
    s.seq = 0;
    s.done = false;
    s.queue = [];
    setChatEntries([]);

    s.abort = new AbortController();

    const inputIterable: AsyncIterable<ChatMessage> = {
      [Symbol.asyncIterator]() {
        return {
          next(): Promise<IteratorResult<ChatMessage>> {
            const s = state.current;
            if (s.queue.length > 0) {
              return Promise.resolve({ done: false, value: s.queue.shift()! });
            }
            if (s.done) {
              return Promise.resolve({ done: true, value: undefined as unknown as ChatMessage });
            }
            return new Promise((resolve) => {
              state.current.resolve = resolve;
            });
          },
          return(): Promise<IteratorResult<ChatMessage>> {
            state.current.done = true;
            return Promise.resolve({ done: true, value: undefined as unknown as ChatMessage });
          },
        };
      },
    };

    addChatEntry('Chat started. Type messages below.');

    (async () => {
      try {
        const responses = client.chat(inputIterable);
        for await (const msg of responses) {
          if (state.current.abort?.signal.aborted) break;
          addChatEntry(`[${msg.from}] ${msg.text}`);
        }
        addChatEntry('Chat ended.');
      } catch (err) {
        if (!String(err).includes('cancel') && !String(err).includes('abort')) {
          addChatEntry(`Chat error: ${err}`);
        } else {
          addChatEntry('Chat cancelled.');
        }
      }
    })();
  }, [client, addChatEntry]);

  const sendMessage = useCallback((text: string) => {
    const s = state.current;
    s.seq++;
    const msg: ChatMessage = { from: 'user', text, seq: BigInt(s.seq), timestamp: 0n };
    addChatEntry(`[you] ${text}`);

    if (s.resolve) {
      const resolve = s.resolve;
      s.resolve = undefined;
      resolve({ done: false, value: msg });
    } else {
      s.queue.push(msg);
    }
  }, [addChatEntry]);

  const stopChat = useCallback(() => {
    const s = state.current;
    s.done = true;
    if (s.resolve) {
      const resolve = s.resolve;
      s.resolve = undefined;
      resolve({ done: true, value: undefined as unknown as ChatMessage });
    }
    if (s.abort) {
      s.abort.abort();
      s.abort = undefined;
    }
  }, []);

  return { chatEntries, startChat, sendMessage, stopChat };
}
