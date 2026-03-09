

import { useQuery, useMutation, useQueryClient } from '../react-query.ts';
import { useAuth } from '../auth.tsx';
import { ChatMessage, AgentSession } from '../../types/entities.ts';
import { callAgent } from '../agents-service.ts';
import { dataService } from '../../services/dataService.ts';

export const useAgentChat = (agentId?: string, sessionId?: string) => {
    const { user } = useAuth();
    const uid = user?.uid;
    const queryClient = useQueryClient();
    
    // Unique key for this chat session
    const queryKey = ['agentChat', uid, sessionId];

    const { data: messages, isLoading, isError } = useQuery<ChatMessage[]>({
        queryKey,
        queryFn: () => dataService.users.getChatHistory(uid!, sessionId!),
        enabled: !!uid && !!sessionId,
    });

    // FIX: Provide explicit string type to useMutation to resolve TVariables inferred as void.
    const { mutate: sendMessage, isLoading: isSending } = useMutation<any, string>({
        mutationFn: async (messageText: string) => {
            if (!uid || !sessionId || !agentId) throw new Error("Missing chat parameters");

            const userMessage: Omit<ChatMessage, 'id'> = {
                role: 'user',
                text: messageText,
                timestamp: new Date().toISOString(),
            };
            const currentHistory = queryClient.getQueryData<ChatMessage[]>(queryKey) || [];
            const latestMessage = currentHistory[currentHistory.length - 1];
            const historyWithLatestTurn =
                latestMessage?.role === 'user' && latestMessage.text === messageText
                    ? currentHistory
                    : [...currentHistory, { id: `local-${Date.now()}`, ...userMessage }];
            const context = historyWithLatestTurn
                .slice(-20)
                .map(m => ({ role: m.role, text: m.text }));

            try {
                const agentResponse = await callAgent(agentId, context);

                const modelMessage: Omit<ChatMessage, 'id'> = {
                    role: 'model',
                    text: agentResponse.responseText,
                    timestamp: new Date().toISOString(),
                };
                await dataService.users.saveAgentMessage(uid, sessionId, userMessage);
                await dataService.users.saveAgentMessage(uid, sessionId, modelMessage);

                await dataService.users.updateAgentSession(uid, sessionId, {
                    id: sessionId,
                    agentId,
                    lastMessage: agentResponse.responseText.substring(0, 50) + '...',
                    timestamp: new Date().toISOString(),
                });

                return agentResponse;
            } catch (error) {
                console.error("Failed to get agent response", error);

                const errorMessage: Omit<ChatMessage, 'id'> = {
                    role: 'model',
                    text: "I'm having trouble connecting to the library archives right now. Please try again in a moment.",
                    timestamp: new Date().toISOString(),
                };
                await dataService.users.saveAgentMessage(uid, sessionId, userMessage);
                await dataService.users.saveAgentMessage(uid, sessionId, errorMessage);
                await dataService.users.updateAgentSession(uid, sessionId, {
                    id: sessionId,
                    agentId,
                    lastMessage: messageText,
                    timestamp: new Date().toISOString(),
                });
                throw error;
            }
        },
        onMutate: async (messageText: string) => {
            // Cancel any outgoing refetches so they don't overwrite our optimistic update
            await queryClient.cancelQueries(queryKey);

            // Snapshot the previous value
            const previousMessages = queryClient.getQueryData<ChatMessage[]>(queryKey);

            // Optimistically add user message
            const optimisticUserMessage: ChatMessage = {
                id: `temp-${Date.now()}`,
                role: 'user',
                text: messageText,
                timestamp: new Date().toISOString(),
            };

            queryClient.setQueryData<ChatMessage[]>(queryKey, (old) => [...(old || []), optimisticUserMessage]);

            // Return context with the previous messages
            return { previousMessages };
        },
        onError: (err, newTodo, context: any) => {
             // On error, append a visible error bubble instead of rolling back the user's message
             queryClient.setQueryData<ChatMessage[]>(queryKey, (old) => {
                const errorMsg: ChatMessage = {
                    id: `error-${Date.now()}`,
                    role: 'model',
                    text: "I'm having trouble connecting right now. Please try again.",
                    timestamp: new Date().toISOString(),
                };
                return [...(old || []), errorMsg];
            });
        },
        onSettled: () => {
            // Always refetch after error or success to ensure data is in sync with server
            queryClient.invalidateQueries(queryKey);
            queryClient.invalidateQueries(['agentSessions', uid]);
        },
    });

    return { messages, isLoading, isError, sendMessage, isSending };
};

export const useAgentSessions = () => {
    const { user } = useAuth();
    const uid = user?.uid;
    return useQuery<AgentSession[]>({
        queryKey: ['agentSessions', uid],
        queryFn: () => dataService.users.getAgentSessions(uid!),
        enabled: !!uid,
    });
}

export const useTogglePinSession = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    // FIX: Provide explicit type for session pinning mutation.
    return useMutation<any, { sessionId: string, isPinned: boolean }>({
        mutationFn: async ({ sessionId, isPinned }: { sessionId: string, isPinned: boolean }) => {
            if (!uid) throw new Error("User not authenticated");
            return dataService.users.updateAgentSession(uid, sessionId, { isPinned });
        },
        onSuccess: () => {
             queryClient.invalidateQueries(['agentSessions', uid]);
        }
    })
}
