import { wrapCallableV2 } from "../contracts/wrapCallableV2";
import {
  createDirectConversation as createDirectConversationRaw,
  listDirectConversations as listDirectConversationsRaw,
  listDirectMessages as listDirectMessagesRaw,
  sendDirectMessage as sendDirectMessageRaw,
  markDirectConversationRead as markDirectConversationReadRaw,
} from "../messaging/directMessages";

export const createDirectConversation = wrapCallableV2("createDirectConversation", createDirectConversationRaw);
export const listDirectConversations = wrapCallableV2("listDirectConversations", listDirectConversationsRaw);
export const listDirectMessages = wrapCallableV2("listDirectMessages", listDirectMessagesRaw);
export const sendDirectMessage = wrapCallableV2("sendDirectMessage", sendDirectMessageRaw);
export const markDirectConversationRead = wrapCallableV2("markDirectConversationRead", markDirectConversationReadRaw);
