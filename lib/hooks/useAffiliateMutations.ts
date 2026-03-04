import { devLog } from '../logging/devLog';

import { useMutation } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';

export const useCreateAffiliateLink = () => {
    return useMutation({
        mutationFn: (bookId: string) => dataService.partner.createAffiliateLink(bookId),
        onSuccess: (data) => {
            devLog("Generated link:", data.link);
        }
    });
};
