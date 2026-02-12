
import { useMutation } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';

export const useCreateAffiliateLink = () => {
    return useMutation({
        mutationFn: (bookId: string) => dataService.partner.createAffiliateLink(bookId),
        onSuccess: (data) => {
            console.log("Generated link:", data.link);
        }
    });
};
