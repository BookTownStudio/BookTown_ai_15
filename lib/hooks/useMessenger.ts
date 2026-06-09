
import { useQuery, useMutation, useQueryClient } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';
import { Conversation, DirectMessage } from '../../types/entities.ts';

export const useConversations = (folder: 'inbox' | 'requests' = 'inbox') => {
    const { user } = useAuth();
    const uid = user?.uid;
    const normalizedFolder = folder === 'requests' ? 'requests' : 'inbox';
    return useQuery<Conversation[]>({
        queryKey: ['conversations', uid, normalizedFolder],
        queryFn: () => dataService.messaging.getConversations(uid!, normalizedFolder),
        enabled: !!uid,
        staleTime: 5_000,
        refetchInterval: 5_000,
    });
};

export const useChatHistory = (conversationId: string | undefined) => {
    const { user } = useAuth();
    const uid = user?.uid;
    return useQuery<DirectMessage[]>({
        queryKey: ['messages', uid, conversationId],
        queryFn: () => dataService.messaging.getChatHistory(conversationId!),
        enabled: !!conversationId && !!uid,
        staleTime: 1_000,
        refetchInterval: conversationId ? 2_500 : false,
    });
};

export const useSendMessage = (conversationId: string | undefined) => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: ({
            text,
            idempotencyKey,
            attachment,
        }: {
            text: string;
            idempotencyKey: string;
            attachment?: { type: 'book' | 'author' | 'shelf' | 'quote' | 'media' | 'venue' | 'publication'; entityId: string };
        }) => {
            if (!uid) throw new Error("Not authenticated");
            if (!conversationId) throw new Error("Missing conversationId");
            return dataService.messaging.sendMessage(
                uid,
                conversationId!,
                text,
                idempotencyKey,
                attachment
            );
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['messages', uid, conversationId] });
            queryClient.invalidateQueries({ queryKey: ['conversations', uid] });
        },
    });
};

export const useStartConversation = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: async (peerUid: string) => {
            if (!uid) throw new Error("Not authenticated");
            return dataService.messaging.createConversation(uid, peerUid);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversations', uid] });
        },
    });
};

export const useMarkConversationRead = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: async (conversationId: string) => {
            if (!uid) throw new Error("Not authenticated");
            return dataService.messaging.markConversationRead(uid, conversationId);
        },
        onSuccess: (_, conversationId) => {
            queryClient.invalidateQueries({ queryKey: ['messages', uid, conversationId] });
            queryClient.invalidateQueries({ queryKey: ['conversations', uid] });
        },
    });
};

export const useAcceptMessageRequest = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: async (conversationId: string) => {
            if (!uid) throw new Error("Not authenticated");
            return dataService.messaging.acceptMessageRequest(uid, conversationId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversations', uid] });
        },
    });
};

export const useDeclineMessageRequest = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: async (conversationId: string) => {
            if (!uid) throw new Error("Not authenticated");
            return dataService.messaging.declineMessageRequest(uid, conversationId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversations', uid] });
        },
    });
};

export const createMessageIdempotencyKey = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID().replace(/-/g, '');
    }
    return `${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
};
