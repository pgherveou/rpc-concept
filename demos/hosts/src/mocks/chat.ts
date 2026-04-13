import type { IChatServiceHandler } from '../../../proto/generated/server.js';
import {
  ChatRoomRegistrationStatus,
  ChatRoomParticipation,
  ChatBotRegistrationStatus,
  type ChatRoomRequest,
  type ChatRoomResponse,
  type SimpleGroupChatRequest,
  type SimpleGroupChatResponse,
  type ChatBotRequest,
  type ChatBotResponse,
  type ChatPostMessageRequest,
  type ChatPostMessageResponse,
  type ChatRoomList,
  type ChatRoom,
  type ReceivedChatAction,
  type CustomRendererNode,
  type CustomMessageRenderRequest,
} from '../../../proto/generated/messages.js';

// In-memory state shared across handler methods.
const rooms = new Map<string, ChatRoom>();
const bots = new Set<string>();
let msgSeq = 0;

// Listeners notified when the room list changes.
type ListListener = (list: ChatRoomList) => void;
let listListeners: ListListener[] = [];

function currentRoomList(): ChatRoomList {
  return { rooms: [...rooms.values()] };
}

function notifyListListeners() {
  const snapshot = currentRoomList();
  for (const fn of listListeners) fn(snapshot);
}

export const chatHandler: IChatServiceHandler = {
  async createRoom(request: ChatRoomRequest): Promise<ChatRoomResponse> {
    if (rooms.has(request.roomId)) {
      return {
        result: {
          case: 'ok',
          value: { status: ChatRoomRegistrationStatus.CHAT_ROOM_REGISTRATION_STATUS_EXISTS },
        },
      };
    }
    rooms.set(request.roomId, {
      roomId: request.roomId,
      participatingAs: ChatRoomParticipation.CHAT_ROOM_PARTICIPATION_ROOM_HOST,
    });
    notifyListListeners();
    return {
      result: {
        case: 'ok',
        value: { status: ChatRoomRegistrationStatus.CHAT_ROOM_REGISTRATION_STATUS_NEW },
      },
    };
  },

  async createSimpleGroup(request: SimpleGroupChatRequest): Promise<SimpleGroupChatResponse> {
    const exists = rooms.has(request.roomId);
    if (!exists) {
      rooms.set(request.roomId, {
        roomId: request.roomId,
        participatingAs: ChatRoomParticipation.CHAT_ROOM_PARTICIPATION_ROOM_HOST,
      });
      notifyListListeners();
    }
    return {
      result: {
        case: 'ok',
        value: {
          status: exists
            ? ChatRoomRegistrationStatus.CHAT_ROOM_REGISTRATION_STATUS_EXISTS
            : ChatRoomRegistrationStatus.CHAT_ROOM_REGISTRATION_STATUS_NEW,
          joinLink: `https://mock.link/join/${request.roomId}`,
        },
      },
    };
  },

  async registerBot(request: ChatBotRequest): Promise<ChatBotResponse> {
    if (bots.has(request.botId)) {
      return {
        result: {
          case: 'ok',
          value: { status: ChatBotRegistrationStatus.CHAT_BOT_REGISTRATION_STATUS_EXISTS },
        },
      };
    }
    bots.add(request.botId);
    return {
      result: {
        case: 'ok',
        value: { status: ChatBotRegistrationStatus.CHAT_BOT_REGISTRATION_STATUS_NEW },
      },
    };
  },

  async postMessage(request: ChatPostMessageRequest): Promise<ChatPostMessageResponse> {
    const messageId = `msg-${++msgSeq}`;
    return { result: { case: 'ok', value: { messageId } } };
  },

  async *listSubscribe(): AsyncGenerator<ChatRoomList> {
    // Emit current snapshot immediately.
    yield currentRoomList();

    // Keep stream open and push updates on room changes.
    const queue: ChatRoomList[] = [];
    let wake: (() => void) | null = null;
    const listener: ListListener = list => {
      queue.push(list);
      if (wake) { wake(); wake = null; }
    };
    listListeners.push(listener);
    try {
      while (true) {
        if (queue.length === 0) {
          await new Promise<void>(r => { wake = r; });
        }
        while (queue.length > 0) {
          yield queue.shift()!;
        }
      }
    } finally {
      listListeners = listListeners.filter(l => l !== listener);
    }
  },

  async *actionSubscribe(): AsyncGenerator<ReceivedChatAction> {
    // Simulate a peer message arriving after a short delay.
    await new Promise(r => setTimeout(r, 500));
    yield {
      roomId: 'room-1',
      peer: 'alice',
      payload: {
        payload: {
          case: 'messagePosted',
          value: { content: { case: 'text', value: 'Hello from Alice!' } },
        },
      },
    };
  },

  async *customRenderSubscribe(
    requests: AsyncIterable<CustomRendererNode>,
  ): AsyncGenerator<CustomMessageRenderRequest> {
    // Send an initial render request then echo for each incoming node.
    yield { messageId: 'custom-1', messageType: 'poll', payload: new Uint8Array([0x01]) };
    for await (const _node of requests) {
      yield { messageId: 'custom-2', messageType: 'poll-update', payload: new Uint8Array([0x02]) };
    }
  },
};
