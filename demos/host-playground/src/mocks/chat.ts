import type { IChatServiceHandler } from '../../../proto/generated/server.js';
import {
  ChatRoomParticipation,
  type ChatRoomResponse,
  type SimpleGroupChatResponse,
  type ChatBotResponse,
  type ChatPostMessageResponse,
  type ChatRoomList,
  type ReceivedChatAction,
  type CustomMessageRenderRequest,
} from '../../../proto/generated/messages.js';

export const chatHandler: IChatServiceHandler = {
  async createRoom(): Promise<ChatRoomResponse> {
    return { result: { case: 'ok', value: { status: 0 } } };
  },
  async createSimpleGroup(): Promise<SimpleGroupChatResponse> {
    return { result: { case: 'ok', value: { status: 0, joinLink: 'https://mock.link/join' } } };
  },
  async registerBot(): Promise<ChatBotResponse> {
    return { result: { case: 'ok', value: { status: 0 } } };
  },
  async postMessage(): Promise<ChatPostMessageResponse> {
    return { result: { case: 'ok', value: { messageId: 'mock-msg-1' } } };
  },
  async *listSubscribe(): AsyncGenerator<ChatRoomList> {
    yield { rooms: [{ roomId: 'room-1', participatingAs: ChatRoomParticipation.CHAT_ROOM_PARTICIPATION_ROOM_HOST }] };
  },
  async *actionSubscribe(): AsyncGenerator<ReceivedChatAction> {
    yield { roomId: 'room-1', peer: 'peer-1', payload: { payload: { case: undefined } } };
  },
  async *customRenderSubscribe(): AsyncGenerator<CustomMessageRenderRequest> {
    yield { messageId: 'msg-1', messageType: 'mock', payload: new Uint8Array(0) };
  },
};
