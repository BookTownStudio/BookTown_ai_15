import { useMutation } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';

export const useAddReaction = () => {
    const { user } = useAuth();
    const uid = user?.uid;
    return useMutation({
        mutationFn: ({ entityId, reaction }: { entityId: string; reaction: string }) => {
            return dataService.social.addReaction(uid || 'guest', entityId, reaction);
        }
    });
};
