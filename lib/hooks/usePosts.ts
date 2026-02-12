import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { Post } from '../../types/entities.ts';
import { useAuth } from '../auth.tsx';

export const usePosts = () => {
    const { user } = useAuth();
    const uid = user?.uid;
    return useQuery<Post[]>({
        queryKey: ['posts'],
        queryFn: async () => {
            // FIX: Pass the required 'filters' argument (empty array) and use 'EXPLORE' as scope to satisfy the getFeed contract.
            const result = await dataService.social.getFeed(uid || 'guest', 'EXPLORE', []);
            return result.posts;
        },
    });
};