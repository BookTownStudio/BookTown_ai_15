
import { useQuery, useMutation, useQueryClient } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';
import { Conversation, DirectMessage } from '../../types/entities.ts';

export const useConversations = () => {
    const { user } = useAuth();
    const uid = user?.uid;
    return useQuery<Conversation[]>({
        queryKey: ['conversations', uid],
        queryFn: () => dataService.messaging.getConversations(uid!),
        enabled: !!uid,
    });
};

export const useChatHistory = (conversationId: string | undefined) => {
    const { user } = useAuth();
    const uid = user?.uid;
    return useQuery<DirectMessage[]>({
        queryKey: ['messages', conversationId],
        queryFn: () => dataService.messaging.getChatHistory(conversationId!),
        enabled: !!conversationId && !!uid,
    });
};

export const useSendMessage = (conversationId: string | undefined) => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: (text: string) => {
            if (!uid) throw new Error("Not authenticated");
            return dataService.messaging.sendMessage(uid, conversationId!, text);
        },
        onSuccess: () => {
            // FIX: Use invalidateQueries instead of invalidate.
            queryClient.invalidateQueries(['messages', conversationId]);
            queryClient.invalidateQueries(['conversations']);
        },
    });
};
