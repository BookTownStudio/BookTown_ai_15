import { wrapCallableV2 } from "../contracts/wrapCallableV2";
import {
  createDirectConversation as createDirectConversationRaw,
  listDirectConversations as listDirectConversationsRaw,
  listDirectMessages as listDirectMessagesRaw,
  sendDirectMessage as sendDirectMessageRaw,
  markDirectConversationRead as markDirectConversationReadRaw,
  acceptDirectMessageRequest as acceptDirectMessageRequestRaw,
  declineDirectMessageRequest as declineDirectMessageRequestRaw,
  reportDirectMessage as reportDirectMessageRaw,
  reportConversation as reportConversationRaw,
} from "../messaging/directMessages";

export const createDirectConversation = wrapCallableV2("createDirectConversation", createDirectConversationRaw);
export const listDirectConversations = wrapCallableV2("listDirectConversations", listDirectConversationsRaw);
export const listDirectMessages = wrapCallableV2("listDirectMessages", listDirectMessagesRaw);
export const sendDirectMessage = wrapCallableV2("sendDirectMessage", sendDirectMessageRaw);
export const markDirectConversationRead = wrapCallableV2("markDirectConversationRead", markDirectConversationReadRaw);
export const acceptDirectMessageRequest = wrapCallableV2("acceptDirectMessageRequest", acceptDirectMessageRequestRaw);
export const declineDirectMessageRequest = wrapCallableV2("declineDirectMessageRequest", declineDirectMessageRequestRaw);
export const reportDirectMessage = wrapCallableV2("reportDirectMessage", reportDirectMessageRaw);
export const reportConversation = wrapCallableV2("reportConversation", reportConversationRaw);
